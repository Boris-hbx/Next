use rusqlite::Connection;

/// Check if two users are friends (accepted friendship exists)
pub fn check_friendship(db: &Connection, user_id: &str, friend_id: &str) -> bool {
    db.query_row(
        "SELECT COUNT(*) > 0 FROM friendships WHERE status = 'accepted' AND ((requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1))",
        rusqlite::params![user_id, friend_id],
        |r| r.get(0),
    )
    .unwrap_or(false)
}

/// Get the user's role for a todo: "owner", "collaborator", or None
pub fn get_user_role_for_todo(db: &Connection, todo_id: &str, user_id: &str) -> Option<String> {
    // Check if owner
    let is_owner: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM todos WHERE id = ?1 AND user_id = ?2 AND deleted = 0",
            rusqlite::params![todo_id, user_id],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if is_owner {
        return Some("owner".to_string());
    }

    // Check if collaborator
    let is_collab: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM todo_collaborators WHERE todo_id = ?1 AND user_id = ?2 AND status = 'active'",
            rusqlite::params![todo_id, user_id],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if is_collab {
        return Some("collaborator".to_string());
    }

    None
}

/// Check if a todo is collaborative
pub fn is_collaborative_todo(db: &Connection, todo_id: &str) -> bool {
    db.query_row(
        "SELECT COALESCE(is_collaborative, 0) FROM todos WHERE id = ?1",
        [todo_id],
        |r| r.get::<_, i32>(0),
    )
    .unwrap_or(0) != 0
}

/// Get display name for a user (display_name or username)
pub fn get_user_display_name(db: &Connection, user_id: &str) -> String {
    db.query_row(
        "SELECT COALESCE(display_name, username) FROM users WHERE id = ?1",
        [user_id],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "未知用户".to_string())
}
