const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
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
        .setDescription('このサーバーの発言数ランキングTOP10を表示します')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 過去メッセージの一括スキャン関数
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

// リアルタイム発言のカウント処理
client.on('messageCreate', (message) => {
    if (message.author.bot || !message.guild) return;

    const insertOrUpdate = db.prepare(`
        INSERT INTO message_counts (user_id, guild_id, count) 
        VALUES (?, ?, 1)
        ON CONFLICT(user_id, guild_id) DO UPDATE SET count = count + 1
    `);
    insertOrUpdate.run(message.author.id, message.guild.id);
});

// スラッシュコマンド・ボタンの処理
client.on('interactionCreate', async (interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return;

    // 1. /count コマンドの処理
    if (interaction.isChatInputCommand() && interaction.commandName === 'count') {
        const userId = interaction.user.id;
        const row = db.prepare("SELECT count FROM message_counts WHERE user_id = ? AND guild_id = ?").get(userId, guildId);
        const count = row ? row.count : 0;
        
        await interaction.reply({
            content: `<@${userId}> さんのこのサーバーでの発言数は **${count}回** です！`
        });
    }

    // 2. /ranking コマンドの処理
    if (interaction.isChatInputCommand() && interaction.commandName === 'ranking') {
        await interaction.deferReply();

        const allRows = db.prepare("SELECT user_id, count FROM message_counts WHERE guild_id = ? ORDER BY count DESC").all(guildId);
        
        if (allRows.length === 0) {
            return await interaction.editReply({ content: 'まだこのサーバーに発言データがありません。' });
        }

        await interaction.guild.members.fetch();

        let rankingText = '';
        const medals = ['🥇', '🥈', '🥉'];
        let myRank = '圏外';
        let myCount = 0;

        let activeRank = 0;
        for (let i = 0; i < allRows.length; i++) {
            const userId = allRows[i].user_id;
            const count = allRows[i].count;
            const user = client.users.cache.get(userId);

            if (user && user.bot) continue; // Bot除外

            activeRank++;

            if (activeRank <= 10) {
                const medal = medals[activeRank - 1] || `  ${activeRank}位.`;
                rankingText += `${medal} <@${userId}>: **${count}回**\n`;
            }

            if (userId === interaction.user.id) {
                myRank = `${activeRank}位`;
                myCount = count;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('発言数ランキング (TOP 10)')
            .setDescription(rankingText || '有効なユーザーの発言がありません。')
            .setColor('#FFD700')
            .addFields({ name: 'あなたの現在の順位', value: `**${myRank}** (${myCount}回)`, inline: false })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('view_all_ranking')
                .setLabel('全員の順位を表示')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }

    // 3. ボタン（全員の順位を表示）が押されたときの処理
    if (interaction.isButton() && interaction.customId === 'view_all_ranking') {
        await interaction.deferReply({ ephemeral: true });

        const allRows = db.prepare("SELECT user_id, count FROM message_counts WHERE guild_id = ? ORDER BY count DESC").all(guildId);
        
        let fileContent = `【${interaction.guild.name}】発言数全順位リスト（Bot除外）\n`;
        fileContent += `========================================\n\n`;

        let activeRank = 0;
        for (let i = 0; i < allRows.length; i++) {
            const userId = allRows[i].user_id;
            const count = allRows[i].count;
            const user = client.users.cache.get(userId);

            if (user && user.bot) continue;

            activeRank++;

            const username = user ? user.username : '退会したユーザー';
            fileContent += `${activeRank}位: ${username} (${count}回)\n`;
        }

        const buffer = Buffer.from(fileContent, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: 'all_ranking.txt' });

        await interaction.editReply({
            content: 'サーバー内の全員の順位ファイルを生成しました！以下からダウンロードして確認できます。',
            files: [attachment]
        });
    }
});

client.login(TOKEN);
