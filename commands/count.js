const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('count')
        .setDescription('指定したユーザーの発言回数を表示します')
        .addUserOption(o => o.setName('user').setDescription('ユーザー（空欄なら自分）').setRequired(false)),
    async execute(interaction, pool) {
        const guildId = interaction.guild?.id;
        const userId = interaction.options.getUser('user')?.id || interaction.user.id;
        
        const res = await pool.query("SELECT count FROM message_counts WHERE user_id = $1 AND guild_id = $2", [userId, guildId]);
        const count = res.rows.length > 0 ? res.rows[0].count : 0;
        
        const embed = new EmbedBuilder()
            .setTitle('📊 発言回数の確認')
            .setDescription(`<@${userId}> さんの発言回数は **${count}回** です！`)
            .setColor('#3498db')
            .setTimestamp();
            
        await interaction.editReply({ embeds: [embed] });
    }
};
