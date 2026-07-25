const { SlashCommandBuilder } = require('discord.js');

// 許可されたあなた自身のユーザーID
const ALLOWED_USER_ID = '1458334854935744533';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('massping')
        .setDescription('指定した回数だけメンションを連投します（自分専用）')
        .addIntegerOption(opt => 
            opt.setName('count')
                .setDescription('送信回数（最大2000）')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('type')
                .setDescription('メンションの種類')
                .addChoices(
                    { name: '@here', value: '@here' },
                    { name: '@everyone', value: '@everyone' }
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        // ユーザーIDのチェック
        if (interaction.user.id !== ALLOWED_USER_ID) {
            return await interaction.editReply({ content: '❌ このコマンドを使用する権限がありません。' });
        }

        const rawCount = interaction.options.getInteger('count');
        const mentionType = interaction.options.getString('type');
        
        // 最大2000回までに制限
        const targetCount = Math.min(Math.max(rawCount, 1), 2000);

        // 💡 editReplyを使って「考え中...」を正常に完了させる
        await interaction.editReply({ content: `🚀 ${mentionType} の連投を開始します（目標: ${targetCount}回）` });

        let successCount = 0;

        for (let i = 0; i < targetCount; i++) {
            try {
                // メッセージを送信
                await interaction.channel.send(`${mentionType} (${i + 1}/${targetCount})`);
                successCount++;

                // レートリミット回避のためのウェイト（0.3秒）
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error(`送信エラー (${i + 1}回目):`, error);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        try {
            await interaction.channel.send(`✨ 連投が完了しました（成功: ${successCount}/${targetCount}回）`);
        } catch (e) {}
    }
};
