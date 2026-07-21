const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('このBotで使えるコマンドの一覧メニューを表示します'),
        
    async execute(interaction, pool) {
        const embed = new EmbedBuilder()
            .setTitle('📖 コマンドメニュー')
            .setDescription('このBotで使えるコマンドの一覧です。')
            .setColor('#2ecc71')
            .addFields(
                { name: ' /count [ユーザー]', value: '指定した人の発言回数を見ることが出来ます。', inline: false },
                { name: ' /ranking', value: '発言回数が多い人順にランキングを表示します。', inline: false },
                { name: ' /omikuji', value: '今日のおみくじを引きます。(1日1回まで)', inline: false },
                { name: ' /scan', value: '【管理者専用】過去ログをすべて読み込み、サーバーと同期します。', inline: false }
            )
            .setFooter({ text: '※発言回数はクラウドに安全に自動記録されています。' })
            .setTimestamp();
            
        await interaction.editReply({ embeds: [embed] });
    }
};
