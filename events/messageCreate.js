const { EmbedBuilder } = require('discord.js');

function getLevelInfo(count) {
    let level = 0;
    while (true) {
        let req = Math.floor(10 + (level * level * 2));
        if (count >= req) { count -= req; level++; }
        else return { level, current: count, required: req };
    }
}

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, client, pool) {
        if (message.author.bot || !message.guild) return;

        // 🛡️ 荒らし対策チェック
        try {
            const raidCheck = await pool.query('SELECT enabled FROM antiraid_settings WHERE guild_id = $1', [message.guild.id]);
            if (raidCheck.rows.length > 0 && raidCheck.rows[0].enabled) {
                if (message.mentions.users.size >= 5 || message.mentions.roles.size >= 5) {
                    await message.delete().catch(() => {});
                    const warn = await message.channel.send(`🛡️ ${message.author} さんのメッセージは荒らし対策（大量メンション検知）により削除されました。`);
                    setTimeout(() => warn.delete().catch(() => {}), 5000);
                    return;
                }
            }
        } catch (e) {}

        // レベルアップ処理
        try {
            const res = await pool.query(
                `INSERT INTO message_counts (user_id, guild_id, count) VALUES ($1, $2, 1) ON CONFLICT(user_id, guild_id) DO UPDATE SET count = message_counts.count + 1 RETURNING count;`,
                [message.author.id, message.guild.id]
            );
            const newCount = res.rows[0].count;
            const oldInfo = getLevelInfo(newCount - 1);
            const newInfo = getLevelInfo(newCount);

            if (newInfo.level > oldInfo.level) {
                const setRes = await pool.query('SELECT level_channel_id FROM guild_settings WHERE guild_id = $1', [message.guild.id]);
                const targetChannel = (setRes.rows.length > 0 && setRes.rows[0].level_channel_id) ? message.guild.channels.cache.get(setRes.rows[0].level_channel_id) || message.channel : message.channel;
                await targetChannel.send(`🎉 ${message.author} おめでとうございます！レベル **${newInfo.level}** にアップしました！`);
            }
        } catch (e) { console.error('レベル処理エラー:', e); }

        // スティッキーメッセージ処理
        try {
            const stickyRes = await pool.query('SELECT * FROM sticky_messages WHERE channel_id = $1', [message.channel.id]);
            if (stickyRes.rows.length > 0) {
                const sticky = stickyRes.rows[0];
                if (sticky.message_id) {
                    const oldMsg = await message.channel.messages.fetch(sticky.message_id).catch(() => null);
                    if (oldMsg) await oldMsg.delete().catch(() => {});
                }
                const embed = new EmbedBuilder().setTitle(sticky.title).setDescription(sticky.description).setColor('#3498db').setTimestamp();
                const newMsg = await message.channel.send({ embeds: [embed] });
                await pool.query('UPDATE sticky_messages SET message_id = $1 WHERE channel_id = $2', [newMsg.id, message.channel.id]);
            }
        } catch (e) {}
    },
};
