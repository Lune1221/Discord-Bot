const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antiraid')
        .setDescription('荒らし対策機能のオンオフを切り替えます')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('オンにするかオフにするかを選択してください')
                .setRequired(true)
                .addChoices(
                    { name: 'オン', value: 'on' },
                    { name: 'オフ', value: 'off' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, pool) {
        const enabled = interaction.options.getString('status') === 'on';

        await pool.query(
            `INSERT INTO antiraid_settings (guild_id, enabled) VALUES ($1, $2)
             ON CONFLICT (guild_id) DO UPDATE SET enabled = $2`,
            [interaction.guild.id, enabled]
        );

        await interaction.editReply({ content: `🛡️ 荒らし対策機能を **${enabled ? '有効' : '無効'}** に設定しました。` });
    },
};
