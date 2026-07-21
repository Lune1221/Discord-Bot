const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType } = require('discord.js');

function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)([mhdwy])$/);
    if (!match) return false;
    const value = parseInt(match, 10);
    const unit = match[2];
    switch (unit) {
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        case 'y': return value * 365 * 24 * 60 * 60 * 1000;
        default: return false;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('アンケートを作成します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(o => o.setName('question').setDescription('アンケートの質問内容を入力してください').setRequired(true))
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
        .addChannelOption(o => o.setName('channel').setDescription('アンケート本体を送る送信先チャンネル（空欄ならこの画面）').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addChannelOption(o => o.setName('log_channel').setDescription('投票結果のログをリアルタイムで送信する受付先チャンネル（省略可能）').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption(o => o.setName('duration').setDescription('期限（例: 30m, 1h, 1d）空欄なら期限なし（無制限）').setRequired(false))
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
        
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const logChannel = interaction.options.getChannel('log_channel');

        const c1 = interaction.options.getString('choice1');
        const c2 = interaction.options.getString('choice2');
        const c3 = interaction.options.getString('choice3');
        const c4 = interaction.options.getString('choice4');
        const c5 = interaction.options.getString('choice5');

        if (pollMethod === 'choice' && (!c1 || !c2)) {
            return await interaction.editReply({ content: '❌ ボタン形式を選ぶ場合は、最低でも選択肢1と選択肢2を入力してください。' });
        }

        const durationMs = parseDuration(durationInput);
        if (durationMs === false) {
            return await interaction.editReply({ content: '❌ 期限の書式が正しくありません。「30m」「1h」のように入力してください。' });
        }

        const endTime = durationMs ? Date.now() + durationMs : null;
        const endTimestampStr = endTime ? `<t:${Math.floor(endTime / 1000)}:R>` : 'なし（無制限）';

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
                embed.setTitle('投票受付中').setColor('#e67e22');
                if (pollMethod === 'choice') {
                    desc += `1️⃣ **${c1}** ： 🔒 投票中...\n2️⃣ **${c2}** ： 🔒 投票中...\n`;
                    if (c3) desc += `3️⃣ **${c3}** ： 🔒 投票中...\n`;
                    if (c4) desc += `4️⃣ **${c4}** ： 🔒 投票中...\n`;
                    if (c5) desc += `5️⃣ **${c5}** ： 🔒 投票中...\n`;
                } else {
                    desc += `*自由入力形式のシークレット投票です。選択肢は開票まで隠されています。*`;
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
                    desc += `1️⃣ **${c1}** ： **${votes.length} 票**\n2️⃣ **${c2}** ： **${votes.length} 票**\n`;
                    if (c3) desc += `3️⃣ **${c3}** ： **${votes.length} 票**\n`;
                    if (c4) desc += `4️⃣ **${c4}** ： **${votes.length} 票**\n`;
                    if (c5) desc += `5️⃣ **${c5}** ： **${votes.length} 票**\n`;
                } else {
                    const items = Object.entries(votes);
                    if (items.length === 0) {
                        desc += '*まだ選択肢がありません。下のボタンから意見を追加してね！*';
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

        const replyMessage = await targetChannel.send({ embeds: [generateEmbed()], components: rows });
        await interaction.editReply({ content: `✅ <#${targetChannel.id}> にアンケートを送信しました！` });

        const sendLogMessage = async (user, detailText) => {
            if (!logChannel) return;
            const logEmbed = new EmbedBuilder()
                .setTitle('📥 新しい投票（回答）を受付ました')
                .setDescription(`👤 投票者: <@${user.id}>\n📋 内容: ${detailText}`)
                .setColor('#2980b9')
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        };

        const collectorOptions = { componentType: ComponentType.Button };
        if (durationMs) collectorOptions.time = durationMs;

        const collector = replyMessage.createMessageComponentCollector(collectorOptions);

        collector.on('collect', async (btnInteraction) => {
            const voterId = btnInteraction.user.id;

            // 🟢 開票ボタンの処理（確実に最優先で判定させます）
            if (btnInteraction.customId === 'm_reveal_btn') {
                if (voterId !== creatorId) {
                    return await btnInteraction.reply({ content: '❌ このアンケートを開票できるのは作成者本人だけです。', ephemeral: true });
                }
                isRevealed = true;
                collector.stop();
                if (logChannel) await logChannel.send({ content: `🔓 アンケート「**${question}**」が作成者によって開票されました！` }).catch(() => {});
                return await btnInteraction.update({ embeds: [generateEmbed()], components: [] });
            }

            // 自由入力ボタンの処理
            if (btnInteraction.customId === 'm_free_btn') {
                const modal = new ModalBuilder().setCustomId(`m_modal_${replyMessage.id}`).setTitle('アンケートへの入力');
                const textInput = new TextInputBuilder()
                    .setCustomId('m_text_field')
                    .setLabel('追加または投票したい言葉を入力（20文字以内）')
                    .setPlaceholder('例: 焼き肉 / カレー などの言葉を入力')
                    .setStyle(TextInputStyle.Short)
                                modal.addComponents(new ActionRowBuilder().addComponents(textInput));
                return await btnInteraction.showModal(modal);
            }

            // 🟢 通常の数字ボタンの処理
            if (btnInteraction.customId.startsWith('m_vote_')) {
                // 配列の3番目[2]から正しく数値（1〜5）を取り出します
                const selectNum = parseInt(btnInteraction.customId.split('_')[2], 10);
                const choiceText = selectNum === 1 ? c1 : selectNum === 2 ? c2 : selectNum === 3 ? c3 : selectNum === 4 ? c4 : c5;

                for (const key in votes) { 
                    votes[key] = votes[key].filter(id => id !== voterId); 
                }
                if (votes[selectNum]) votes[selectNum].push(voterId);

                await btnInteraction.update({ embeds: [generateEmbed()] });
                await sendLogMessage(btnInteraction.user, `選択肢 [ ${selectNum} ] **${choiceText}** に投票しました。`);
            }
        });

        // ⏳ 期限切れ（タイマー終了）になったときの処理
        collector.on('end', async () => {
            if (durationMs) {
                isClosed = true;
                if (pollType === 'hidden') isRevealed = true;
                await replyMessage.edit({ embeds: [generateEmbed()], components: [] }).catch(() => {});
                if (logChannel) {
                    await logChannel.send({ content: `🛑 アンケート「**${question}**」は期限切れのため締め切りました。` }).catch(() => {});
                }
            }
            interaction.client.off('interactionCreate', modalListener);
        });

        // 📝 自由入力（文字ポップアップ）が送信されたときの処理
        const modalListener = async (modalInteraction) => {
            if (isClosed) return;
            if (!modalInteraction.isModalSubmit() || modalInteraction.customId !== `m_modal_${replyMessage.id}`) return;
            
            await modalInteraction.deferReply({ ephemeral: true });
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
                await sendLogMessage(modalInteraction.user, `新しい言葉 **「${inputWord}」** を入力して投票しました。`);
                await modalInteraction.editReply({ content: `✅ **「${inputWord}」** をアンケートに追加し、投票しました！` });
            }
        };

        interaction.client.on('interactionCreate', modalListener);
    }
};
