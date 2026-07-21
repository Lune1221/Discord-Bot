const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('指定したチャンネルにメッセージを送信させます【管理者専用】')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('メッセージを送信するテキストチャンネルを指定してください')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Embedに表示させたい本文を入力してください')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Embedの色（例: #3498db などの16進数カラーコード。省略時は青）')
                .setRequired(false)
        )
        // 🔒 サーバー管理者の権限を持つユーザーだけに制限
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, pool) {
        const channel = interaction.options.getChannel('channel');
        const text = interaction.options.getString('text');
        const colorInput = interaction.options.getString('color') || '#3498db'; // 色の指定がない場合のデフォルトカラー

        try {
            // Embedの作成
            const embed = new EmbedBuilder()
                .setDescription(text)
                .setColor(colorInput)
                .setTimestamp();

            // 指定されたチャンネルにEmbedを送信
            await channel.send({ embeds: [embed] });

            // 実行した本人に成功を通知
            await interaction.editReply({ 
                content: `✅ ${channel} にメッセージを送信しました！` 
            });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ 
                content: '❌ メッセージの送信に失敗しました（カラーコードの形式が間違っているか、権限が不足しています）。' 
            });
        }
    },
};
