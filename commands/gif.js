const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('埋め込みでめぐみんのGIFを表示します'),

    async execute(interaction) {
        // 先にDiscordのテキストとして安全にGIFを投稿し、そのプレビューURLを生成させます
        const baseMessage = await interaction.followUp('https://tenor.com/hsYNUQdAYeo.gif');
        
        // 送信したメッセージから、Discordが認識した正しい画像URLを取得します
        const discordImageUrl = baseMessage.embeds[0]?.image?.url || 'https://tenor.com/hsYNUQdAYeo.gif';

        // 枠（埋め込み）を作成し、Discord公認のURLをセットします
        const embed = new EmbedBuilder()
            .setTitle('めぐみんの爆裂魔法！')
            .setColor(0x00FF00)
            .setImage(discordImageUrl);

        // 枠なしのメッセージを枠ありの埋め込みに書き換えます
        await baseMessage.edit({ content: '', embeds: [embed] });
    },
};
