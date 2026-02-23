use rusqlite::Connection;
use serde_json::{json, Value};

/// Ensure collaboration tables exist (idempotent)
fn ensure_collab_tables(db: &Connection) {
    db.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS todo_collaborators (
            id TEXT PRIMARY KEY,
            todo_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            tab TEXT NOT NULL DEFAULT 'today',
            quadrant TEXT NOT NULL DEFAULT 'not-important-not-urgent',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            UNIQUE(todo_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_todo_collab_user ON todo_collaborators(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_todo_collab_todo ON todo_collaborators(todo_id);
        CREATE TABLE IF NOT EXISTS pending_confirmations (
            id TEXT PRIMARY KEY,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            action TEXT NOT NULL,
            initiated_by TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            resolved_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pending_conf_status ON pending_confirmations(status);
        ",
    )
    .ok();

    let has_todo_collab: bool = db
        .prepare("SELECT is_collaborative FROM todos LIMIT 0")
        .is_ok();
    if !has_todo_collab {
        db.execute_batch("ALTER TABLE todos ADD COLUMN is_collaborative INTEGER DEFAULT 0;")
            .ok();
    }
}

fn check_friendship(db: &Connection, user_id: &str, friend_id: &str) -> bool {
    db.query_row(
        "SELECT COUNT(*) > 0 FROM friendships WHERE status = 'accepted'
         AND ((requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1))",
        rusqlite::params![user_id, friend_id],
        |r| r.get(0),
    )
    .unwrap_or(false)
}

fn get_user_display_name(db: &Connection, uid: &str) -> Option<String> {
    db.query_row(
        "SELECT COALESCE(display_name, username) FROM users WHERE id = ?1",
        [uid],
        |r| r.get(0),
    )
    .ok()
}

/// Execute a tool call and return the result as JSON
pub fn execute_tool(db: &Connection, user_id: &str, tool_name: &str, input: &Value) -> Value {
    match tool_name {
        "create_todo" => tool_create_todo(db, user_id, input),
        "update_todo" => tool_update_todo(db, user_id, input),
        "delete_todo" => tool_delete_todo(db, user_id, input),
        "restore_todo" => tool_restore_todo(db, user_id, input),
        "query_todos" => tool_query_todos(db, user_id, input),
        "batch_update_todos" => tool_batch_update_todos(db, user_id, input),
        "create_routine" => tool_create_routine(db, user_id, input),
        "create_review" => tool_create_review(db, user_id, input),
        "get_statistics" => tool_get_statistics(db, user_id, input),
        "get_current_datetime" => tool_get_current_datetime(),
        "create_english_scenario" => tool_create_english_scenario(db, user_id, input),
        "query_english_scenarios" => tool_query_english_scenarios(db, user_id, input),
        "create_reminder" => tool_create_reminder(db, user_id, input),
        "query_reminders" => tool_query_reminders(db, user_id, input),
        "cancel_reminder" => tool_cancel_reminder(db, user_id, input),
        "snooze_reminder" => tool_snooze_reminder(db, user_id, input),
        _ => json!({"error": format!("Unknown tool: {}", tool_name)}),
    }
}

/// Return tool definitions for Claude API
pub fn tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "create_todo",
            "description": "创建一个新任务",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "任务标题"},
                    "tab": {"type": "string", "enum": ["today", "week", "month"], "description": "时间维度，默认 today"},
                    "quadrant": {"type": "string", "enum": ["important-urgent", "important-not-urgent", "not-important-urgent", "not-important-not-urgent"], "description": "优先级象限"},
                    "due_date": {"type": "string", "description": "截止日期 YYYY-MM-DD"},
                    "assignee": {"type": "string", "description": "负责人"},
                    "tags": {"type": "array", "items": {"type": "string"}, "description": "标签"},
                    "collaborator": {"type": "string", "description": "协作者用户ID（需为好友）"}
                },
                "required": ["text"]
            }
        }),
        json!({
            "name": "update_todo",
            "description": "更新一个任务的属性",
            "input_schema": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "任务ID"},
                    "text": {"type": "string", "description": "新标题"},
                    "tab": {"type": "string", "enum": ["today", "week", "month"]},
                    "quadrant": {"type": "string", "enum": ["important-urgent", "important-not-urgent", "not-important-urgent", "not-important-not-urgent"]},
                    "progress": {"type": "integer", "minimum": 0, "maximum": 100},
                    "due_date": {"type": "string"},
                    "completed": {"type": "boolean"}
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "delete_todo",
            "description": "软删除一个任务（可恢复）",
            "input_schema": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "任务ID"}
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "restore_todo",
            "description": "恢复一个已删除的任务",
            "input_schema": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "任务ID"}
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "query_todos",
            "description": "查询任务列表，支持多种过滤条件。也会返回协作任务。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "tab": {"type": "string", "enum": ["today", "week", "month"], "description": "按时间维度过滤"},
                    "quadrant": {"type": "string", "description": "按象限过滤"},
                    "completed": {"type": "boolean", "description": "按完成状态过滤"},
                    "keyword": {"type": "string", "description": "按关键词搜索标题"},
                    "assignee": {"type": "string", "description": "按负责人过滤"},
                    "tag": {"type": "string", "description": "按标签过滤"}
                }
            }
        }),
        json!({
            "name": "batch_update_todos",
            "description": "批量更新多个任务",
            "input_schema": {
                "type": "object",
                "properties": {
                    "updates": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "tab": {"type": "string"},
                                "quadrant": {"type": "string"},
                                "progress": {"type": "integer"},
                                "completed": {"type": "boolean"}
                            },
                            "required": ["id"]
                        },
                        "description": "批量更新列表"
                    }
                },
                "required": ["updates"]
            }
        }),
        json!({
            "name": "create_routine",
            "description": "创建一个例行任务（每天重复）",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "例行任务内容"}
                },
                "required": ["text"]
            }
        }),
        json!({
            "name": "create_review",
            "description": "创建一个审视项（定期检查的事项）",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "审视项内容"},
                    "frequency": {"type": "string", "enum": ["daily", "weekly", "monthly", "yearly"], "description": "频率"},
                    "frequency_config": {"type": "object", "description": "频率配置，如 {day_of_week: 1} 表示每周一"}
                },
                "required": ["text", "frequency"]
            }
        }),
        json!({
            "name": "get_statistics",
            "description": "获取用户的任务统计数据",
            "input_schema": {
                "type": "object",
                "properties": {
                    "period": {"type": "string", "enum": ["today", "week", "month", "all"], "description": "统计周期"}
                },
                "required": ["period"]
            }
        }),
        json!({
            "name": "get_current_datetime",
            "description": "获取当前日期和时间",
            "input_schema": {
                "type": "object",
                "properties": {}
            }
        }),
        json!({
            "name": "create_english_scenario",
            "description": "创建一个学习场景（支持英语、编程、职场、生活等分类），创建后会自动生成学习内容",
            "input_schema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "学习主题，如：银行开户、Python 入门、时间管理"},
                    "description": {"type": "string", "description": "补充说明，帮助生成更精准的内容"},
                    "category": {"type": "string", "enum": ["英语", "编程", "职场", "生活", "其他"], "description": "分类，默认英语"}
                },
                "required": ["title"]
            }
        }),
        json!({
            "name": "query_english_scenarios",
            "description": "查询用户的学习场景列表",
            "input_schema": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "按关键词搜索场景标题"}
                }
            }
        }),
        json!({
            "name": "create_reminder",
            "description": "创建一个定时提醒。用户说'X点提醒我做Y'时使用此工具。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "提醒内容，如'开会'、'吃药'、'接孩子'"},
                    "remind_at": {"type": "string", "description": "提醒时间，ISO 8601 带时区偏移，如 '2026-02-21T15:00:00+08:00'。必须是未来的时间。"},
                    "related_todo_id": {"type": "string", "description": "关联的任务ID（可选）"},
                    "repeat": {"type": "string", "enum": ["daily", "weekly", "monthly"], "description": "重复频率（可选）"}
                },
                "required": ["text", "remind_at"]
            }
        }),
        json!({
            "name": "query_reminders",
            "description": "查询用户的提醒列表",
            "input_schema": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["pending", "triggered", "all"], "description": "按状态过滤，默认 pending"}
                }
            }
        }),
        json!({
            "name": "cancel_reminder",
            "description": "取消一个提醒",
            "input_schema": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "提醒ID"}
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "snooze_reminder",
            "description": "推迟一个已触发的提醒",
            "input_schema": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "提醒ID"},
                    "minutes": {"type": "integer", "description": "推迟分钟数，默认5分钟", "minimum": 1, "maximum": 120}
                },
                "required": ["id"]
            }
        }),
    ]
}

