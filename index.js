async function initDatabase() {
    await pool.query(`CREATE TABLE IF NOT EXISTS message_counts (user_id TEXT, guild_id TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (user_id, guild_id));`);
    await pool.query(`CREATE TABLE IF NOT EXISTS omikuji_cooldowns (user_id TEXT, guild_id TEXT, last_date TEXT, PRIMARY KEY (user_id, guild_id));`);
    await pool.query(`CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, level_channel_id TEXT);`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS sticky_messages (
            channel_id VARCHAR(32) PRIMARY KEY,
            message_id VARCHAR(32),
            title TEXT,
            description TEXT
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS scheduled_messages (
            id SERIAL PRIMARY KEY,
            guild_id TEXT,
            channel_id TEXT,
            author_id TEXT,
            message_content TEXT,
            send_at TIMESTAMP
        )
    `);
    
    // 🟢 古いテーブル構造が残っているとエラーになるため、一度削除して新しく作り直す
    await pool.query(`DROP TABLE IF EXISTS intro_channel_settings;`);
    await pool.query(`
        CREATE TABLE intro_channel_settings (
            id SERIAL PRIMARY KEY,
            guild_id TEXT,
            source_channel_id TEXT,
            keyword TEXT DEFAULT '名前：'
        )
    `);
}
