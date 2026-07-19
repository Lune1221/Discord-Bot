// Renderのスリープを防ぐためのWebサーバー設定
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Botは24時間元気に稼働中です！'));
app.listen(port, () => console.log(`Webサーバーがポート ${port} で起動しました`));

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS message_counts (
            user_id TEXT,
            guild_id TEXT,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, guild_id)
        );
    `);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const commands = [
    new SlashCommandBuilder()
        .setName('count')
        .setDescription('このサーバーでのあなたの発言数を表示します'),
    new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('このサーバーの発言数ランキングを表示します'),
    new SlashCommandBuilder()
        .setName('scan')
        .setDescription('【管理者専用】過去のメッセージをすべて遡って集計します（最初の1回のみ実行）')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 過去のメッセージを一括スキャンしてSupabaseに高速保存する関数
async function fetchAllMessages(guild) {
    console.log(`[${guild.name}] の過去メッセージをスキャン中...`);
    const textChannels = guild.channels.cache.filter(c => c.isTextBased());
    
    // 一時的にメモリ上でカウントを合算するための連想配列
    const localCounts = {};

    for (const [channelId, channel] of textChannels) {
        let lastId = null;
        while (true) {
            try {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                const messages = await channel.messages.fetch(options);
                if (messages.size === 0) break;

                for (const msg of messages.values()) {
                    if (msg.author.bot) continue;
                    const uId = msg.author.id;
                    localCounts[uId] = (localCounts[uId] || 0) + 1;
                }

                lastId = messages.last().id;
            } catch (error) {
                console.log(`⚠️  チャンネル [${channel.name}] は権限がないためスキップしました。`);
                break;
            }
        }
    }

    // 🟢 集計したデータをSupabaseへまとめて高速保存（超高速化）
    console.log('Supabaseへデータを一括送信中...');
    const queryText = `
        INSERT INTO message_counts (user_id, guild_id, count) 
        VALUES ($1, $2, $3)
        ON CONFLICT(user_id, guild_id) DO UPDATE SET count = message_counts.count + $3
    `;

    for (const [uId, totalCount] of Object.entries(localCounts)) {
        await pool.query(queryText, [uId, guild.id, totalCount]);
    }

    console.log(`[${guild.name}] のスキャンとSupabaseへの保存が完了しました！`);
}

client.once('ready', async () => {
    console.log(`${client.user.tag} が起動しました！`);
    try {
        await initDatabase();
        console.log('データベースの接続・初期化に成功しました！');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('スラッシュコマンドの登録が完了しました！');
    } catch (error) {
        console.error(error);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    try {
        const queryText = `
            INSERT INTO message_counts (user_id, guild_id, count) 
            VALUES ($1, $2, 1)
            ON CONFLICT(user_id, guild_id) DO UPDATE SET count = message_counts.count + 1
        `;
        await pool.query(queryText, [message.author.id, message.guild.id]);
    } catch (error) {
        console.error('リアルタイムカウントの保存に失敗しました:', error);
    }
});

async function generateRankingPage(guild, currentPageId, currentUserId) {
    const res = await pool.query(
        "SELECT user_id, count FROM message_counts WHERE guild_id = $1 ORDER BY count DESC",
        [guild.id]
    );
    const allRows = res.rows;
    
    const activeUsers = [];
    let myRank = '圏外';
    let myCount = 0;

    let activeRank = 0;
    for (let i = 0; i < allRows.length; i++) {
        const userId = allRows[i].user_id;
        const count = allRows[i].count;
        const user = client.users.cache.get(userId);

        if (user && user.bot) continue;

        activeRank++;
        activeUsers.push({ rank: activeRank, userId: userId, count: count });

        if (userId === currentUserId) {
            myRank = `${activeRank}位`;
            myCount = count;
        }
    }

    if (activeUsers.length === 0) return { embeds: [], components: [], error: 'データがありません' };

    const maxPages = Math.ceil(activeUsers.length / 10);
    let page = currentPageId;
    if (page < 1) page = 1;
    if (page > maxPages) page = maxPages;

    const start = (page - 1) * 10;
    const end = start + 10;
    const pageUsers = activeUsers.slice(start, end);

    let rankingText = '';
    const medals = ['🥇', '🥈', '🥉'];

    for (const u of pageUsers) {
        const medal = medals[u.rank - 1] || `  ${u.rank}位.`;
        rankingText += `${medal} <@${u.userId}>: **${u.count}回**\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`🏆 発言数ランキング (${page} / ${maxPages} ページ)`)
        .setDescription(rankingText)
        .setColor('#FFD700')
        .addFields({ name: '👤 あなたの現在の順位', value: `**${myRank}** (${myCount}回)`, inline: false })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`prev_${page}`)
            .setLabel('前へ ◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 1),
        new ButtonBuilder()
            .setCustomId('next_' + page)
            .setLabel('▶ 次へ')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === maxPages)
    );

    return { embeds: [embed], components: [row] };
}

client.on('interactionCreate', async (interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return;

    if (interaction.isChatInputCommand() && interaction.commandName === 'count') {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const res = await pool.query(
            "SELECT count FROM message_counts WHERE user_id = $1 AND guild_id = $2",
            [userId, guildId]
        );
        const rows = res.rows;
        const count = rows.length > 0 ? rows[0].count : 0;
        
        await interaction.editReply({
            content: `<@${userId}> さんのこのサーバーでの総発言数は **${count}回** です！`
        });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'ranking') {
        await interaction.deferReply();
        await interaction.guild.members.fetch();

        const pageData = await generateRankingPage(interaction.guild, 1, interaction.user.id);
        if (pageData.error) {
            return await interaction.editReply({ content: 'まだこのサーバーに発言データがありません。管理者は `/scan` を実行してください。' });
        }

        await interaction.editReply({ embeds: pageData.embeds, components: pageData.components });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'scan') {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({ content: '過去のメッセージをすべてSupabaseに高速スキャン・同期しています...' });
        
        await interaction.guild.members.fetch();
        await fetchAllMessages(interaction.guild);
        
        await interaction.editReply({ content: '✅ 過去ログのスキャンとSupabaseへの保存が完全に完了しました！コードを更新してもデータはもう消えません！' });
    }

    if (interaction.isButton()) {
        const [action, pageStr] = interaction.customId.split('_');
        let page = parseInt(pageStr, 10);

        if (action === 'prev') page--;
        if (action === 'next') page++;

        const pageData = await generateRankingPage(interaction.guild, page, interaction.user.id);
        await interaction.update({ embeds: pageData.embeds, components: pageData.components });
    }
});

client.login(TOKEN);