// ─── Tool implementations ───

fn tool_create_todo(db: &Connection, user_id: &str, input: &Value) -> Value {
    ensure_collab_tables(db);
    let text = input["text"].as_str().unwrap_or("").to_string();
    if text.is_empty() {
        return json!({"error": "text is required"});
    }
    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let due_date = input["due_date"].as_str();
    // When due_date is provided, auto-compute tab from date; otherwise use Claude's choice
    let tab = match due_date {
        Some(d) => compute_tab_for_date(d),
        None => input["tab"].as_str().unwrap_or("today"),
    };
    let quadrant = input["quadrant"]
        .as_str()
        .unwrap_or("not-important-not-urgent");
    let assignee = input["assignee"].as_str().unwrap_or("");
    let tags: Vec<String> = input["tags"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let collaborator = input["collaborator"].as_str();
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(collab_id) = collaborator {
        if !check_friendship(db, user_id, collab_id) {
            return json!({"error": "协作者不是你的好友"});
        }
    }

    let is_collab = if collaborator.is_some() { 1 } else { 0 };

    let result = db.execute(
        "INSERT INTO todos (id, user_id, text, content, tab, quadrant, progress, completed, due_date, assignee, tags, sort_order, created_at, updated_at, is_collaborative) VALUES (?1, ?2, ?3, '', ?4, ?5, 0, 0, ?6, ?7, ?8, 0.0, ?9, ?10, ?11)",
        rusqlite::params![id, user_id, text, tab, quadrant, due_date, assignee, serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into()), now, now, is_collab],
    );

    if let Some(collab_id) = collaborator {
        if result.is_ok() {
            let tc_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
            db.execute(
                "INSERT INTO todo_collaborators (id, todo_id, user_id, tab, quadrant, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)",
                rusqlite::params![tc_id, id, collab_id, tab, quadrant, now],
            ).ok();
        }
    }

    match result {
        Ok(_) => {
            let mut resp =
                json!({"success": true, "id": id, "text": text, "tab": tab, "quadrant": quadrant});
            if let Some(cid) = collaborator {
                resp["collaborative"] = json!(true);
                resp["collaborator_name"] = json!(get_user_display_name(db, cid));
            }
            resp
        }
        Err(e) => json!({"error": format!("Failed to create todo: {}", e)}),
    }
}

