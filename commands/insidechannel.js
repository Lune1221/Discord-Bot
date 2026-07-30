const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('introchannel')
        .setDescription('自己紹介の自動表示設定を管理します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('新しい自己紹介の連携設定を追加します')
                .addChannelOption(opt =>
                    opt.setName('source')
                        .setDescription('自己紹介が投稿されているチャンネル（例: #自己紹介）')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addChannelOption(opt =>
                    opt.setName('output')
                        .setDescription('出力先のチャンネル（インチャ、またはVCのインサイドチャンネル）')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('keyword')
                        .setDescription('検索するキーワード（例: 名前：、ハンネ：等。省略時は「名前：」）')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('現在登録されている自己紹介の設定一覧を表示します')
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('IDを指定して設定を削除します')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('削除する設定のID (listコマンドで確認できます)')
                        .setRequired(true)
                )
        ),

    async execute(interaction, pool) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'set') {
            const sourceChannel = interaction.options.getChannel('source');
            const outputChannel = interaction.options.getChannel('output');
            const keyword = interaction.options.getString('keyword') || '名前：';

            await pool.query(
                `INSERT INTO intro_channel_settings (guild_id, source_channel_id, output_channel_id, keyword) 
                 VALUES ($1, $2, $3, $4)`,
                [guildId, sourceChannel.id, outputChannel.id, keyword]
            );

            await interaction.editReply({ 
                content: `✨ 新しい設定を追加しました！\n• 読み取り元: ${sourceChannel}\n• 出力先（インチャ等）: ${outputChannel}\n• 検索ワード: \`${keyword}\`` 
            });

        } else if (subcommand === 'list') {
            const res = await pool.query(
                'SELECT id, source_channel_id, output_channel_id, keyword FROM intro_channel_settings WHERE guild_id = $1 ORDER BY id ASC',
                [guildId]
            );

            if (res.rows.length === 0) {
                return await interaction.editReply({ content: '📭 現在登録されている自己紹介の設定はありません。' });
            }

            let listText = '📋 **現在の自己紹介設定一覧**\n';
            for (const row of res.rows) {
                listText += `• **ID: ${row.id}** | 読み取り: <#${row.source_channel_id}> ➔ 出力先: <#${row.output_channel_id}> (ワード: \`${row.keyword}\`)\n`;
            }

            await interaction.editReply({ content: listText });

        } else if (subcommand === 'delete') {
            const id = interaction.options.getInteger('id');

            const res = await pool.query(
                'DELETE FROM intro_channel_settings WHERE id = $1 AND guild_id = $2 RETURNING id',
                [id, guildId]
            );

            if (res.rowCount === 0) {
                return await interaction.editReply({ content: `❌ ID \`${id}\` の設定が見つからないか、このサーバーの設定ではありません。` });
            }

            await interaction.editReply({ content: `🗑️ ID \`${id}\` の設定を削除しました。` });
        }
    }
};
