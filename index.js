require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 10000;

// Webサーバーの静的配信設定
app.use(express.static(path.join(__dirname, 'public')));

// GASやUptimeなどの監視アクセス用（404を防ぐ）
app.get('/', (req, res) => {
    res.send('Botは24時間稼働中です！');
});

const server = app.listen(port, () => console.log(`Webサーバー起動: ${port}`));
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`ポート ${port} はすでに使用されています。`);
    } else {
        throw err;
    }
});

const { Client, GatewayIntentBits, REST, Routes, ActivityType, Collection, EmbedBuilder } = require('discord.js');
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDatabase() {
    await pool.query(`CREATE TABLE IF NOT EXISTS message_counts (user_id TEXT, guild_id TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (user_id, guild_id));`);
    await pool.query(`CREATE TABLE IF NOT EXISTS omikuji_cooldowns (user_id TEXT, guild_id TEXT, last_date TEXT, PRIMARY KEY (user_id, guild_id));`);
    await pool.query(`CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, level_channel_id TEXT);`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS sticky_messages (
            channel_id VARCHAR(32) PRIMARY KEY,
            message_id VARCHAR(32),
            title TEXT,
            description TEXT
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS scheduled_messages (
            id SERIAL PRIMARY KEY,
            guild_id TEXT,
            channel_id TEXT,
            author_id TEXT,
            message_content TEXT,
            send_at TIMESTAMP
        )
    `);
    // 複数の自己紹介設定を保存できるテーブル
    await pool.query(`
        CREATE TABLE IF NOT EXISTS intro_channel_settings (
            id SERIAL PRIMARY KEY,
            guild_id TEXT,
            source_channel_id TEXT,
            output_channel_id TEXT,
            keyword TEXT DEFAULT '名前：'
        )
    `);
}

// ボイスステータス取得用のインテントを追加
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ] 
});

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

// グラフの数式（二次関数）によるレベル計算
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

    const serverCount = client.guilds.cache.size;
    client.user.setActivity(`${serverCount} 個のサーバーで稼働`, { type: ActivityType.Watching });

    // 1分ごとに予約メッセージの時間を確認して送信する処理
    setInterval(async () => {
        try {
            const now = new Date();
            const res = await pool.query(
                'SELECT * FROM scheduled_messages WHERE send_at <= $1',
                [now]
            );

            for (const row of res.rows) {
                try {
                    const channel = await client.channels.fetch(row.channel_id);
                    if (channel) {
                        await channel.send(row.message_content);
                    }
                } catch (err) {
                    console.error(`予約メッセージ送信エラー (ID: ${row.id}):`, err);
                }

                await pool.query('DELETE FROM scheduled_messages WHERE id = $1', [row.id]);
            }
        } catch (e) {
            console.error('予約メッセージのチェック中にエラーが発生しました:', e);
        }
    }, 60 * 1000);

    // Discordへスラッシュコマンドを自動登録する処理
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

// 誰かがボイスチャンネルに参加したとき、登録された設定に従って自己紹介を自動送信
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (!newState.channelId) return; // 退出時は無視
    
    const channel = newState.channel;
    if (!channel) return;

    try {
        const settingRes = await pool.query('SELECT source_channel_id, output_channel_id, keyword FROM intro_channel_settings WHERE guild_id = $1', [newState.guild.id]);
        if (settingRes.rows.length === 0) return;

        const membersInVc = channel.members.filter(m => !m.user.bot);
        if (membersInVc.size === 0) return;

        for (const setting of settingRes.rows) {
            const { source_channel_id, output_channel_id, keyword } = setting;
            if (!source_channel_id || !output_channel_id) continue;

            const sourceChannel = newState.guild.channels.cache.get(source_channel_id);
            const outputChannel = newState.guild.channels.cache.get(output_channel_id);
            if (!sourceChannel || !outputChannel) continue;

            const messages = await sourceChannel.messages.fetch({ limit: 100 });
            const searchKeyword = keyword || '名前：';

            let introText = `🔊 **【 ${channel.name} 】通話参加メンバーの自己紹介**\n`;

            for (const [memberId, member] of membersInVc) {
                const userMsg = messages.find(m => 
                    m.author.id === memberId && 
                    m.content.includes(searchKeyword)
                );
                
                const bio = userMsg ? userMsg.content : `（#自己紹介 に「${searchKeyword}」を含む投稿が見つかりません）`;
                const trimmedBio = bio.length > 80 ? bio.substring(0, 80) + '...' : bio;
                introText += `• **${member.displayName}** :\n${trimmedBio}\n\n`;
            }

            await outputChannel.send(introText);
        }

    } catch (e) {
        console.error('通話自己紹介表示エラー:', e);
    }
});

// メッセージ送信時の処理（レベルアップ判定 ＆ スティッキーメッセージ機能）
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
        console.error('レベルアップ処理エラー:', e); 
    }

    try {
        const stickyRes = await pool.query('SELECT * FROM sticky_messages WHERE channel_id = $1', [message.channel.id]);
        if (stickyRes.rows.length > 0) {
            const sticky = stickyRes.rows[0];

            if (sticky.message_id) {
                try {
                    const oldMsg = await message.channel.messages.fetch(sticky.message_id);
                    if (oldMsg) await oldMsg.delete();
                } catch (e) {}
            }

            const embed = new EmbedBuilder()
                .setTitle(sticky.title)
                .setDescription(sticky.description)
                .setColor('#3498db')
                .setTimestamp();

            const newMsg = await message.channel.send({ embeds: [embed] });

            await pool.query('UPDATE sticky_messages SET message_id = $1 WHERE channel_id = $2', [newMsg.id, message.channel.id]);
        }
    } catch (error) {
        console.error('スティッキーメッセージ処理エラー:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return;

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await interaction.deferReply({ 
                ephemeral: interaction.commandName === 'scan' || 
                           interaction.commandName === 'massping' || 
                           interaction.commandName === 'schedule' ||
                           interaction.commandName === 'vcintro'
            });
            
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
