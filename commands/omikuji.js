const { EmbedBuilder } = require('discord.js');

// おみくじの運勢リスト
const omikujiResults = [
    '大吉 ', 
    '中吉 ', '中吉 ', 
    '小吉 ', '小吉 ', 
    '吉 ', '吉 ', '吉 ',
    '凶 ', '凶 '
];

// おみくじのテーブル作成と実行処理をまとめた関数
async function handleOmikuji(interaction, pool, guildId) {
    const userId = interaction.user.id;
    const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });

    // 1. おみくじ用のテーブルがなければ自動作成
    await pool.query(`
        CREATE TABLE IF NOT EXISTS omikuji_cooldowns (
            user_id TEXT,
            guild_id TEXT,
            last_date TEXT,
            PRIMARY KEY (user_id, guild_id)
        );
    `);

    // 2. 1日1回チェック
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

    // 3. おみくじを引いて保存
    const fortune = omikujiResults[Math.floor(Math.random() * omikujiResults.length)];
    await pool.query(`
        INSERT INTO omikuji_cooldowns (user_id, guild_id, last_date) 
        VALUES ($1, $2, $3) 
        ON CONFLICT(user_id, guild_id) DO UPDATE SET last_date = $3
    `, [userId, guildId, todayStr]);

    const embed = new EmbedBuilder()
        .setTitle('🔮 おみくじ結果')
        .setDescription(`<@${interaction.user.id}> さんの今日の運勢は...`)
        .addFields({ name: '【運勢】', value: `**${fortune}**` })
        .setColor('#ff4757')
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

// 外部から呼び出せるようにエクスポート
module.exports = { handleOmikuji };
