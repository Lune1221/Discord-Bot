const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('チャンネルにスティッキーメッセージを設定・解除します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) // 管理者・メッセージ管理権限が必要
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('スティッキーメッセージを設定します')
                .addStringOption(opt => opt.setName('title').setDescription('埋め込みのタイトル').setRequired(true))
                .addStringOption(opt => opt.setName('description').setDescription('埋め込みの説明文').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('このチャンネルのスティッキーメッセージを解除します')
        ),

    async execute(interaction, pool) {
        const subcommand = interaction.options.getSubcommand();
        const channelId = interaction.channel.id;

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
                    const oldMsg = await interaction.channel.messages.fetch(res.rows[0].message_id);
                    if (oldMsg) await oldMsg.delete();
                } catch (e) {
                    // すでに削除されている場合は無視
                }
            }

            // 新しいスティッキーメッセージを送信
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor('#3498db')
                .setTimestamp();

            const sentMessage = await interaction.channel.send({ embeds: [embed] });

            // データベースに保存・更新
            await pool.query(`
                INSERT INTO sticky_messages (channel_id, message_id, title, description)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (channel_id) 
                DO UPDATE SET message_id = $2, title = $3, description = $4
            `, [channelId, sentMessage.id, title, description]);

            await interaction.reply({ content: ' スティッキーメッセージを設定しました！', ephemeral: true });

        } else if (subcommand === 'remove') {
            const res = await pool.query('SELECT message_id FROM sticky_messages WHERE channel_id = $1', [channelId]);
            
            if (res.rows.length > 0) {
                if (res.rows[0].message_id) {
                    try {
                        const oldMsg = await interaction.channel.messages.fetch(res.rows[0].message_id);
                        if (oldMsg) await oldMsg.delete();
                    } catch (e) {}
                }
                await pool.query('DELETE FROM sticky_messages WHERE channel_id = $1', [channelId]);
                await interaction.reply({ content: '🗑️ このチャンネルのスティッキーメッセージを解除しました。', ephemeral: true });
            } else {
                await interaction.reply({ content: '⚠️ このチャンネルにはスティッキーメッセージが設定されていません。', ephemeral: true });
            }
        }
    }
};
