use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Datelike;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};

use crate::services::push::{self, PushSubscription, VapidKeys};

/// Data collected from DB under lock, used for async push after unlock
struct TriggeredReminder {
    id: String,
    user_id: String,
    text: String,
}

struct UserPushSub {
    endpoint: String,
    p256dh: String,
    auth: String,
}

/// Spawn the reminder poller background task.
/// Checks every 30 seconds for due reminders, triggers them, and sends Web Push.
pub fn spawn_poller(db: Arc<Mutex<Connection>>) {
    tokio::spawn(async move {
        println!("[reminder_poller] started");
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            match poll_once(&db) {
                Ok(triggered) => {
                    if !triggered.is_empty() {
                        send_push_for_reminders(&db, triggered).await;
                    }
                }
                Err(e) => {
                    eprintln!("[reminder_poller] error: {}", e);
                }
            }
        }
    });
}

/// Single poll iteration: find due reminders, trigger them, create notifications.
/// Returns triggered reminders for push notification (DB lock released before push).
fn poll_once(db: &Arc<Mutex<Connection>>) -> Result<Vec<TriggeredReminder>, String> {
    let db = db.lock().map_err(|e| format!("lock error: {}", e))?;
    let now_utc = chrono::Utc::now();
    let now_str = now_utc.to_rfc3339();

    // Find all pending reminders whose remind_at <= now
    let mut stmt = db
        .prepare(
            "SELECT id, user_id, text, remind_at, related_todo_id, repeat \
             FROM reminders WHERE status = 'pending'",
        )
        .map_err(|e| format!("prepare error: {}", e))?;

    let due_reminders: Vec<(String, String, String, String, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|e| format!("query error: {}", e))?
        .filter_map(|r| r.ok())
        .filter(|(_, _, _, remind_at, _, _)| {
            chrono::DateTime::parse_from_rfc3339(remind_at)
                .map(|dt| dt <= now_utc)
                .unwrap_or(false)
        })
        .collect();

    if due_reminders.is_empty() {
        return Ok(Vec::new());
    }

    let count = due_reminders.len();
    let mut triggered = Vec::new();

    for (id, user_id, text, remind_at, related_todo_id, repeat) in &due_reminders {
        // Update reminder status to triggered
        db.execute(
            "UPDATE reminders SET status = 'triggered', triggered_at = ?1 \
             WHERE id = ?2 AND status = 'pending'",
            rusqlite::params![now_str, id],
        )
        .ok();

        // Compute delay label
        let body = if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(remind_at) {
            let delay_secs = (now_utc - dt.with_timezone(&chrono::Utc)).num_seconds();
            if delay_secs > 120 {
                let mins = delay_secs / 60;
                format!("你让我提醒你的（迟了{}分钟）", mins)
            } else {
                "你让我提醒你的".to_string()
            }
        } else {
            "你让我提醒你的".to_string()
        };

        // Create in-app notification
        let notif_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
        db.execute(
            "INSERT INTO notifications (id, user_id, type, title, body, reminder_id, todo_id, read, created_at) \
             VALUES (?1, ?2, 'reminder', ?3, ?4, ?5, ?6, 0, ?7)",
            rusqlite::params![
                notif_id,
                user_id,
                text,
                body,
                id,
                related_todo_id,
                now_str
            ],
        )
        .ok();

        // If repeating, create next occurrence
        if let Some(repeat_str) = repeat {
            if let Some(next_at) = compute_next_remind_at(remind_at, repeat_str) {
                let new_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
                db.execute(
                    "INSERT INTO reminders (id, user_id, text, remind_at, status, related_todo_id, repeat, created_at) \
                     VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7)",
                    rusqlite::params![new_id, user_id, text, next_at, related_todo_id, repeat_str, now_str],
                ).ok();
                println!("[reminder_poller] created next {} reminder at {}", repeat_str, next_at);
            }
        }

        triggered.push(TriggeredReminder {
            id: id.clone(),
            user_id: user_id.clone(),
            text: text.clone(),
        });
    }

    // Cleanup: delete acknowledged reminders older than 30 days
    let cutoff = (now_utc - chrono::Duration::days(30)).to_rfc3339();
    let cleaned = db.execute(
        "DELETE FROM reminders WHERE status = 'acknowledged' AND acknowledged_at < ?1",
        rusqlite::params![cutoff],
    ).unwrap_or(0);
    if cleaned > 0 {
        println!("[reminder_poller] cleaned {} old acknowledged reminder(s)", cleaned);
    }

    println!("[reminder_poller] triggered {} reminder(s)", count);
    Ok(triggered)
}

