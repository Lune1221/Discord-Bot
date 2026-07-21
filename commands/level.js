const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('あなたの現在のレベルとメッセージ数を確認します'),
    
    async execute(interaction, pool) {
        const guildId = interaction.guild?.id;
        const userId = interaction.user.id;

        const res = await pool.query("SELECT count FROM message_counts WHERE user_id = $1 AND guild_id = $2", [userId, guildId]);
        const count = res.rows.length > 0 ? res.rows[0].count : 0;

        // レベルと必要メッセージ数の計算（だんだん難しくするロジック）
        let level = 0;
        let required = 10; // 最初は10メッセージでレベルアップ
        let remainingCount = count;

        while (remainingCount >= required) {
            remainingCount -= required;
            level++;
            required += 5; // レベルが1上がるごとに、次のレベルに必要な数が5ずつ増える
        }

        // 次のレベルまでにあと何メッセージ必要か
        const neededForNext = required - remainingCount;

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`${interaction.user.username} さんのレベル情報`)
            .addFields(
                { name: ' 現在のレベル', value: `${level}`, inline: true },
                { name: ' 総メッセージ数', value: `${count} 回`, inline: true },
                { name: ' 次のレベルまで', value: `あと ${neededForNext} メッセージ`, inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
