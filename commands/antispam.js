const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antispam')
        .setDescription('荒らし対策機能のオン・オフを切り替えます')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('on または off を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: 'ONにする', value: 'on' },
                    { name: 'OFFにする', value: 'off' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // 管理者のみ実行可能

    async execute(interaction) {
        const status = interaction.options.getString('status');

        if (status === 'on') {
            config.antiSpamEnabled = true;
            await interaction.reply('🛡️ **荒らし対策機能：ON** に設定しました。');
        } else {
            config.antiSpamEnabled = false;
            await interaction.reply('⚠️ 荒らし対策機能：OFF に設定しました。');
        }
    },
};
