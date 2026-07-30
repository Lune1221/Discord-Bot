const { ActivityType, REST, Routes } = require('discord.js');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client, pool) {
        console.log(`${client.user.tag} でログインしました！`);
        client.user.setActivity(`${client.guilds.cache.size} 個のサーバーで稼働`, { type: ActivityType.Watching });

        // 予約メッセージ送信ループ
        setInterval(async () => {
            try {
                const res = await pool.query('SELECT * FROM scheduled_messages WHERE send_at <= $1', [new Date()]);
                for (const row of res.rows) {
                    const channel = await client.channels.fetch(row.channel_id).catch(() => null);
                    if (channel) await channel.send(row.message_content);
                    await pool.query('DELETE FROM scheduled_messages WHERE id = $1', [row.id]);
                }
            } catch (e) { console.error('予約メッセージエラー:', e); }
        }, 60 * 1000);

        // スラッシュコマンド自動登録
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
            await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: client.commands.map(c => c.data.toJSON()) });
            console.log('✨ スラッシュコマンド登録完了');
        } catch (e) { console.error('コマンド登録エラー:', e); }
    },
};