fn tool_update_todo(db: &Connection, user_id: &str, input: &Value) -> Value {
    ensure_collab_tables(db);
    let id = match input["id"].as_str() {
        Some(id) => id,
        None => return json!({"error": "id is required"}),
    };

    let is_owner: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM todos WHERE id=?1 AND user_id=?2",
            rusqlite::params![id, user_id],
            |r| r.get(0),
        )
        .unwrap_or(false);

    let is_collaborator: bool = if !is_owner {
        db.query_row(
            "SELECT COUNT(*) > 0 FROM todo_collaborators WHERE todo_id=?1 AND user_id=?2 AND status='active'",
            rusqlite::params![id, user_id],
            |r| r.get(0),
        )
        .unwrap_or(false)
    } else {
        false
    };

    if !is_owner && !is_collaborator {
        return json!({"error": "Task not found"});
    }

    let mut sets = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if is_owner {
        if let Some(v) = input["text"].as_str() {
            sets.push(format!("text=?{}", idx));
            params.push(Box::new(v.to_string()));
            idx += 1;
        }
        if let Some(v) = input["tab"].as_str() {
            sets.push(format!("tab=?{}", idx));
            params.push(Box::new(v.to_string()));
            idx += 1;
        }
        if let Some(v) = input["quadrant"].as_str() {
            sets.push(format!("quadrant=?{}", idx));
            params.push(Box::new(v.to_string()));
            idx += 1;
        }
        if let Some(v) = input["due_date"].as_str() {
            sets.push(format!("due_date=?{}", idx));
            params.push(Box::new(v.to_string()));
            idx += 1;
        }
    }

    if let Some(v) = input["progress"].as_i64() {
        sets.push(format!("progress=?{}", idx));
        params.push(Box::new(v));
        idx += 1;
        if v >= 100 {
            sets.push(format!("completed=1, completed_at=?{}", idx));
            params.push(Box::new(chrono::Utc::now().to_rfc3339()));
            idx += 1;
        }
    }

    if let Some(v) = input["completed"].as_bool() {
        sets.push(format!("completed=?{}", idx));
        params.push(Box::new(v as i32));
        idx += 1;
        if v {
            sets.push(format!("completed_at=?{}", idx));
            params.push(Box::new(chrono::Utc::now().to_rfc3339()));
            idx += 1;
        }
    }

    if sets.is_empty() {
        return json!({"success": true, "message": "Nothing to update"});
    }

    let now = chrono::Utc::now().to_rfc3339();
    sets.push(format!("updated_at=?{}", idx));
    params.push(Box::new(now));
    idx += 1;

    let sql = if is_owner {
        let s = format!(
            "UPDATE todos SET {} WHERE id=?{} AND user_id=?{}",
            sets.join(", "),
            idx,
            idx + 1
        );
        params.push(Box::new(id.to_string()));
        params.push(Box::new(user_id.to_string()));
        s
    } else {
        let s = format!("UPDATE todos SET {} WHERE id=?{} AND id IN (SELECT todo_id FROM todo_collaborators WHERE user_id=?{} AND status='active')", sets.join(", "), idx, idx + 1);
        params.push(Box::new(id.to_string()));
        params.push(Box::new(user_id.to_string()));
        s
    };

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    match db.execute(&sql, param_refs.as_slice()) {
        Ok(_) => json!({"success": true, "id": id}),
        Err(e) => json!({"error": format!("Update failed: {}", e)}),
    }
}

