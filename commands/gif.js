const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('埋め込みでめぐみんのGIFを表示します'),

    async execute(interaction) {
        // 1. 埋め込み（Embed）を作成
        const embed = new EmbedBuilder()
            .setTitle('めぐみんの爆裂魔法！')
            .setColor(0x00FF00)
            // 💡 Tenorから取得した、埋め込み専用のGIF直リンクを指定します
            .setImage('https://tenor.com/hsYNUQdAYeo.gif');

        try {
            // すでに事前処理で返信（deferReplyなど）されている場合は、followUpで埋め込みを送信
            await interaction.followUp({ embeds: [embed] });
        } catch (error) {
            // 事前処理がない場合は、通常のreplyで埋め込みを送信
            await interaction.reply({ embeds: [embed] });
        }
    },
};
