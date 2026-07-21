const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// グラフの数式（二次関数）に基づいて、そのレベルに必要なメッセージ数を返す関数
function getRequiredMessages(level) {
    return Math.floor(10 + (level * level * 2));
}

// 累計メッセージ数から現在のレベルを逆算する関数
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('指定したユーザーのレベルとメッセージ数を確認します')
        .addUserOption(o => o.setName('user').setDescription('ユーザー（空欄なら自分）').setRequired(false)),
    
    async execute(interaction, pool) {
        const guildId = interaction.guild?.id;
        // 指定があればそのユーザー、指定がなければコマンド実行者を取得
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;

        const res = await pool.query("SELECT count FROM message_counts WHERE user_id = $1 AND guild_id = $2", [userId, guildId]);
        const totalCount = res.rows.length > 0 ? res.rows[0].count : 0;

        const info = getLevelInfo(totalCount);
        const remaining = info.required - info.current;

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`${targetUser.username} さんのレベル情報`)
            .addFields(
                { name: '🔥 現在のレベル', value: `${info.level}`, inline: true },
                { name: '💬 総メッセージ数', value: `${totalCount} 回`, inline: true },
                { name: '📈 次のレベルまで', value: `あと ${remaining} メッセージ`, inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
