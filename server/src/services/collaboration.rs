use rusqlite::Connection;

/// Check if two users are friends (accepted friendship in either direction)
pub fn check_friendship(db: &Connection, user_id: &str, friend_id: &str) -> bool {
    let result: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM friendships WHERE status = 'accepted' AND ((requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1))",
            rusqlite::params![user_id, friend_id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    result
}

/// Get user display name (falls back to username)
pub fn get_user_display_name(db: &Connection, user_id: &str) -> Option<String> {
    db.query_row(
        "SELECT COALESCE(display_name, username) FROM users WHERE id = ?1",
        [user_id],
        |row| row.get(0),
    )
    .ok()
}

/// Check if user owns a todo
pub fn check_todo_owner(db: &Connection, todo_id: &str, user_id: &str) -> bool {
    let result: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM todos WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![todo_id, user_id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    result
}

/// Check if user is a collaborator on a todo
pub fn check_todo_collaborator(db: &Connection, todo_id: &str, user_id: &str) -> bool {
    let result: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM todo_collaborators WHERE todo_id = ?1 AND user_id = ?2 AND status = 'active'",
            rusqlite::params![todo_id, user_id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    result
}

/// Check if user is a participant (owner or collaborator) of a todo
pub fn check_todo_participant(db: &Connection, todo_id: &str, user_id: &str) -> bool {
    check_todo_owner(db, todo_id, user_id) || check_todo_collaborator(db, todo_id, user_id)
}

/// Get the owner user_id of a todo
pub fn get_todo_owner(db: &Connection, todo_id: &str) -> Option<String> {
    db.query_row(
        "SELECT user_id FROM todos WHERE id = ?1",
        [todo_id],
        |row| row.get(0),
    )
    .ok()
}

/// Check if a todo is collaborative
pub fn is_todo_collaborative(db: &Connection, todo_id: &str) -> bool {
    let result: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM todo_collaborators WHERE todo_id = ?1 AND status = 'active'",
            [todo_id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    result
}

/// Count active collaborators for a todo
pub fn count_active_collaborators(db: &Connection, todo_id: &str) -> i32 {
    db.query_row(
        "SELECT COUNT(*) FROM todo_collaborators WHERE todo_id = ?1 AND status = 'active'",
        [todo_id],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

/// Get all participant user_ids for a todo (owner + collaborators)
pub fn get_all_participants(db: &Connection, todo_id: &str) -> Vec<String> {
    let mut participants = Vec::new();
    if let Some(owner) = get_todo_owner(db, todo_id) {
        participants.push(owner);
    }
    let mut stmt = db
        .prepare("SELECT user_id FROM todo_collaborators WHERE todo_id = ?1 AND status = 'active'")
        .unwrap();
    let collab_ids: Vec<String> = stmt
        .query_map([todo_id], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    participants.extend(collab_ids);
    participants
}

/// Check if all participants (except initiator) have responded to a confirmation
pub fn check_all_responded(db: &Connection, confirmation_id: &str, initiated_by: &str, todo_id: &str) -> (bool, bool) {
    let participants = get_all_participants(db, todo_id);
    let other_participants: Vec<&String> = participants.iter().filter(|p| *p != initiated_by).collect();

    if other_participants.is_empty() {
        return (true, true);
    }

    let mut all_responded = true;
    let mut all_approved = true;
    let mut any_rejected = false;

    for participant in &other_participants {
        let response: Option<String> = db
            .query_row(
                "SELECT response FROM confirmation_responses WHERE confirmation_id = ?1 AND user_id = ?2",
                rusqlite::params![confirmation_id, participant],
                |row| row.get(0),
            )
            .ok();

        match response {
            Some(r) => {
                if r == "reject" {
                    any_rejected = true;
                    all_approved = false;
                }
            }
            None => {
                all_responded = false;
                all_approved = false;
            }
        }
    }

    if any_rejected {
        return (true, false);
    }

    (all_responded, all_approved)
}

/// Execute the action from a resolved confirmation
pub fn execute_confirmation_action(db: &Connection, item_type: &str, item_id: &str, action: &str) {
    if item_type != "todo" {
        return;
    }

    let now = chrono::Utc::now().to_rfc3339();

    match action {
        "complete" => {
            db.execute(
                "UPDATE todos SET completed = 1, completed_at = ?1, progress = 100, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, item_id],
            )
            .ok();
        }
        "delete" => {
            db.execute(
                "UPDATE todos SET deleted = 1, deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, item_id],
            )
            .ok();
        }
        _ => {}
    }
}

/// Get collaboration info for a todo from the perspective of a user
pub fn get_collab_info(db: &Connection, todo_id: &str, user_id: &str) -> Option<crate::models::collaboration::CollabInfo> {
    if !is_todo_collaborative(db, todo_id) {
        return None;
    }

    let is_owner = check_todo_owner(db, todo_id, user_id);
    let my_role = if is_owner { "owner" } else { "collaborator" };

    // Get the other person's name
    let collaborator_name = if is_owner {
        // Owner sees collaborator names
        let mut stmt = db
            .prepare("SELECT COALESCE(u.display_name, u.username) FROM todo_collaborators tc JOIN users u ON tc.user_id = u.id WHERE tc.todo_id = ?1 AND tc.status = 'active' LIMIT 1")
            .unwrap();
        stmt.query_row([todo_id], |row| row.get(0)).ok()
    } else {
        // Collaborator sees owner name
        if let Some(owner_id) = get_todo_owner(db, todo_id) {
            get_user_display_name(db, &owner_id)
        } else {
            None
        }
    };

    Some(crate::models::collaboration::CollabInfo {
        is_collaborative: true,
        collaborator_name,
        my_role: my_role.to_string(),
    })
}
