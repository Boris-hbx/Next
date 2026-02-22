use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

// ─── Types ───

#[derive(Debug, Clone)]
pub struct UserId(pub String);

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAvatarRequest {
    pub avatar: String,
}

// ─── Session middleware: extract UserId from cookie ───

impl FromRequestParts<AppState> for UserId {
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        // Extract cookie jar
        let jar = CookieJar::from_request_parts(parts, state)
            .await
            .map_err(|_| unauthorized())?;

        let token = jar
            .get("session")
            .map(|c| c.value().to_string())
            .ok_or_else(unauthorized)?;

        // Validate session
        let db = state.db.lock().map_err(|_| server_error())?;
        let result = db.query_row(
            "SELECT user_id FROM sessions WHERE token = ?1 AND expires_at > datetime('now')",
            [&token],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        );

        match result {
            Ok(user_id) => Ok(UserId(user_id)),
            Err(_) => Err(unauthorized()),
        }
    }
}

fn unauthorized() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({
            "success": false,
            "error": "UNAUTHORIZED",
            "message": "请先登录"
        })),
    )
}

fn server_error() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({
            "success": false,
            "error": "SERVER_ERROR",
            "message": "服务器内部错误"
        })),
    )
}

// ─── Handlers ───

pub async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(req): Json<RegisterRequest>,
) -> impl IntoResponse {
    // Validate username
    if req.username.len() < 3 || req.username.len() > 20 {
        return (
            jar,
            (
                StatusCode::BAD_REQUEST,
                Json(AuthResponse {
                    success: false,
                    user: None,
                    message: Some("用户名需要 3-20 个字符".into()),
                }),
            ),
        );
    }
    if !req.username.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return (
            jar,
            (
                StatusCode::BAD_REQUEST,
                Json(AuthResponse {
                    success: false,
                    user: None,
                    message: Some("用户名只能包含字母、数字和下划线".into()),
                }),
            ),
        );
    }

    // Validate password
    if req.password.len() < 8 {
        return (
            jar,
            (
                StatusCode::BAD_REQUEST,
                Json(AuthResponse {
                    success: false,
                    user: None,
                    message: Some("密码至少需要 8 个字符".into()),
                }),
            ),
        );
    }

    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                jar,
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(AuthResponse {
                        success: false,
                        user: None,
                        message: Some("服务器错误".into()),
                    }),
                ),
            )
        }
    };

    // Check username uniqueness
    let exists: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM users WHERE username = ?1",
            [&req.username],
            |row: &rusqlite::Row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        return (
            jar,
            (
                StatusCode::CONFLICT,
                Json(AuthResponse {
                    success: false,
                    user: None,
                    message: Some("用户名已被使用".into()),
                }),
            ),
        );
    }

    // Hash password
    let password_hash = match hash_password(&req.password) {
        Ok(h) => h,
        Err(_) => {
            return (
                jar,
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(AuthResponse {
                        success: false,
                        user: None,
                        message: Some("密码加密失败".into()),
                    }),
                ),
            )
        }
    };

    let user_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let display_name = req.display_name.unwrap_or_else(|| req.username.clone());

    db.execute(
        "INSERT INTO users (id, username, password_hash, display_name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![user_id, req.username, password_hash, display_name, now, now],
    )
    .unwrap();

    // Auto-login: create session
    let token = generate_session_token();
    let expires = (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339();
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![token, user_id, now, expires],
    )
    .unwrap();

    let jar = jar.add(make_session_cookie(token));

    (
        jar,
        (
            StatusCode::OK,
            Json(AuthResponse {
                success: true,
                user: Some(UserInfo {
                    id: user_id,
                    username: req.username,
                    display_name: Some(display_name),
                    avatar: None,
                }),
                message: Some("注册成功".into()),
            }),
        ),
    )
}

pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                jar,
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(AuthResponse {
                        success: false,
                        user: None,
                        message: Some("服务器错误".into()),
                    }),
                ),
            )
        }
    };

    // Find user
    let user_row = db.query_row(
        "SELECT id, username, password_hash, display_name, COALESCE(avatar,'') FROM users WHERE username = ?1",
        [&req.username],
        |row: &rusqlite::Row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
            ))
        },
    );

    let (user_id, username, password_hash, display_name, avatar) = match user_row {
        Ok(r) => r,
        Err(_) => {
            return (
                jar,
                (
                    StatusCode::UNAUTHORIZED,
                    Json(AuthResponse {
                        success: false,
                        user: None,
                        message: Some("用户名或密码错误".into()),
                    }),
                ),
            )
        }
    };

    // Verify password
    if !verify_password(&req.password, &password_hash) {
        return (
            jar,
            (
                StatusCode::UNAUTHORIZED,
                Json(AuthResponse {
                    success: false,
                    user: None,
                    message: Some("用户名或密码错误".into()),
                }),
            ),
        );
    }

    // Create session
    let token = generate_session_token();
    let now = chrono::Utc::now().to_rfc3339();
    let expires = (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339();
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![token, user_id, now, expires],
    )
    .unwrap();

    // Limit to 5 sessions per user
    db.execute(
        "DELETE FROM sessions WHERE user_id = ?1 AND token NOT IN (SELECT token FROM sessions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 5)",
        [&user_id],
    )
    .ok();

    let jar = jar.add(make_session_cookie(token));

    (
        jar,
        (
            StatusCode::OK,
            Json(AuthResponse {
                success: true,
                user: Some(UserInfo {
                    id: user_id,
                    username,
                    display_name,
                    avatar: if avatar.is_empty() { None } else { Some(avatar) },
                }),
                message: Some("登录成功".into()),
            }),
        ),
    )
}

pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    if let Some(cookie) = jar.get("session") {
        let token = cookie.value().to_string();
        if let Ok(db) = state.db.lock() {
            db.execute("DELETE FROM sessions WHERE token = ?1", [&token]).ok();
        }
    }

    let jar = jar.remove(Cookie::from("session"));

    (jar, Json(serde_json::json!({ "success": true })))
}

pub async fn me(
    State(state): State<AppState>,
    user_id: UserId,
) -> impl IntoResponse {
    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    user: None,
                    message: Some("服务器错误".into()),
                }),
            )
        }
    };

    let result = db.query_row(
        "SELECT id, username, display_name, COALESCE(avatar,'') FROM users WHERE id = ?1",
        [&user_id.0],
        |row: &rusqlite::Row| {
            let av: String = row.get(3)?;
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                display_name: row.get(2)?,
                avatar: if av.is_empty() { None } else { Some(av) },
            })
        },
    );

    match result {
        Ok(user) => (
            StatusCode::OK,
            Json(AuthResponse {
                success: true,
                user: Some(user),
                message: None,
            }),
        ),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(AuthResponse {
                success: false,
                user: None,
                message: Some("用户不存在".into()),
            }),
        ),
    }
}

pub async fn change_password(
    State(state): State<AppState>,
    user_id: UserId,
    Json(req): Json<ChangePasswordRequest>,
) -> impl IntoResponse {
    // Validate new password length
    if req.new_password.len() < 8 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": "新密码至少需要 8 个字符"
            })),
        );
    }

    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": "服务器错误"
                })),
            );
        }
    };

    // Get current password hash
    let current_hash = match db.query_row(
        "SELECT password_hash FROM users WHERE id = ?1",
        [&user_id.0],
        |row: &rusqlite::Row| row.get::<_, String>(0),
    ) {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "success": false,
                    "message": "用户不存在"
                })),
            );
        }
    };

    // Verify old password
    if !verify_password(&req.old_password, &current_hash) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": "当前密码不正确"
            })),
        );
    }

    // Hash new password
    let new_hash = match hash_password(&req.new_password) {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": "密码加密失败"
                })),
            );
        }
    };

    // Update password
    let now = chrono::Utc::now().to_rfc3339();
    match db.execute(
        "UPDATE users SET password_hash = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![new_hash, now, user_id.0],
    ) {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "密码修改成功"
            })),
        ),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "密码更新失败"
            })),
        ),
    }
}

pub async fn update_avatar(
    State(state): State<AppState>,
    user_id: UserId,
    Json(req): Json<UpdateAvatarRequest>,
) -> impl IntoResponse {
    // Limit avatar data size (256KB max for base64 images)
    if req.avatar.len() > 256 * 1024 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": "头像数据太大"
            })),
        );
    }

    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": "服务器错误"
                })),
            );
        }
    };

    let now = chrono::Utc::now().to_rfc3339();
    match db.execute(
        "UPDATE users SET avatar = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![req.avatar, now, user_id.0],
    ) {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true
            })),
        ),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "保存头像失败"
            })),
        ),
    }
}

// ─── Helpers ───

fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    use argon2::{Argon2, PasswordHasher};
    use argon2::password_hash::SaltString;
    use rand::RngCore;

    // Generate salt bytes using rand, then encode as SaltString
    let mut salt_bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut salt_bytes);
    let salt = SaltString::encode_b64(&salt_bytes)?;

    let argon2 = Argon2::default();
    let hash = argon2.hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

fn verify_password(password: &str, hash: &str) -> bool {
    use argon2::{Argon2, PasswordVerifier};
    use argon2::password_hash::PasswordHash;

    let parsed = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

fn generate_session_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn make_session_cookie(token: String) -> Cookie<'static> {
    Cookie::build(("session", token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::days(30))
        .build()
}
