const config = require('../config');

// ユーザーごとの直近のメッセージ送信履歴を保存するマップ
const userMessageLog = new Map();

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        // ボット自身のメッセージや、機能がオフの場合はスルー
        if (message.author.bot || !config.antiSpamEnabled) return;

        const userId = message.author.id;
        const now = Date.now();

        if (!userMessageLog.has(userId)) {
            userMessageLog.set(userId, []);
        }

        const timestamps = userMessageLog.get(userId);
        
        // 5秒以内の履歴を残す
        const timeWindow = 5000;
        timestamps.push(now);
        const recentMessages = timestamps.filter(time => now - time < timeWindow);
        userMessageLog.set(userId, recentMessages);

        // 5秒間に5メッセージ以上投稿された場合を「荒らし（スパム）」とみなす
        if (recentMessages.length >= 5) {
            try {
                await message.delete();
                const warning = await message.channel.send(`⚠️ ${message.author}さん、短時間の連続投稿はスパムとみなされるためお控えください。`);
                
                // 5秒後に警告メッセージを自動削除
                setTimeout(() => warning.delete().catch(() => {}), 5000);
                
                // ログをリセット
                userMessageLog.set(userId, []);
            } catch (error) {
                console.error('荒らし対策の処理中にエラーが発生しました:', error);
            }
        }
    },
};
