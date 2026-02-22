use rusqlite::Connection;
use std::fs;
use std::path::Path;

pub fn init_db(db_path: &str) -> Connection {
    if let Some(parent) = Path::new(db_path).parent() {
        fs::create_dir_all(parent).expect("Failed to create data directory");
    }

    let conn = Connection::open(db_path).expect("Failed to open SQLite database");

    // Enable WAL mode for concurrent reads
    conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();

    create_tables(&conn);
    conn
}

fn create_tables(conn: &Connection) {
    conn.execute_batch(
        "
        -- Users
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Todos
        CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            text TEXT NOT NULL,
            content TEXT DEFAULT '',
            tab TEXT NOT NULL DEFAULT 'today',
            quadrant TEXT NOT NULL DEFAULT 'not-important-not-urgent',
            progress INTEGER DEFAULT 0,
            completed INTEGER DEFAULT 0,
            completed_at TEXT,
            deleted INTEGER DEFAULT 0,
            due_date TEXT,
            assignee TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            sort_order REAL DEFAULT 0.0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_todos_user_tab ON todos(user_id, tab, deleted);

        -- Todo changelog
        CREATE TABLE IF NOT EXISTS todo_changelog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
            time TEXT NOT NULL,
            field TEXT NOT NULL,
            from_val TEXT,
            to_val TEXT,
            label TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_changelog_todo ON todo_changelog(todo_id);

        -- Routines
        CREATE TABLE IF NOT EXISTS routines (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            text TEXT NOT NULL,
            completed_today INTEGER DEFAULT 0,
            last_completed_date TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);

        -- Reviews
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            text TEXT NOT NULL,
            frequency TEXT NOT NULL,
            frequency_config TEXT DEFAULT '{}',
            notes TEXT DEFAULT '',
            category TEXT DEFAULT '',
            last_completed TEXT,
            paused INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

        -- Sessions
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

        -- Conversations (for 阿宝)
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            title TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            is_archived INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);

        -- Chat messages
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content_text TEXT,
            content_json TEXT,
            tool_name TEXT,
            token_count INTEGER,
            created_at TEXT NOT NULL,
            sequence INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON chat_messages(conversation_id, sequence);

        -- Chat usage log
        CREATE TABLE IF NOT EXISTS chat_usage_log (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            conversation_id TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            tool_calls INTEGER DEFAULT 0,
            latency_ms INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_user ON chat_usage_log(user_id, created_at DESC);

        -- English scenarios
        CREATE TABLE IF NOT EXISTS english_scenarios (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            title_en TEXT DEFAULT '',
            description TEXT DEFAULT '',
            icon TEXT DEFAULT '📖',
            content TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft',
            archived INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scenarios_user ON english_scenarios(user_id, archived);

        -- Friendships
        CREATE TABLE IF NOT EXISTS friendships (
            id TEXT PRIMARY KEY,
            requester_id TEXT NOT NULL REFERENCES users(id),
            addressee_id TEXT NOT NULL REFERENCES users(id),
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(requester_id, addressee_id)
        );
        CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships(requester_id, addressee_id, status);

        -- Shared items
        CREATE TABLE IF NOT EXISTS shared_items (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL REFERENCES users(id),
            recipient_id TEXT NOT NULL REFERENCES users(id),
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_snapshot TEXT NOT NULL,
            message TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'unread',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_shared_recipient ON shared_items(recipient_id, status);

        -- Contacts (address book)
        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            name TEXT NOT NULL,
            linked_user_id TEXT REFERENCES users(id),
            friendship_id TEXT REFERENCES friendships(id),
            note TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, linked_user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
        ",
    )
    .expect("Failed to create tables");
}

/// Daily backup: VACUUM INTO backup file
pub fn daily_backup(conn: &Connection, backup_dir: &str) {
    fs::create_dir_all(backup_dir).ok();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let backup_path = format!("{}/next-{}.db", backup_dir, today);

    if !Path::new(&backup_path).exists() {
        let sql = format!("VACUUM INTO '{}'", backup_path);
        if let Err(e) = conn.execute_batch(&sql) {
            eprintln!("Backup failed: {}", e);
        } else {
            println!("Backup created: {}", backup_path);
            cleanup_old_backups(backup_dir, 30);
        }
    }
}

fn cleanup_old_backups(backup_dir: &str, keep_days: i64) {
    let cutoff = chrono::Local::now() - chrono::Duration::days(keep_days);
    if let Ok(entries) = fs::read_dir(backup_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let modified: chrono::DateTime<chrono::Local> = modified.into();
                    if modified < cutoff {
                        fs::remove_file(entry.path()).ok();
                    }
                }
            }
        }
    }
}