fn tool_delete_todo(db: &Connection, user_id: &str, input: &Value) -> Value {
    ensure_collab_tables(db);
    let id = match input["id"].as_str() {
        Some(id) => id,
        None => return json!({"error": "id is required"}),
    };

    let is_owner: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM todos WHERE id=?1 AND user_id=?2",
            rusqlite::params![id, user_id],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if is_owner {
        let now = chrono::Utc::now().to_rfc3339();
        return match db.execute(
            "UPDATE todos SET deleted=1, deleted_at=?1, updated_at=?2 WHERE id=?3 AND user_id=?4",
            rusqlite::params![now, now, id, user_id],
        ) {
            Ok(0) => json!({"error": "Task not found"}),
            Ok(_) => json!({"success": true, "id": id}),
            Err(e) => json!({"error": format!("Delete failed: {}", e)}),
        };
    }

    let is_collaborator: bool = db
        .query_row("SELECT COUNT(*) > 0 FROM todo_collaborators WHERE todo_id=?1 AND user_id=?2 AND status='active'", rusqlite::params![id, user_id], |r| r.get(0))
        .unwrap_or(false);

    if is_collaborator {
        let conf_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
        let now = chrono::Utc::now().to_rfc3339();
        db.execute(
            "INSERT INTO pending_confirmations (id, item_type, item_id, action, initiated_by, status, created_at) VALUES (?1, 'todo', ?2, 'delete', ?3, 'pending', ?4)",
            rusqlite::params![conf_id, id, user_id, now],
        ).ok();
        return json!({"success": true, "id": id, "pending_confirmation": true, "message": "已提交删除请求，等待任务所有者确认"});
    }

    json!({"error": "Task not found"})
}

fn tool_restore_todo(db: &Connection, user_id: &str, input: &Value) -> Value {
    let id = match input["id"].as_str() {
        Some(id) => id,
        None => return json!({"error": "id is required"}),
    };
    let now = chrono::Utc::now().to_rfc3339();
    match db.execute(
        "UPDATE todos SET deleted=0, deleted_at=NULL, updated_at=?1 WHERE id=?2 AND user_id=?3",
        rusqlite::params![now, id, user_id],
    ) {
        Ok(0) => json!({"error": "Task not found"}),
        Ok(_) => json!({"success": true, "id": id}),
        Err(e) => json!({"error": format!("Restore failed: {}", e)}),
    }
}

