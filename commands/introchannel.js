const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('introchannel')
        .setDescription('自己紹介の読み取り元チャンネルと、表示先のインチャを設定します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(opt =>
            opt.setName('source')
                .setDescription('メンバーが自己紹介を書き込んでいるチャンネル（例: #自己紹介）')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addChannelOption(opt =>
            opt.setName('output')
                .setDescription('一括表示を流すテキストチャンネル（インチャ）')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),

    async execute(interaction, pool) {
        const sourceChannel = interaction.options.getChannel('source');
        const outputChannel = interaction.options.getChannel('output');
        const guildId = interaction.guild.id;

        await pool.query(
            `INSERT INTO intro_channel_settings (guild_id, source_channel_id, output_channel_id) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (guild_id) 
             DO UPDATE SET source_channel_id = $2, output_channel_id = $3`,
            [guildId, sourceChannel.id, outputChannel.id]
        );

        await interaction.editReply({ 
            content: `✨ 設定を保存しました！\n• 読み取り元: ${sourceChannel}\n• 表示先インチャ: ${outputChannel}` 
        });
    }
};
