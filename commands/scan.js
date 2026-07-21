const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scan')
        .setDescription('過去のメッセージを遡って集計します【管理者権限】')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction, pool) {
        await interaction.editReply({ content: 'スキャン中...' });
        await interaction.guild.members.fetch();
        
        const guild = interaction.guild;
        const textChannels = guild.channels.cache.filter(c => c.isTextBased());
        const localCounts = {};
        
        for (const [channelId, channel] of textChannels) {
            let lastId = null;
            while (true) {
                try {
                    const options = { limit: 100 };
                    if (lastId) options.before = lastId;
                    const messages = await channel.messages.fetch(options);
                    if (messages.size === 0) break;
                    for (const msg of messages.values()) {
                        if (msg.author.bot) continue;
                        localCounts[msg.author.id] = (localCounts[msg.author.id] || 0) + 1;
                    }
                    lastId = messages.last().id;
                } catch (error) { break; }
            }
        }
        const queryText = `INSERT INTO message_counts (user_id, guild_id, count) VALUES ($1, $2, $3) ON CONFLICT(user_id, guild_id) DO UPDATE SET count = message_counts.count + $3`;
        for (const [uId, totalCount] of Object.entries(localCounts)) { await pool.query(queryText, [uId, guild.id, totalCount]); }
        
        await interaction.editReply({ content: '✅ 同期完了しました！' });
    }
};