/// Compute next remind_at for a repeating reminder
fn compute_next_remind_at(current_remind_at: &str, repeat: &str) -> Option<String> {
    let dt = chrono::DateTime::parse_from_rfc3339(current_remind_at).ok()?;
    let next = match repeat {
        "daily" => dt + chrono::Duration::days(1),
        "weekly" => dt + chrono::Duration::weeks(1),
        "monthly" => {
            // Add ~30 days; use chrono's NaiveDate for proper month arithmetic
            let naive = dt.naive_local();
            let date = naive.date();
            let time = naive.time();
            let (y, m) = if date.month() == 12 {
                (date.year() + 1, 1u32)
            } else {
                (date.year(), date.month() + 1)
            };
            let day = date.day().min(days_in_month(y, m));
            let next_date = chrono::NaiveDate::from_ymd_opt(y, m, day)?;
            let next_naive = next_date.and_time(time);
            let next_dt = next_naive.and_local_timezone(dt.timezone()).single()?;
            return Some(next_dt.to_rfc3339());
        }
        _ => return None,
    };
    Some(next.to_rfc3339())
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

/// Send Web Push notifications for triggered reminders (async, no DB lock held)
async fn send_push_for_reminders(db: &Arc<Mutex<Connection>>, reminders: Vec<TriggeredReminder>) {
    let vapid = match VapidKeys::from_env() {
        Some(k) => k,
        None => {
            // VAPID keys not configured, skip push
            return;
        }
    };

    // Collect unique user_ids
    let mut user_ids: Vec<String> = reminders.iter().map(|r| r.user_id.clone()).collect();
    user_ids.sort();
    user_ids.dedup();

    // Fetch push subscriptions under lock
    let subs: Vec<(String, Vec<UserPushSub>)> = {
        let db = match db.lock() {
            Ok(d) => d,
            Err(_) => return,
        };

        user_ids
            .iter()
            .map(|uid| {
                let mut stmt = db
                    .prepare(
                        "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?1",
                    )
                    .unwrap();
                let user_subs: Vec<UserPushSub> = match stmt.query_map([uid], |row| {
                    Ok(UserPushSub {
                        endpoint: row.get(0)?,
                        p256dh: row.get(1)?,
                        auth: row.get(2)?,
                    })
                }) {
                    Ok(rows) => rows.flatten().collect(),
                    Err(_) => Vec::new(),
                };
                (uid.clone(), user_subs)
            })
            .collect()
    };
    // DB lock released here

    // Send pushes
    for reminder in &reminders {
        let user_subs = subs
            .iter()
            .find(|(uid, _)| uid == &reminder.user_id)
            .map(|(_, s)| s);

        if let Some(subscriptions) = user_subs {
            for sub_info in subscriptions {
                let p256dh = match URL_SAFE_NO_PAD.decode(&sub_info.p256dh) {
                    Ok(b) => b,
                    Err(_) => continue,
                };
                let auth = match URL_SAFE_NO_PAD.decode(&sub_info.auth) {
                    Ok(b) => b,
                    Err(_) => continue,
                };

                let push_sub = PushSubscription {
                    endpoint: sub_info.endpoint.clone(),
                    p256dh,
                    auth,
                };

                let payload = serde_json::json!({
                    "title": reminder.text,
                    "body": "你让我提醒你的",
                    "type": "reminder",
                    "reminder_id": reminder.id
                });

                match push::send_push(&vapid, &push_sub, &payload.to_string()).await {
                    Ok(()) => {
                        println!("[push] sent to {}", &sub_info.endpoint[..40.min(sub_info.endpoint.len())]);
                    }
                    Err(push::PushError::Gone) => {
                        // Remove expired subscription
                        if let Ok(db) = db.lock() {
                            db.execute(
                                "DELETE FROM push_subscriptions WHERE endpoint = ?1",
                                [&sub_info.endpoint],
                            )
                            .ok();
                            println!("[push] removed expired subscription");
                        }
                    }
                    Err(e) => {
                        eprintln!("[push] error: {}", e);
                    }
                }
            }
        }
    }
}
