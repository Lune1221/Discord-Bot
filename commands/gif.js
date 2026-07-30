const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('GIF埋め込みを表示します'),
        
    async execute(interaction) {
        // あなたが用意したTenorのURL
        const tenorUrl = 'https://tenor.com';
        
        // 💡 Discordが認識できる本物の画像URL（media.tenor.com）に自動で変換する処理
        const realGifUrl = tenorUrl
            .replace('://tenor.com', 'media.://tenor.com')
            .replace('.gif', 'AAAAC/megumin-explosion.gif');

        const embed = new EmbedBuilder()
            .setTitle('GIFテスト（このすば）')
            .setColor(0xFF0000)
            // 変換後の安全なURLをセット
            .setImage(realGifUrl);

        await interaction.reply({ embeds: [embed] });
    },
};
