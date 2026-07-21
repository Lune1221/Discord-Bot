require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Botは24時間元気に稼働中です！'));
app.listen(port, () => console.log(`Webサーバー起動: ${port}`));

const { Client, GatewayIntentBits, REST, Routes, ActivityType, Collection } = require('discord.js');
const { Pool } = require('pg');
const fs = require('fs'); // 🟢 フォルダを自動で読み込むための標準パーツ
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDatabase() {
    await pool.query(`CREATE TABLE IF NOT EXISTS message_counts (user_id TEXT, guild_id TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (user_id, guild_id));`);
    await pool.query(`CREATE TABLE IF NOT EXISTS omikuji_cooldowns (user_id TEXT, guild_id TEXT, last_date TEXT, PRIMARY KEY (user_id, guild_id));`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// 🟢 コマンドを保管する特製ボックスを作成
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const commandsData = [];

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        commandsData.push(command.data.toJSON());
    }
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

function updateServerCountStatus() {
    const serverCount = client.guilds.cache.size;
    client.user.setActivity({ name: `${serverCount} 個のサーバーで稼働中`, type: ActivityType.Competing });
}

client.once('ready', async () => {
    try {
        await initDatabase();
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commandsData });
        updateServerCountStatus();
        console.log(`${client.user.tag} 起動成功（完全モジュール化完了）`);
    } catch (e) { console.error(e); }
});

client.on('guildCreate', () => updateServerCountStatus());
client.on('guildDelete', () => updateServerCountStatus());

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    try {
        await pool.query(`INSERT INTO message_counts (user_id, guild_id, count) VALUES ($1, $2, 1) ON CONFLICT(user_id, guild_id) DO UPDATE SET count = message_counts.count + 1`, [message.author.id, message.guild.id]);
    } catch (e) { console.error(e); }
});

// 🟢 スラッシュコマンド実行の自動割り振り処理
client.on('interactionCreate', async (interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return;

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await interaction.deferReply({ ephemeral: interaction.commandName === 'scan' });
            // 各ファイルの「execute」という命令を自動で呼び出します
            await command.execute(interaction, pool);
        } catch (error) {
            console.error(error);
        }
    }

    // ランキングのボタン操作の処理
    if (interaction.isButton()) {
        const [action, pageStr, executorId] = interaction.customId.split('_');
        if (interaction.user.id !== executorId) { return await interaction.reply({ content: '❌ 本人しか操作できません。', ephemeral: true }); }
        
        const rankingCommand = client.commands.get('ranking');
        if (!rankingCommand) return;
        
        let page = parseInt(pageStr, 10) + (action === 'prev' ? -1 : 1);
        const pageData = await rankingCommand.generatePage(interaction.guild, page, interaction.user.id, executorId, pool);
        await interaction.update({ embeds: pageData.embeds, components: pageData.components });
    }
});

client.login(TOKEN);
