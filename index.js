require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Botは24時間稼働中です！'));
app.listen(port, () => console.log(`Webサーバー起動: ${port}`));

const { Client, GatewayIntentBits, REST, Routes, ActivityType, Collection } = require('discord.js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDatabase() {
    await pool.query(`CREATE TABLE IF NOT EXISTS message_counts (user_id TEXT, guild_id TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (user_id, guild_id));`);
    await pool.query(`CREATE TABLE IF NOT EXISTS omikuji_cooldowns (user_id TEXT, guild_id TEXT, last_date TEXT, PRIMARY KEY (user_id, guild_id));`);
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

// 📊 グラフの数式（二次関数）
function getRequiredMessages(level) {
    return Math.floor(10 + (level * level * 2));
}

function getLevelInfo(totalCount) {
    let level = 0;
    let count = totalCount;

    while (true) {
        let required = getRequiredMessages(level);
        if (count >= required) {
            count -= required;
            level++;
        } else {
            return { level, current: count, required: required };
        }
    }
}

client.once('ready', async () => {
    await initDatabase();
    console.log(`${client.user.tag} でログインしました！`);

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('スラッシュコマンドの登録を開始します...');
        const commandsData = client.commands.map(cmd => cmd.data.toJSON());
        
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandsData },
        );
        console.log('✨ スラッシュコマンドの登録が完了しました！');
    } catch (error) {
        console.error('コマンド登録エラー:', error);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    try {
        const query = `
            INSERT INTO message_counts (user_id, guild_id, count) 
            VALUES ($1, $2, 1) 
            ON CONFLICT(user_id, guild_id) 
            DO UPDATE SET count = message_counts.count + 1 
            RETURNING count;
        `;
        const res = await pool.query(query, [message.author.id, message.guild.id]);
        const newCount = res.rows[0].count;

        const oldInfo = getLevelInfo(newCount - 1);
        const newInfo = getLevelInfo(newCount);

        if (newInfo.level > oldInfo.level) {
            const settingRes = await pool.query(
                `SELECT level_channel_id FROM guild_settings WHERE guild_id = $1`,
                [message.guild.id]
            );

            let targetChannel = message.channel; 
            if (settingRes.rows.length > 0 && settingRes.rows[0].level_channel_id) {
                const fetchedChannel = message.guild.channels.cache.get(settingRes.rows[0].level_channel_id);
                if (fetchedChannel) {
                    targetChannel = fetchedChannel;
                }
            }

            await targetChannel.send(`🎉  ${message.author} おめでとうございます！レベル **${newInfo.level}** にアップしました！`);
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
