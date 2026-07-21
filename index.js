require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Botは24時間元気に稼働中です！'));
app.listen(port, () => console.log(`Webサーバー起動: ${port}`));

const { Client, GatewayIntentBits, REST, Routes, ActivityType, Collection } = require('discord.js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path'); // 念のためpathの読み込みも記述
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDatabase() {
    await pool.query(`CREATE TABLE IF NOT EXISTS message_counts (user_id TEXT, guild_id TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (user_id, guild_id));`);
    await pool.query(`CREATE TABLE IF NOT EXISTS omikuji_cooldowns (user_id TEXT, guild_id TEXT, last_date TEXT, PRIMARY KEY (user_id, guild_id));`);
    
    // 🟢 【追加】通知チャンネル設定を保存するテーブル
    await pool.query(`CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, level_channel_id TEXT);`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
if (fs.existsSync(foldersPath)) {
    const commandFiles = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(foldersPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
}

client.once('ready', async () => {
    await initDatabase();
    console.log(`${client.user.tag} でログインしました！`);
});

// 🟢 【変更】メッセージ送信時のカウントアップ ＆ レベルアップ判定・通知処理
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    try {
        // 1. カウントを更新しつつ、更新後のカウントを取得する (RETURNING count)
        const query = `
            INSERT INTO message_counts (user_id, guild_id, count) 
            VALUES ($1, $2, 1) 
            ON CONFLICT(user_id, guild_id) 
            DO UPDATE SET count = message_counts.count + 1 
            RETURNING count;
        `;
        const res = await pool.query(query, [message.author.id, message.guild.id]);
        const newCount = res.rows[0].count;

        // 2. レベル計算（例：10メッセージごとに1レベル）
        const oldLevel = Math.floor((newCount - 1) / 10);
        const newLevel = Math.floor(newCount / 10);

        // 3. レベルが上がっていた場合、通知を送る
        if (newLevel > oldLevel) {
            // サーバーごとの通知チャンネル設定を取得
            const settingRes = await pool.query(
                `SELECT level_channel_id FROM guild_settings WHERE guild_id = $1`,
                [message.guild.id]
            );

            // デフォルトは今メッセージが投稿されたチャンネル
            let targetChannel = message.channel; 

            // 設定チャンネルが保存されていればそちらを優先
            if (settingRes.rows.length > 0 && settingRes.rows[0].level_channel_id) {
                const fetchedChannel = message.guild.channels.cache.get(settingRes.rows[0].level_channel_id);
                if (fetchedChannel) {
                    targetChannel = fetchedChannel;
                }
            }

            // お祝いメッセージを送信
            await targetChannel.send(`🎉 おめでとうございます ${message.author} さん！レベル **${newLevel}** にアップしました！`);
        }
    } catch (e) { 
        console.error(e); 
    }
});

client.on('interactionCreate', async (interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return;

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await interaction.deferReply({ ephemeral: interaction.commandName === 'scan' });
            await command.execute(interaction, pool);
        } catch (error) {
            console.error(error);
        }
    }

    if (interaction.isButton()) {
        const [action, pageStr, executorId] = interaction.customId.split('_');
        if (interaction.user.id !== executorId) { return await interaction.reply({ content: '❌ 本人しか操作できません。', ephemeral: true }); }
        
        const rankingCommand = client.commands.get('ranking');
        if (!rankingCommand) return;
        
        let page = parseInt(pageStr, 10) + (action === 'prev' ? -1 : 1);
        await rankingCommand.executeButton(interaction, pool, page, executorId);
    }
});

client.login(TOKEN);
