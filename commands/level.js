const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('あなたの現在のレベルとメッセージ数を確認します'),
    
    async execute(interaction, pool) {
        const guildId = interaction.guild?.id;
        const userId = interaction.user.id;

        // データベースから現在の発言回数を取得
        const res = await pool.query("SELECT count FROM message_counts WHERE user_id = $1 AND guild_id = $2", [userId, guildId]);
        const count = res.rows.length > 0 ? res.rows[0].count : 0;

        // レベル計算（10メッセージごとに1レベル）
        const level = Math.floor(count / 10);
        const nextLevelCount = (level + 1) * 10;
        const remaining = nextLevelCount - count;

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`${interaction.user.username} さんのレベル情報`)
            .addFields(
                { name: ' 現在のレベル', value: `${level}`, inline: true },
                { name: ' 総メッセージ数', value: `${count} 回`, inline: true },
                { name: ' 次のレベルまで', value: `あと ${remaining} メッセージ`, inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
