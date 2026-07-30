module.exports = {
    name: 'voiceStateUpdate',
    once: false,
    async execute(oldState, newState, client, pool) {
        if (oldState.channelId === newState.channelId) return;
        const guild = newState.guild || oldState.guild;

        try {
            const settingRes = await pool.query('SELECT source_channel_id, keyword FROM intro_channel_settings WHERE guild_id = $1', [guild.id]);
            if (settingRes.rows.length === 0) return;
            const { source_channel_id, keyword } = settingRes.rows[0];
            const sourceChannel = guild.channels.cache.get(source_channel_id);
            if (!sourceChannel) return;

            const messages = await sourceChannel.messages.fetch({ limit: 100 });
            const updateVcIntro = async (channel) => {
                if (!channel) return;
                const members = channel.members.filter(m => !m.user.bot);
                let text = `参加メンバー\n\n`;
                if (members.size === 0) {
                    text += `現在、誰も参加していません。`;
                } else {
                    for (const [id, member] of members) {
                        const userMsg = messages.find(m => m.author.id === id && m.content.includes(keyword || '名前：'));
                        text += `• **${member.displayName}** :\n${userMsg ? (userMsg.content.length > 80 ? userMsg.content.substring(0, 80) + '...' : userMsg.content) : '（自己紹介がありません）'}\n\n`;
                    }
                }
                try {
                    const vcMsgs = await channel.messages.fetch({ limit: 30 });
                    const existing = vcMsgs.find(m => m.author.id === client.user.id && m.content.startsWith('参加メンバー'));
                    if (existing) await existing.edit(text);
                    else await channel.send(text);
                } catch (err) { console.error('VC更新エラー:', err); }
            };

            if (oldState.channel) await updateVcIntro(oldState.channel);
            if (newState.channel) await updateVcIntro(newState.channel);
        } catch (e) { console.error('VCイベントエラー:', e); }
    },
};
