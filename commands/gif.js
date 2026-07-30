const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('めぐみんの爆裂魔法GIFを表示します'),

    async execute(interaction) {
        try {
            // すでに返信されている場合は追記（followUp）として送信します
            await interaction.followUp('https://tenor.com/hsYNUQdAYeo.gif');
        } catch (error) {
            // 万が一、事前の返信処理がない場合は通常のreplyで送信します
            await interaction.reply('https://tenor.com/hsYNUQdAYeo.gif');
        }
    },
};
