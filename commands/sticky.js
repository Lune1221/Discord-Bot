const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('指定したチャンネルにスティッキーメッセージを設定・解除します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('スティッキーメッセージを設定します')
                .addStringOption(opt => opt.setName('title').setDescription('埋め込みのタイトル').setRequired(true))
                .addStringOption(opt => opt.setName('description').setDescription('埋め込みの説明文').setRequired(true))
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('送信先のチャンネル（省略した場合は現在のチャンネル）')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('指定したチャンネルのスティッキーメッセージを解除します')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('解除するチャンネル（省略した場合は現在のチャンネル）')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        ),

    async execute(interaction, pool) {
        const subcommand = interaction.options.getSubcommand();
        // チャンネルが指定されていればそのチャンネル、省略されていればコマンドを実行したチャンネル
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const channelId = targetChannel.id;

        // データベースにテーブルがなければ自動作成
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sticky_messages (
                channel_id VARCHAR(32) PRIMARY KEY,
                message_id VARCHAR(32),
                title TEXT,
                description TEXT
            )
        `);

        if (subcommand === 'set') {
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');

            // 既存の設定を確認して、古いメッセージがあれば削除を試みる
            const res = await pool.query('SELECT message_id FROM sticky_messages WHERE channel_id = $1', [channelId]);
            if (res.rows.length > 0 && res.rows[0].message_id) {
                try {
                    const oldMsg = await targetChannel.messages.fetch(res.rows[0].message_id);
                    if (oldMsg) await oldMsg.delete();
                } catch (e) {
                    // すでに削除されている場合は無視
                }
            }

            // 新しいスティッキーメッセージをターゲットチャンネルに送信
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor('#3498db')
                .setTimestamp();

            const sentMessage = await targetChannel.send({ embeds: [embed] });

            // データベースに保存・更新
            await pool.query(`
                INSERT INTO sticky_messages (channel_id, message_id, title, description)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (channel_id) 
                DO UPDATE SET message_id = $2, title = $3, description = $4
            `, [channelId, sentMessage.id, title, description]);

            await interaction.reply({ content: `✨ ${targetChannel} にスティッキーメッセージを設定しました！`, ephemeral: true });

        } else if (subcommand === 'remove') {
            const res = await pool.query('SELECT message_id FROM sticky_messages WHERE channel_id = $1', [channelId]);
            
            if (res.rows.length > 0) {
                if (res.rows[0].message_id) {
                    try {
                        const oldMsg = await targetChannel.messages.fetch(res.rows[0].message_id);
                        if (oldMsg) await oldMsg.delete();
                    } catch (e) {}
                }
                await pool.query('DELETE FROM sticky_messages WHERE channel_id = $1', [channelId]);
                await interaction.reply({ content: `🗑️ ${targetChannel} のスティッキーメッセージを解除しました。`, ephemeral: true });
            } else {
                await interaction.reply({ content: `⚠️ ${targetChannel} にはスティッキーメッセージが設定されていません。`, ephemeral: true });
            }
        }
    }
};
