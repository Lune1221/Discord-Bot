const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level-set')
        .setDescription('レベリングの通知を送信するチャンネルを設定します【管理者専用】')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('通知を送るテキストチャンネルを指定してください')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        // 🔒 サーバー管理者の権限を持つユーザーだけに制限
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, pool) {
        const guildId = interaction.guild.id;
        const channel = interaction.options.getChannel('channel');

        try {
            // データベースにチャンネルIDを保存（すでに存在する場合は更新）
            await pool.query(
                `INSERT INTO guild_settings (guild_id, level_channel_id) 
                 VALUES ($1, $2) 
                 ON CONFLICT (guild_id) 
                 DO UPDATE SET level_channel_id = EXCLUDED.level_channel_id`,
                [guildId, channel.id]
            );

            await interaction.editReply({ 
                content: `✅ レベルアップ通知チャンネルを ${channel} に設定しました！` 
            });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ 
                content: '❌ 設定の保存に失敗しました。' 
            });
        }
    },
};
