const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('メッセージの送信予約を行います')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('新しいメッセージの送信を予約します（最大1年以内）')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('送信先のチャンネル')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('message')
                        .setDescription('送信するメッセージの内容')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('time')
                        .setDescription('送信日時 (例: 2026-07-30 15:00)')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('現在登録されている予約一覧を表示します')
        )
        .addSubcommand(sub =>
            sub.setName('cancel')
                .setDescription('IDを指定して予約をキャンセルします')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('キャンセルする予約のID (listコマンドで確認できます)')
                        .setRequired(true)
                )
        ),

    async execute(interaction, pool) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'set') {
            const channel = interaction.options.getChannel('channel');
            const messageContent = interaction.options.getString('message');
            const timeStr = interaction.options.getString('time');

            // 🟢 日本時間として正確にパース
            const normalizedTimeStr = timeStr.replace(' ', 'T') + '+09:00';
            const targetDate = new Date(normalizedTimeStr);
            
            if (isNaN(targetDate.getTime())) {
                return await interaction.editReply({ content: '❌ 日時の形式が正しくありません。「`YYYY-MM-DD HH:MM`」の形式で入力してください（例: `2026-07-30 15:00`）。' });
            }

            const now = new Date();
            const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

            if (targetDate <= now) {
                return await interaction.editReply({ content: '❌ 過去の日時は指定できません。未来の時間を設定してください。' });
            }
            if (targetDate > oneYearLater) {
                return await interaction.editReply({ content: '❌ 予約できるのは現在から1年以内までです。' });
            }

            await pool.query(
                'INSERT INTO scheduled_messages (guild_id, channel_id, author_id, message_content, send_at) VALUES ($1, $2, $3, $4, $5)',
                [guildId, channel.id, interaction.user.id, messageContent, targetDate]
            );

            // 🟢 日本時間（Asia/Tokyo）で綺麗に表示
            const formattedTime = targetDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
            await interaction.editReply({ content: `✨ ${channel} へのメッセージ送信を **${formattedTime}** に予約しました！` });

        } else if (subcommand === 'list') {
            const res = await pool.query(
                'SELECT id, channel_id, message_content, send_at FROM scheduled_messages WHERE guild_id = $1 ORDER BY send_at ASC',
                [guildId]
            );

            if (res.rows.length === 0) {
                return await interaction.editReply({ content: '📭 このサーバーに登録されている予約メッセージはありません。' });
            }

            let listText = '📋 **現在の予約メッセージ一覧**\n';
            for (const row of res.rows) {
                // 🟢 一覧表示も日本時間にする
                const dateStr = new Date(row.send_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
                const preview = row.message_content.length > 20 ? row.message_content.substring(0, 20) + '...' : row.message_content;
                listText += `• **ID: ${row.id}** | チャンネル: <#${row.channel_id}> | 予定: ${dateStr}\n  内容: \`${preview}\`\n`;
            }

            await interaction.editReply({ content: listText });

        } else if (subcommand === 'cancel') {
            const id = interaction.options.getInteger('id');

            const res = await pool.query(
                'DELETE FROM scheduled_messages WHERE id = $1 AND guild_id = $2 RETURNING id',
                [id, guildId]
            );

            if (res.rowCount === 0) {
                return await interaction.editReply({ content: `❌ ID \`${id}\` の予約が見つからないか、このサーバーの予約ではありません。` });
            }

            await interaction.editReply({ content: `🗑️ ID \`${id}\` の予約をキャンセルしました。` });
        }
    }
};