fn tool_query_todos(db: &Connection, user_id: &str, input: &Value) -> Value {
    ensure_collab_tables(db);

    let mut conditions = vec!["user_id=?1".to_string(), "deleted=0".to_string()];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(user_id.to_string())];
    let mut idx = 2;

    if let Some(tab) = input["tab"].as_str() {
        conditions.push(format!("tab=?{}", idx));
        params.push(Box::new(tab.to_string()));
        idx += 1;
    }
    if let Some(quadrant) = input["quadrant"].as_str() {
        conditions.push(format!("quadrant=?{}", idx));
        params.push(Box::new(quadrant.to_string()));
        idx += 1;
    }
    if let Some(completed) = input["completed"].as_bool() {
        conditions.push(format!("completed=?{}", idx));
        params.push(Box::new(completed as i32));
        idx += 1;
    }
    if let Some(keyword) = input["keyword"].as_str() {
        conditions.push(format!("text LIKE ?{}", idx));
        params.push(Box::new(format!("%{}%", keyword)));
        idx += 1;
    }
    if let Some(assignee) = input["assignee"].as_str() {
        conditions.push(format!("assignee=?{}", idx));
        params.push(Box::new(assignee.to_string()));
        idx += 1;
    }
    if let Some(tag) = input["tag"].as_str() {
        conditions.push(format!("tags LIKE ?{}", idx));
        params.push(Box::new(format!("%\"{}\"", tag)));
        let _ = idx;
    }

    let sql = format!(
        "SELECT id, text, tab, quadrant, progress, completed, due_date, assignee, tags FROM todos WHERE {} ORDER BY sort_order ASC LIMIT 30",
        conditions.join(" AND ")
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = match db.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return json!({"error": format!("Query failed: {}", e)}),
    };

    let rows = match stmt.query_map(param_refs.as_slice(), |row| {
        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "text": row.get::<_, String>(1)?,
            "tab": row.get::<_, String>(2)?,
            "quadrant": row.get::<_, String>(3)?,
            "progress": row.get::<_, i64>(4)?,
            "completed": row.get::<_, bool>(5)?,
            "due_date": row.get::<_, Option<String>>(6)?,
            "assignee": row.get::<_, String>(7)?,
            "tags": row.get::<_, String>(8)?
        }))
    }) {
        Ok(r) => r,
        Err(e) => return json!({"error": format!("Query failed: {}", e)}),
    };

    let mut items: Vec<Value> = rows.flatten().collect();

    // Collaborative todos
    let mut collab_conditions = vec![
        "tc.user_id = ?1".to_string(),
        "tc.status = 'active'".to_string(),
        "t.deleted = 0".to_string(),
    ];
    let mut collab_params: Vec<Box<dyn rusqlite::types::ToSql>> =
        vec![Box::new(user_id.to_string())];
    let mut cidx = 2;

    if let Some(tab) = input["tab"].as_str() {
        collab_conditions.push(format!("tc.tab=?{}", cidx));
        collab_params.push(Box::new(tab.to_string()));
        cidx += 1;
    }
    if let Some(quadrant) = input["quadrant"].as_str() {
        collab_conditions.push(format!("tc.quadrant=?{}", cidx));
        collab_params.push(Box::new(quadrant.to_string()));
        cidx += 1;
    }
    if let Some(completed) = input["completed"].as_bool() {
        collab_conditions.push(format!("t.completed=?{}", cidx));
        collab_params.push(Box::new(completed as i32));
        cidx += 1;
    }
    if let Some(keyword) = input["keyword"].as_str() {
        collab_conditions.push(format!("t.text LIKE ?{}", cidx));
        collab_params.push(Box::new(format!("%{}%", keyword)));
        let _ = cidx;
    }

    let collab_sql = format!(
        "SELECT t.id, t.text, tc.tab, tc.quadrant, t.progress, t.completed, t.due_date, t.assignee, t.tags
         FROM todos t
         JOIN todo_collaborators tc ON t.id = tc.todo_id
         WHERE {} LIMIT 20",
        collab_conditions.join(" AND ")
    );

    let collab_param_refs: Vec<&dyn rusqlite::types::ToSql> =
        collab_params.iter().map(|p| p.as_ref()).collect();
    if let Ok(mut cstmt) = db.prepare(&collab_sql) {
        if let Ok(crows) = cstmt.query_map(collab_param_refs.as_slice(), |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "text": row.get::<_, String>(1)?,
                "tab": row.get::<_, String>(2)?,
                "quadrant": row.get::<_, String>(3)?,
                "progress": row.get::<_, i64>(4)?,
                "completed": row.get::<_, bool>(5)?,
                "due_date": row.get::<_, Option<String>>(6)?,
                "assignee": row.get::<_, String>(7)?,
                "tags": row.get::<_, String>(8)?,
                "collaborative": true
            }))
        }) {
            for item in crows.flatten() {
                items.push(item);
            }
        }
    }

    json!({"success": true, "count": items.len(), "items": items})
}

fn tool_batch_update_todos(db: &Connection, user_id: &str, input: &Value) -> Value {
    let updates = match input["updates"].as_array() {
        Some(u) => u,
        None => return json!({"error": "updates array is required"}),
    };

    let mut success_count = 0;
    for update in updates {
        let result = tool_update_todo(db, user_id, update);
        if result["success"].as_bool().unwrap_or(false) {
            success_count += 1;
        }
    }

    json!({"success": true, "updated": success_count, "total": updates.len()})
}

fn tool_create_routine(db: &Connection, user_id: &str, input: &Value) -> Value {
    let text = match input["text"].as_str() {
        Some(t) if !t.is_empty() => t,
        _ => return json!({"error": "text is required"}),
    };
    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();

    match db.execute(
        "INSERT INTO routines (id, user_id, text, completed_today, created_at) VALUES (?1, ?2, ?3, 0, ?4)",
        rusqlite::params![id, user_id, text, now],
    ) {
        Ok(_) => json!({"success": true, "id": id, "text": text}),
        Err(e) => json!({"error": format!("Failed to create routine: {}", e)}),
    }
}

