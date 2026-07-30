module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, client, pool) {
        if (!interaction.guild) return;

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await interaction.deferReply({ ephemeral: ['scan', 'massping', 'schedule', 'vcintro', 'antiraid'].includes(interaction.commandName) });
                await command.execute(interaction, pool);
            } catch (error) {
                console.error('コマンド実行エラー:', error);
                const errorMsg = `❌ エラーが発生しました。\n\`\`\`js\n${error.message}\n\`\`\``;
                if (interaction.deferred || interaction.replied) await interaction.editReply({ content: errorMsg }).catch(() => {});
                else await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
            }
        }

        if (interaction.isButton()) {
            const [action, pageStr, executorId] = interaction.customId.split('_');
            if (interaction.user.id !== executorId) return interaction.reply({ content: '❌ 本人しか操作できません。', ephemeral: true });
            const rankingCommand = client.commands.get('ranking');
            if (rankingCommand) await rankingCommand.executeButton(interaction, pool, parseInt(pageStr, 10) + (action === 'prev' ? -1 : 1), executorId);
        }
    },
};
