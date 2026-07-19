const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const Database = require('better-sqlite3');
require('dotenv').config(); // .env ファイルからTOKENなどを読み込む設定

// データベースファイルの作成・接続
const db = new Database('database.db');

// データベースのテーブルを作成する処理
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
        GatewayIntentBits.MessageContent
    ]
});

// 環境変数からTOKENとIDを読み込む
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const commands = [
    new SlashCommandBuilder()
        .setName('count')
        .setDescription('このサーバーでのあなたの発言数を表示します')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 過去のメッセージをすべて遡ってカウントし、データベースに保存する関数
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

// 通常のリアルタイム発言をデータベースに保存する処理
client.on('messageCreate', (message) => {
    if (message.author.bot || !message.guild) return;

    const insertOrUpdate = db.prepare(`
        INSERT INTO message_counts (user_id, guild_id, count) 
        VALUES (?, ?, 1)
        ON CONFLICT(user_id, guild_id) DO UPDATE SET count = count + 1
    `);
    insertOrUpdate.run(message.author.id, message.guild.id);
});

// スラッシュコマンド（/count）の処理
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'count') {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        
        const row = db.prepare("SELECT count FROM message_counts WHERE user_id = ? AND guild_id = ?").get(userId, guildId);
        const count = row ? row.count : 0;
        
        await interaction.reply({
            content: `あなたのこのサーバーでの総発言数は **${count}回** です！(データは保存されています)`,
            ephemeral: true
        });
    }
});

client.login(TOKEN);