fn tool_create_review(db: &Connection, user_id: &str, input: &Value) -> Value {
    let text = match input["text"].as_str() {
        Some(t) if !t.is_empty() => t,
        _ => return json!({"error": "text is required"}),
    };
    let frequency = input["frequency"].as_str().unwrap_or("weekly");
    let freq_config = input
        .get("frequency_config")
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "{}".into()))
        .unwrap_or_else(|| "{}".into());

    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();

    match db.execute(
        "INSERT INTO reviews (id, user_id, text, frequency, frequency_config, notes, category, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, '', '', ?6, ?7)",
        rusqlite::params![id, user_id, text, frequency, freq_config, now, now],
    ) {
        Ok(_) => json!({"success": true, "id": id, "text": text, "frequency": frequency}),
        Err(e) => json!({"error": format!("Failed to create review: {}", e)}),
    }
}

fn tool_get_statistics(db: &Connection, user_id: &str, input: &Value) -> Value {
    let period = input["period"].as_str().unwrap_or("today");

    let tab_filter = match period {
        "today" => Some("tab='today'"),
        "week" => Some("tab='week'"),
        "month" => Some("tab='month'"),
        _ => None,
    };

    let where_clause = match tab_filter {
        Some(f) => format!("user_id=?1 AND deleted=0 AND {}", f),
        None => "user_id=?1 AND deleted=0".to_string(),
    };

    let total: i64 = db
        .query_row(
            &format!("SELECT COUNT(*) FROM todos WHERE {}", where_clause),
            [user_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let completed: i64 = db
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM todos WHERE {} AND completed=1",
                where_clause
            ),
            [user_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let overdue: i64 = db
        .query_row(
            &format!("SELECT COUNT(*) FROM todos WHERE {} AND completed=0 AND due_date IS NOT NULL AND due_date < date('now')", where_clause),
            [user_id], |r| r.get(0),
        )
        .unwrap_or(0);

    let completion_rate = if total > 0 {
        (completed as f64 / total as f64 * 100.0).round() as i64
    } else {
        0
    };

    json!({
        "period": period,
        "total": total,
        "completed": completed,
        "pending": total - completed,
        "overdue": overdue,
        "completion_rate": format!("{}%", completion_rate)
    })
}

fn tool_get_current_datetime() -> Value {
    let now = chrono::Local::now();
    json!({
        "date": now.format("%Y-%m-%d").to_string(),
        "time": now.format("%H:%M:%S").to_string(),
        "weekday": now.format("%A").to_string(),
        "iso": now.to_rfc3339()
    })
}

fn tool_create_english_scenario(db: &Connection, user_id: &str, input: &Value) -> Value {
    let title = match input["title"].as_str() {
        Some(t) if !t.is_empty() => t,
        _ => return json!({"error": "title is required"}),
    };
    let description = input["description"].as_str().unwrap_or("");
    let category = input["category"].as_str().unwrap_or("英语");
    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();

    match db.execute(
        "INSERT INTO english_scenarios (id, user_id, title, title_en, description, icon, content, status, archived, created_at, updated_at, category, notes) VALUES (?1, ?2, ?3, '', ?4, '📖', '', 'draft', 0, ?5, ?6, ?7, '')",
        rusqlite::params![id, user_id, title, description, now, now, category],
    ) {
        Ok(_) => json!({"success": true, "id": id, "title": title, "category": category, "message": "学习场景已创建，请到学习页面查看并生成内容"}),
        Err(e) => json!({"error": format!("Failed to create scenario: {}", e)}),
    }
}

fn tool_query_english_scenarios(db: &Connection, user_id: &str, input: &Value) -> Value {
    let keyword = input["keyword"].as_str();

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(kw) = keyword {
        (
            "SELECT id, title, title_en, status, icon, COALESCE(category, '英语') FROM english_scenarios WHERE user_id=?1 AND archived=0 AND title LIKE ?2 ORDER BY updated_at DESC LIMIT 20".into(),
            vec![Box::new(user_id.to_string()), Box::new(format!("%{}%", kw))],
        )
    } else {
        (
            "SELECT id, title, title_en, status, icon, COALESCE(category, '英语') FROM english_scenarios WHERE user_id=?1 AND archived=0 ORDER BY updated_at DESC LIMIT 20".into(),
            vec![Box::new(user_id.to_string())],
        )
    };

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = match db.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return json!({"error": format!("Query failed: {}", e)}),
    };

    let rows = match stmt.query_map(param_refs.as_slice(), |row| {
        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "title": row.get::<_, String>(1)?,
            "title_en": row.get::<_, String>(2).unwrap_or_default(),
            "status": row.get::<_, String>(3)?,
            "icon": row.get::<_, String>(4).unwrap_or_else(|_| "📖".into()),
            "category": row.get::<_, String>(5).unwrap_or_else(|_| "英语".into())
        }))
    }) {
        Ok(r) => r,
        Err(e) => return json!({"error": format!("Query failed: {}", e)}),
    };

    let items: Vec<Value> = rows.flatten().collect();
    json!({"success": true, "count": items.len(), "items": items})
}

