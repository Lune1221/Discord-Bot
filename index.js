// Renderのスリープを防ぐためのWebサーバー設定
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Botは24時間元気に稼働中です！'));
app.listen(port, () => console.log(`Webサーバーがポート ${port} で起動しました`));

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('better-sqlite3');
require('dotenv').config();

const db = new Database('database.db');

db.prepare(`
    CREATE TABLE IF NOT EXISTS message_counts (
        user_id TEXT,
        guild_id TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, guild_id)
    )
`).run();

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
        .setDescription('このサーバーでのあなたの発言数を全員に表示します'),
    new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('このサーバーの発言数ランキングを表示します（ページ切り替え機能付き）')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 過去のメッセージを一括スキャンする関数
async function fetchAllMessages(guild) {
    console.log(`[${guild.name}] の過去メッセージをスキャン中...`);
    const textChannels = guild.channels.cache.filter(c => c.isTextBased());
    
    const insertOrUpdate = db.prepare(`
        INSERT INTO message_counts (user_id, guild_id, count) 
        VALUES (?, ?, 1)
        ON CONFLICT(user_id, guild_id) DO UPDATE SET count = count + 1
    `);

    const transaction = db.transaction((messages) => {
        for (const msg of messages) {
            if (msg.author.bot) continue;
            insertOrUpdate.run(msg.author.id, guild.id);
        }
    });
    
    for (const [channelId, channel] of textChannels) {
        let lastId = null;
        while (true) {
            try {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                const messages = await channel.messages.fetch(options);
                if (messages.size === 0) break;

                transaction(messages.values());

                lastId = messages.last().id;
            } catch (error) {
                console.log(`⚠️  チャンネル [${channel.name}] は権限がないためスキップしました。`);
                break;
            }
        }
    }
    console.log(`[${guild.name}] のスキャンとデータベース保存が完了しました！`);
}

client.once('ready', async () => {
    console.log(`${client.user.tag} が起動しました！`);
    try {
        console.log('スラッシュコマンドを登録中...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('スラッシュコマンドの登録が完了しました！');

        const rowCount = db.prepare("SELECT COUNT(*) as count FROM message_counts").get();
        if (rowCount.count === 0) {
            for (const [_, guild] of client.guilds.cache) {
                await fetchAllMessages(guild);
            }
        } else {
            console.log("すでにデータが保存されているため、過去スキャンをスキップしました（通常起動）");
        }
    } catch (error) {
        console.error(error);
    }
});

client.on('messageCreate', (message) => {
    if (message.author.bot || !message.guild) return;
    const insertOrUpdate = db.prepare(`
        INSERT INTO message_counts (user_id, guild_id, count) 
        VALUES (?, ?, 1)
        ON CONFLICT(user_id, guild_id) DO UPDATE SET count = count + 1
    `);
    insertOrUpdate.run(message.author.id, message.guild.id);
});
// 指定されたページのランキング埋め込みとボタンを生成するヘルパー関数
async function generateRankingPage(guild, currentPageId, currentUserId) {
    const allRows = db.prepare("SELECT user_id, count FROM message_counts WHERE guild_id = ? ORDER BY count DESC").all(guild.id);
    
    // Botを除外した「有効なユーザーリスト」を作る
    const activeUsers = [];
    let myRank = '圏外';
    let myCount = 0;

    let activeRank = 0;
    for (let i = 0; i < allRows.length; i++) {
        const userId = allRows[i].user_id;
        const count = allRows[i].count;
        const user = client.users.cache.get(userId);

        if (user && user.bot) continue; // Botは除外

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

    // 1ページ10人ずつ切り出す
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

    // ページ切り替え用のボタン作成
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`prev_${page}`)
            .setLabel('前へ ◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 1), // 1ページ目なら「前へ」を押せなくする
        new ButtonBuilder()
            .setCustomId(`next_${page}`)
            .setLabel('▶ 次へ')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === maxPages) // 最後のページなら「次へ」を押せなくする
    );

    return { embeds: [embed], components: [row] };
}

// インタラクション（コマンド・ボタン）処理
client.on('interactionCreate', async (interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return;

    // 1. /count コマンドの処理
    if (interaction.isChatInputCommand() && interaction.commandName === 'count') {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const row = db.prepare("SELECT count FROM message_counts WHERE user_id = ? AND guild_id = ?").get(userId, guildId);
        const count = row ? row.count : 0;
        
        await interaction.editReply({
            content: `<@${userId}> さんのこのサーバーでの総発言数は **${count}回** です！`
        });
    }

    // 2. /ranking コマンドの処理
    if (interaction.isChatInputCommand() && interaction.commandName === 'ranking') {
        await interaction.deferReply();
        await interaction.guild.members.fetch();

        const pageData = await generateRankingPage(interaction.guild, 1, interaction.user.id);
        if (pageData.error) {
            return await interaction.editReply({ content: 'まだこのサーバーに発言データがありません。' });
        }

        await interaction.editReply({ embeds: pageData.embeds, components: pageData.components });
    }

    // 3. 🟢 ボタン（「前へ」「次へ」）が押されたときの処理（修正版）
    if (interaction.isButton()) {
        const [action, pageStr] = interaction.customId.split('_');
        let page = parseInt(pageStr, 10);

        if (action === 'prev') page--;
        if (action === 'next') page++;

        await interaction.guild.members.fetch();
        const pageData = await generateRankingPage(interaction.guild, page, interaction.user.id);
        
        // 🟢 deferUpdate の代わりに、ボタンの応答として直接画面を最新のページに更新（上書き）します
        await interaction.update({ embeds: pageData.embeds, components: pageData.components });
    }
});

client.login(TOKEN);
