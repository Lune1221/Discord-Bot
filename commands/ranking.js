const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('このサーバーの発言回数ランキングを表示します'),
    async execute(interaction, pool) {
        await interaction.guild.members.fetch();
        const pageData = await this.generatePage(interaction.guild, 1, interaction.user.id, interaction.user.id, pool);
        if (pageData.error) return await interaction.editReply({ content: 'データがありません。' });
        await interaction.editReply({ embeds: pageData.embeds, components: pageData.components });
    },
    async generatePage(guild, currentPageId, currentUserId, executorId, pool) {
        const res = await pool.query("SELECT user_id, count FROM message_counts WHERE guild_id = $1 ORDER BY count DESC", [guild.id]);
        const allRows = res.rows;
        const activeUsers = [];
        let myRank = '圏外', myCount = 0, activeRank = 0;
        
        for (let i = 0; i < allRows.length; i++) {
            const userId = allRows[i].user_id;
            activeRank++;
            activeUsers.push({ rank: activeRank, userId: userId, count: allRows[i].count });
            if (userId === currentUserId) { myRank = `${activeRank}位`; myCount = allRows[i].count; }
        }
        if (activeUsers.length === 0) return { error: 'なし' };
        
        const maxPages = Math.ceil(activeUsers.length / 10);
        let page = Math.max(1, Math.min(currentPageId, maxPages));
        const pageUsers = activeUsers.slice((page - 1) * 10, page * 10);
        let rankingText = '';
        const medals = ['🥇', '🥈', '🥉'];
        
        for (const u of pageUsers) { rankingText += `${medals[u.rank - 1] || `  ${u.rank}位.`} <@${u.userId}>: **${u.count}回**\n`; }
        
        const embed = new EmbedBuilder().setTitle(`🏆 発言回数ランキング (${page} / ${maxPages} ページ)`).setDescription(rankingText).setColor('#FFD700').addFields({ name: '👤 あなたの現在の順位', value: `**${myRank}** (${myCount}回)` }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`prev_${page}_${executorId}`).setLabel('前へ ◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
            new ButtonBuilder().setCustomId(`next_${page}_${executorId}`).setLabel('▶ 次へ').setStyle(ButtonStyle.Primary).setDisabled(page === maxPages)
        );
        return { embeds: [embed], components: [row] };
    }
};
