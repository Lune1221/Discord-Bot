const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const omikujiResults = [
    '大吉 ', 
    '中吉 ', '中吉 ', 
    '小吉 ', '小吉 ', 
    '吉 ', '吉 ', '吉 ',
    '凶 ', '凶 '
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('omikuji')
        .setDescription('今日のおみくじを引きます（1日1回限定）'),
        
    async execute(interaction, pool) {
        const guildId = interaction.guild?.id;
        const userId = interaction.user.id;
        
        const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });

        const cooldownRes = await pool.query(
            "SELECT last_date FROM omikuji_cooldowns WHERE user_id = $1 AND guild_id = $2",
            [userId, guildId]
        );

        if (cooldownRes.rows.length > 0 && cooldownRes.rows[0].last_date === todayStr) {
            const embedError = new EmbedBuilder()
                .setTitle('❌ おみくじは1日1回まで')
                .setDescription('今日のおみくじは既に引いています！また明日引いてね！')
                .setColor('#ff4757')
                .setTimestamp();
            return await interaction.editReply({ embeds: [embedError] });
        }

        const fortune = omikujiResults[Math.floor(Math.random() * omikujiResults.length)];

        await pool.query(`
            INSERT INTO omikuji_cooldowns (user_id, guild_id, last_date) 
            VALUES ($1, $2, $3) 
            ON CONFLICT(user_id, guild_id) DO UPDATE SET last_date = $3
        `, [userId, guildId, todayStr]);

        const embed = new EmbedBuilder()
            .setTitle('おみくじ結果')
            .setDescription(`<@${interaction.user.id}> さんの今日の運勢は...`)
            .addFields({ name: '【運勢】', value: `**${fortune}**` })
            .setColor('#ff4757')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
