const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('現在のチャンネルを初期化します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, pool) {
        if (!interaction.guild) return;

        const channel = interaction.channel;

        try {
            // 現在のチャンネル設定を引き継いでクローン（複製）を作成
            const cloned = await channel.clone({
                name: channel.name,
                permissions: channel.permissionOverwrites,
                type: channel.type,
                topic: channel.topic,
                nsfw: channel.nsfw,
                rateLimitPerUser: channel.rateLimitPerUser,
                position: channel.position,
                parent: channel.parentId,
            });

            // 見た目をすっきりさせた埋め込みメッセージを作成
            const embed = new EmbedBuilder()
                .setTitle('💥 チャンネル初期化 (Nuke)')
                .setDescription(`${interaction.user} によってチャンネルが初期化されました！\n\n[gif](https://tenor.com/view/6129820118499146222)`)
                .setColor('#ff4500')
                .setTimestamp();

            // 新しいチャンネルに埋め込みを送信
            await cloned.send({ embeds: [embed] });

            // 古いチャンネルを削除
            await channel.delete();
        } catch (error) {
            console.error('Nukeコマンドエラー:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ チャンネルの初期化に失敗しました。ボットに「チャンネルの管理」権限があるか確認してください。', ephemeral: true }).catch(() => {});
            }
        }
    },
};