// ─── Reminder helpers ───

/// Compute which tab a reminder should go to based on its remind_at time.
/// Uses Asia/Shanghai (UTC+8) timezone.
/// - Same day → "today"
/// - Same week (Mon-Sun) → "week"
/// - Everything else → "month"
///
/// Compute tab from a YYYY-MM-DD date string
pub fn compute_tab_for_date(date_str: &str) -> &'static str {
    use chrono::{Datelike, NaiveDate};

    let date = match NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return "today",
    };

    let shanghai = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
    let now_local = chrono::Utc::now().with_timezone(&shanghai);
    let today = now_local.date_naive();

    if date == today {
        return "today";
    }

    let today_weekday = today.weekday().num_days_from_monday();
    let week_start = today - chrono::Duration::days(today_weekday as i64);
    let week_end = week_start + chrono::Duration::days(6);

    if date >= week_start && date <= week_end {
        return "week";
    }

    "month"
}

pub fn compute_tab_for_time(remind_at: &str) -> &'static str {
    use chrono::Datelike;

    let parsed = match chrono::DateTime::parse_from_rfc3339(remind_at) {
        Ok(dt) => dt,
        Err(_) => return "today",
    };

    let shanghai = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
    let remind_local = parsed.with_timezone(&shanghai);
    let now_local = chrono::Utc::now().with_timezone(&shanghai);

    // Same day → today
    if remind_local.date_naive() == now_local.date_naive() {
        return "today";
    }

    // Same week (Monday-Sunday) → week
    let today_weekday = now_local.weekday().num_days_from_monday(); // 0=Mon, 6=Sun
    let week_start = now_local.date_naive() - chrono::Duration::days(today_weekday as i64);
    let week_end = week_start + chrono::Duration::days(6); // Sunday

    let remind_date = remind_local.date_naive();
    if remind_date >= week_start && remind_date <= week_end {
        return "week";
    }

    // Everything else → month
    "month"
}

/// Auto-create a todo for a reminder if no related_todo_id exists.
/// Returns (todo_id, tab) on success.
fn auto_create_todo_for_reminder(
    db: &Connection,
    user_id: &str,
    text: &str,
    remind_at: &str,
    reminder_id: &str,
) -> Option<(String, String)> {
    let tab = compute_tab_for_time(remind_at);
    let todo_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Create the todo
    if db.execute(
        "INSERT INTO todos (id, user_id, text, content, tab, quadrant, progress, completed, assignee, tags, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, '', ?4, 'not-important-not-urgent', 0, 0, '', '[]', 0.0, ?5, ?6)",
        rusqlite::params![todo_id, user_id, text, tab, now, now],
    ).is_err() {
        return None;
    }

    // Back-fill the reminder's related_todo_id
    db.execute(
        "UPDATE reminders SET related_todo_id=?1 WHERE id=?2 AND user_id=?3",
        rusqlite::params![todo_id, reminder_id, user_id],
    )
    .ok();

    Some((todo_id.clone(), tab.to_string()))
}

// ─── Reminder tool implementations ───

fn tool_create_reminder(db: &Connection, user_id: &str, input: &Value) -> Value {
    let text = match input["text"].as_str() {
        Some(t) if !t.trim().is_empty() => t.trim(),
        _ => return json!({"error": "text is required"}),
    };
    let remind_at = match input["remind_at"].as_str() {
        Some(t) => t,
        None => return json!({"error": "remind_at is required"}),
    };

    let parsed = match chrono::DateTime::parse_from_rfc3339(remind_at) {
        Ok(dt) => dt,
        Err(_) => {
            return json!({"error": "remind_at must be a valid ISO 8601 timestamp with timezone offset, e.g. 2026-02-21T15:00:00+08:00"})
        }
    };

    if parsed <= chrono::Utc::now() {
        return json!({"error": "remind_at must be in the future"});
    }

    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let related_todo_id = input["related_todo_id"].as_str();
    let repeat = input["repeat"].as_str();
    let now = chrono::Utc::now().to_rfc3339();

    match db.execute(
        "INSERT INTO reminders (id, user_id, text, remind_at, status, related_todo_id, repeat, created_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7)",
        rusqlite::params![id, user_id, text, remind_at, related_todo_id, repeat, now],
    ) {
        Ok(_) => {
            let display_time = parsed
                .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
                .format("%m月%d日 %H:%M")
                .to_string();

            // Auto-create a todo if no related_todo_id
            let (todo_id, tab) = if related_todo_id.is_none() {
                auto_create_todo_for_reminder(db, user_id, text, remind_at, &id)
                    .map(|(tid, t)| (Some(tid), Some(t)))
                    .unwrap_or((None, None))
            } else {
                (None, None)
            };

            let mut result = json!({
                "success": true,
                "id": id,
                "text": text,
                "remind_at": remind_at,
                "display_time": display_time,
                "message": format!("已设定提醒：{} ({})", text, display_time)
            });
            if let Some(tid) = todo_id {
                result["todo_id"] = json!(tid);
            }
            if let Some(t) = tab {
                result["tab"] = json!(t);
            }
            result
        }
        Err(e) => json!({"error": format!("Failed to create reminder: {}", e)}),
    }
}

