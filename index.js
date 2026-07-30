require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.send('Botは24時間稼働中です！'));
app.listen(port, () => console.log(`Webサーバー起動: ${port}`));

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS message_counts (user_id TEXT, guild_id TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (user_id, guild_id));
        CREATE TABLE IF NOT EXISTS omikuji_cooldowns (user_id TEXT, guild_id TEXT, last_date TEXT, PRIMARY KEY (user_id, guild_id));
        CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, level_channel_id TEXT);
        CREATE TABLE IF NOT EXISTS sticky_messages (channel_id VARCHAR(32) PRIMARY KEY, message_id VARCHAR(32), title TEXT, description TEXT);
        CREATE TABLE IF NOT EXISTS scheduled_messages (id SERIAL PRIMARY KEY, guild_id TEXT, channel_id TEXT, author_id TEXT, message_content TEXT, send_at TIMESTAMP);
        CREATE TABLE IF NOT EXISTS intro_channel_settings (id SERIAL PRIMARY KEY, guild_id TEXT, source_channel_id TEXT, keyword TEXT DEFAULT '名前：');
        CREATE TABLE IF NOT EXISTS antiraid_settings (guild_id TEXT PRIMARY KEY, enabled BOOLEAN DEFAULT FALSE);
    `);
}

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates] 
});

// コマンドの読み込み
client.commands = new Collection();
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
    const cmd = require(path.join(__dirname, 'commands', file));
    if ('data' in cmd && 'execute' in cmd) client.commands.set(cmd.data.name, cmd);
}

// イベントの自動読み込み
for (const file of fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'))) {
    const event = require(path.join(__dirname, 'events', file));
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client, pool));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client, pool));
    }
}

initDatabase();
client.login(process.env.DISCORD_TOKEN);
