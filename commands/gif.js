const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    // 1. スラッシュコマンド（/gif）の登録データ
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('めぐみんのGIFを表示します'),

    // 2. コマンドが実行されたときの処理
    async execute(interaction) {
        // 直接GIFのWebリンクを返信することで、Discordが自動でプレビューを展開します
        await interaction.reply('https://tenor.com/hsYNUQdAYeo.gif');
    },
};
