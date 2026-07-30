const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('GIF埋め込みを表示します'),
        
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('GIFテスト（このすば）')
            .setColor(0xFF0000)
            // 👇 ここを上記の「://tenor.com」から始まるURL、またはGiphyのURLに変更します
            .setImage('https://://tenor.com/hsYNUQdAYeoAAAAC/megumin-explosion.gif');

        // すでにエラーが解消して通常の返信ができる場合は reply
        // もしハンドラー側で deferReply している場合は editReply にしてください
        await interaction.reply({ embeds: [embed] });
    },
};
