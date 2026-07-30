const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    // /gif コマンドの定義
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('GIF埋め込みを表示します'),
        
    async execute(interaction) {
        // 埋め込みの作成
        const embed = new EmbedBuilder()
            .setTitle('GIFテスト（このすば）')
            .setColor(0xFF0000)
            // ご提示いただいたTenorのGIF URLを設定
            .setImage('https://tenor.com');

        // スラッシュコマンドに対して返信する
        // もし事前に deferReply() しているなら、reply ではなく editReply を使う
await interaction.editReply({ embeds: [embed] });

    },
};
