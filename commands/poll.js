const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');

function parseDuration(str) {
    if (!str) return 86400000;
    const match = str.match(/^(\d+)([mhdwy])$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        case 'y': return value * 365 * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('高機能なアンケート（投票）を作成します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(o => o.setName('question').setDescription('アンケートの質問・お題内容を入力してください').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('結果の表示形式を選んでください').setRequired(true)
            .addChoices(
                { name: '🔓 通常（いつでも結果が見える）', value: 'open' },
                { name: '🔒 シークレット（最後に開票する）', value: 'hidden' }
            ))
        .addStringOption(o => o.setName('method').setDescription('投票の形式を選んでください').setRequired(true)
            .addChoices(
                { name: '🔘 ボタン（決まった選択肢から選ぶ）', value: 'choice' },
                { name: '📝 自由入力（文字を直接入力して追加する）', value: 'input' }
            ))
        .addStringOption(o => o.setName('duration').setDescription('期限を入力（例: 30m, 1h, 1d, 1y）空欄なら24時間').setRequired(false))
        .addStringOption(o => o.setName('choice1').setDescription('選択肢1（ボタン形式の時のみ入力）').setRequired(false))
        .addStringOption(o => o.setName('choice2').setDescription('選択肢2（ボタン形式の時のみ入力）').setRequired(false))
        .addStringOption(o => o.setName('choice3').setDescription('選択肢3（省略可能）').setRequired(false))
        .addStringOption(o => o.setName('choice4').setDescription('選択肢4（省略可能）').setRequired(false))
        .addStringOption(o => o.setName('choice5').setDescription('選択肢5（省略可能）').setRequired(false)),

    async execute(interaction, pool) {
        const creatorId = interaction.user.id;
        const guildId = interaction.guild?.id;
        const question = interaction.options.getString('question');
        const pollType = interaction.options.getString('type');
        const pollMethod = interaction.options.getString('method');
        const durationInput = interaction.options.getString('duration');

        const c1 = interaction.options.getString('choice1');
        const c2 = interaction.options.getString('choice2');
        const c3 = interaction.options.getString('choice3');
        const c4 = interaction.options.getString('choice4');
        const c5 = interaction.options.getString('choice5');

        if (pollMethod === 'choice' && (!c1 || !c2)) {
            return await interaction.editReply({ content: '❌ ボタン形式（choice）を選ぶ場合は、最低でも「選択肢1」と「選択肢2」を入力してください。' });
        }

        const durationMs = parseDuration(durationInput);
        if (durationMs === null) {
            return await interaction.editReply({ content: '❌ 期限の書式が正しくありません。「30m」「1h」「2d」「1y」のように半角英数字で入力してください。' });
        }

        const endTime = Date.now() + durationMs;
        const endTimestampStr = `<t:${Math.floor(endTime / 1000)}:R>`;

        const votes = pollMethod === 'choice' ? { 1: [], 2: [], 3: [], 4: [], 5: [] } : {};
        let isRevealed = false;
        let isClosed = false;

        const generateEmbed = () => {
            const embed = new EmbedBuilder().setTimestamp();
            let desc = `📊 **${question}**\n\n`;

            if (!isClosed) {
                desc += `⏳ 投票期限: ${endTimestampStr}\n\n`;
            } else {
                desc += `🛑 **このアンケートは締め切られました**\n\n`;
            }

            if (pollType === 'hidden' && !isRevealed) {
                embed.setTitle('🔒 シークレット投票受付中！').setColor('#e67e22');
                if (pollMethod === 'choice') {
                    desc += `1️⃣ **${c1}** ： 🔒 投票中...\n2️⃣ **${c2}** ： 🔒 投票中...\n`;
                    if (c3) desc += `3️⃣ **${c3}** ： 🔒 投票中...\n`;
                    if (c4) desc += `4️⃣ **${c4}** ： 🔒 投票中...\n`;
                    if (c5) desc += `5️⃣ **${c5}** ： 🔒 投票中...\n`;
                } else {
                    desc += `*自由入力形式のシークレット投票です。*\n*現在登録されている選択肢も含めてすべて隠されています。*`;
                }
                const totalVotes = Object.values(votes).reduce((sum, arr) => sum + arr.length, 0);
                embed.setDescription(desc).setFooter({ text: isClosed ? '受付終了' : `現在合計: ${totalVotes} 票 | 作成者が「開票」を押すと結果が出ます` });
            } else {
                if (pollType === 'hidden') {
                    embed.setTitle('🔓 アンケート開票結果！').setColor('#2ecc71');
                } else {
                    embed.setTitle(isClosed ? '🏁 アンケート結果発表！' : (pollMethod === 'choice' ? '📢 アンケート投票受付中！' : '📝 自由入力型アンケート受付中！')).setColor(isClosed ? '#2ecc71' : (pollMethod === 'choice' ? '#9b59b6' : '#34495e'));
                }

                if (pollMethod === 'choice') {
                    desc += `1️⃣ **${c1}** ： **${votes[1].length} 票**\n2️⃣ **${c2}** ： **${votes[2].length} 票**\n`;
                    if (c3) desc += `3️⃣ **${c3}** ： **${votes[3].length} 票**\n`;
                    if (c4) desc += `4️⃣ **${c4}** ： **${votes[4].length} 票**\n`;
                    if (c5) desc += `5️⃣ **${c5}** ： **${votes[5].length} 票**\n`;
                } else {
                    const items = Object.entries(votes);
                    if (items.length === 0) {
                        desc += '*まだ選択肢がありません。下のボタンからあなたの意見を自由に追加してね！*';
                    } else {
                        items.forEach(([word, voters], index) => { desc += `${index + 1}. **${word}** ： **${voters.length} 票**\n`; });
                    }
                }
                embed.setDescription(desc).setFooter({ text: isClosed ? '投票は締め切られました' : 'ボタンを押して投票・入力してね（選び直し可能です）' });
            }
            return embed;
        };

        const rows = [];
        if (pollMethod === 'choice') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('m_vote_1').setLabel('1️⃣').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('m_vote_2').setLabel('2️⃣').setStyle(ButtonStyle.Secondary)
            );
            if (c3) row.addComponents(new ButtonBuilder().setCustomId('m_vote_3').setLabel('3️⃣').setStyle(ButtonStyle.Secondary));
            if (c4) row.addComponents(new ButtonBuilder().setCustomId('m_vote_4').setLabel('4️⃣').setStyle(ButtonStyle.Secondary));
            if (c5) row.addComponents(new ButtonBuilder().setCustomId('m_vote_5').setLabel('5️⃣').setStyle(ButtonStyle.Secondary));
            rows.push(row);
        } else {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('m_free_btn').setLabel('➕ 言葉を追加・投票する').setStyle(ButtonStyle.Primary)
            );
            rows.push(row);
        }

        if (pollType === 'hidden') {
            const controlRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('m_reveal_btn').setLabel('🔓 結果を開票する').setStyle(ButtonStyle.Success)
            );
            rows.push(controlRow);
        }

        const replyMessage = await interaction.editReply({ embeds: [generateEmbed()], components: rows });
        const collector = replyMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: durationMs });

        collector.on('collect', async (btnInteraction) => {
            const voterId = btnInteraction.user.id;

            if (btnInteraction.customId === 'm_reveal_btn') {
                if (voterId !== creatorId) {
                    return await btnInteraction.reply({ content: '❌ このアンケートを開票できるのは作成者本人だけです。', ephemeral: true });
                }
                isRevealed = true;
                collector.stop();
                return await btnInteraction.update({ embeds: [generateEmbed()], components: [] });
            }

            if (btnInteraction.customId === 'm_free_btn') {
                const modal = new ModalBuilder().setCustomId(`m_modal_${replyMessage.id}`).setTitle('アンケートへの入力');
                const textInput = new TextInputBuilder()
                    .setCustomId('m_text_field')
                    .setLabel('追加または投票したい言葉を入力（20文字以内）')
                    .setPlaceholder('例: 焼き肉 / カレー など')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(20)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(textInput));
                return await btnInteraction.showModal(modal);
            }

            const selectNum = parseInt(btnInteraction.customId.split('_')[2], 10);
            for (const key in votes) { votes[key] = votes[key].filter(id => id !== voterId); }
            votes[selectNum].push(voterId);

            await btnInteraction.update({ embeds: [generateEmbed()] });
        });

        collector.on('end', async () => {
            isClosed = true;
            if (pollType === 'hidden') isRevealed = true;
            await replyMessage.edit({ embeds: [generateEmbed()], components: [] }).catch(() => {});
            interaction.client.off('interactionCreate', modalListener);
        });

        const modalListener = async (modalInteraction) => {
            if (isClosed) return;
            if (!modalInteraction.isModalSubmit() || modalInteraction.customId !== `m_modal_${replyMessage.id}`) return;
            
            await modalInteraction.deferUpdate();
            const inputWord = modalInteraction.fields.getTextInputValue('m_text_field').trim();
            const voterId = modalInteraction.user.id;
                     if (inputWord) {
                for (const key in votes) { 
                    votes[key] = votes[key].filter(id => id !== voterId); 
                }
                if (!votes[inputWord]) { 
                    votes[inputWord] = []; 
                }
                votes[inputWord].push(voterId);

                for (const key in votes) { 
                    if (votes[key].length === 0) delete votes[key]; 
                }
                await replyMessage.edit({ embeds: [generateEmbed()] });
            }
        };

        interaction.client.on('interactionCreate', modalListener);
    }
};
