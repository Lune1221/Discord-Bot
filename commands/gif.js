const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    // スラッシュコマンド（/gif）の定義
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('めぐみんのGIFを表示します'),

    // コマンド実行時の処理
    async execute(interaction) {
        // 💡 共有いただいたTenorのURLを返信します
        await interaction.reply('https://tenor.com/hsYNUQdAYeo.gif');
    },
};