fn tool_query_reminders(db: &Connection, user_id: &str, input: &Value) -> Value {
    let status = input["status"].as_str().unwrap_or("pending");

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if status == "all" {
        (
            "SELECT id, text, remind_at, status FROM reminders WHERE user_id=?1 AND status != 'cancelled' ORDER BY remind_at ASC LIMIT 20".into(),
            vec![Box::new(user_id.to_string())],
        )
    } else {
        (
            "SELECT id, text, remind_at, status FROM reminders WHERE user_id=?1 AND status=?2 ORDER BY remind_at ASC LIMIT 20".into(),
            vec![Box::new(user_id.to_string()), Box::new(status.to_string())],
        )
    };

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = match db.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return json!({"error": format!("Query failed: {}", e)}),
    };

    let rows = match stmt.query_map(param_refs.as_slice(), |row| {
        let remind_at_str: String = row.get(2)?;
        let display_time = chrono::DateTime::parse_from_rfc3339(&remind_at_str)
            .map(|dt| {
                dt.with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
                    .format("%m月%d日 %H:%M")
                    .to_string()
            })
            .unwrap_or_else(|_| remind_at_str.clone());

        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "text": row.get::<_, String>(1)?,
            "remind_at": remind_at_str,
            "display_time": display_time,
            "status": row.get::<_, String>(3)?
        }))
    }) {
        Ok(r) => r,
        Err(e) => return json!({"error": format!("Query failed: {}", e)}),
    };

    let items: Vec<Value> = rows.flatten().collect();
    json!({"success": true, "count": items.len(), "items": items})
}

fn tool_cancel_reminder(db: &Connection, user_id: &str, input: &Value) -> Value {
    let id = match input["id"].as_str() {
        Some(id) => id,
        None => return json!({"error": "id is required"}),
    };
    let now = chrono::Utc::now().to_rfc3339();

    match db.execute(
        "UPDATE reminders SET status='cancelled', acknowledged_at=?1 WHERE id=?2 AND user_id=?3 AND status IN ('pending', 'triggered')",
        rusqlite::params![now, id, user_id],
    ) {
        Ok(0) => json!({"error": "Reminder not found"}),
        Ok(_) => json!({"success": true, "id": id, "message": "提醒已取消"}),
        Err(e) => json!({"error": format!("Cancel failed: {}", e)}),
    }
}

fn tool_snooze_reminder(db: &Connection, user_id: &str, input: &Value) -> Value {
    let id = match input["id"].as_str() {
        Some(id) => id,
        None => return json!({"error": "id is required"}),
    };
    let minutes = input["minutes"].as_i64().unwrap_or(5).clamp(1, 120);

    let text: String = match db.query_row(
        "SELECT text FROM reminders WHERE id=?1 AND user_id=?2 AND status='triggered'",
        rusqlite::params![id, user_id],
        |r| r.get(0),
    ) {
        Ok(t) => t,
        Err(_) => return json!({"error": "Reminder not found or not triggered"}),
    };

    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();

    db.execute(
        "UPDATE reminders SET status='acknowledged', acknowledged_at=?1 WHERE id=?2",
        rusqlite::params![now_str, id],
    )
    .ok();

    db.execute(
        "UPDATE notifications SET read=1 WHERE reminder_id=?1 AND user_id=?2",
        rusqlite::params![id, user_id],
    )
    .ok();

    let new_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let snooze_time = now + chrono::Duration::minutes(minutes);
    let snooze_at = snooze_time
        .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
        .to_rfc3339();

    match db.execute(
        "INSERT INTO reminders (id, user_id, text, remind_at, status, created_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)",
        rusqlite::params![new_id, user_id, text, snooze_at, now_str],
    ) {
        Ok(_) => {
            let display_time = snooze_time
                .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
                .format("%H:%M")
                .to_string();
            json!({
                "success": true,
                "id": new_id,
                "text": text,
                "remind_at": snooze_at,
                "message": format!("已推迟{}分钟，将在 {} 再次提醒", minutes, display_time)
            })
        }
        Err(e) => json!({"error": format!("Snooze failed: {}", e)}),
    }
}
