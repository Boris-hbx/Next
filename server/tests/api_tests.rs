use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

use next_server::build_app;
use next_server::test_helpers::{auth_cookie, create_test_user, test_state};

/// Helper: send a request and return (status, body as serde_json::Value).
async fn send(app: axum::Router, req: Request<Body>) -> (StatusCode, serde_json::Value) {
    let resp = app.oneshot(req).await.expect("request failed");
    let status = resp.status();
    let bytes = resp
        .into_body()
        .collect()
        .await
        .expect("body collect")
        .to_bytes();
    let body: serde_json::Value = serde_json::from_slice(&bytes)
        .unwrap_or(serde_json::json!({"raw": String::from_utf8_lossy(&bytes).to_string()}));
    (status, body)
}

// ──────────────────── Health ────────────────────

#[tokio::test]
async fn test_health() {
    let app = build_app(test_state());
    let req = Request::get("/health").body(Body::empty()).unwrap();
    let (status, body) = send(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");
}

// ──────────────────── Auth: Register ────────────────────

#[tokio::test]
async fn test_register_success() {
    let app = build_app(test_state());
    let req = Request::post("/api/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({
                "username": "alice",
                "password": "Alice123x"
            }))
            .unwrap(),
        ))
        .unwrap();
    let (status, body) = send(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);
    assert!(body["user"]["id"].is_string());
}

#[tokio::test]
async fn test_register_duplicate() {
    let state = test_state();
    create_test_user(&state, "bob", "Bobpass1");

    let app = build_app(state);
    let req = Request::post("/api/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({
                "username": "bob",
                "password": "Bobpass1"
            }))
            .unwrap(),
        ))
        .unwrap();
    let (status, _) = send(app, req).await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn test_register_weak_password() {
    let app = build_app(test_state());
    let req = Request::post("/api/auth/register")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({
                "username": "charlie",
                "password": "short"
            }))
            .unwrap(),
        ))
        .unwrap();
    let (status, _) = send(app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ──────────────────── Auth: Login ────────────────────

#[tokio::test]
async fn test_login_success() {
    let state = test_state();
    create_test_user(&state, "dave", "Davepass1");

    let app = build_app(state);
    let req = Request::post("/api/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({
                "username": "dave",
                "password": "Davepass1"
            }))
            .unwrap(),
        ))
        .unwrap();
    let (status, body) = send(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);
    assert!(body["user"]["username"].is_string());
}

#[tokio::test]
async fn test_login_wrong_password() {
    let state = test_state();
    create_test_user(&state, "eve", "Evepass12");

    let app = build_app(state);
    let req = Request::post("/api/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({
                "username": "eve",
                "password": "Wrong123x"
            }))
            .unwrap(),
        ))
        .unwrap();
    let (status, _) = send(app, req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ──────────────────── Auth: Unauthenticated ────────────────────

#[tokio::test]
async fn test_unauthenticated_401() {
    let app = build_app(test_state());
    let req = Request::get("/api/todos").body(Body::empty()).unwrap();
    let (status, _) = send(app, req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ──────────────────── Todos ────────────────────

#[tokio::test]
async fn test_create_todo() {
    let state = test_state();
    let (_, token) = create_test_user(&state, "frank", "Frank123");

    let app = build_app(state);
    let req = Request::post("/api/todos")
        .header("content-type", "application/json")
        .header("cookie", auth_cookie(&token))
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({
                "text": "Buy milk"
            }))
            .unwrap(),
        ))
        .unwrap();
    let (status, body) = send(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);
    assert_eq!(body["item"]["text"], "Buy milk");
}

#[tokio::test]
async fn test_create_todo_too_long() {
    let state = test_state();
    let (_, token) = create_test_user(&state, "grace", "Grace123");

    let app = build_app(state);
    let long_text = "x".repeat(501);
    let req = Request::post("/api/todos")
        .header("content-type", "application/json")
        .header("cookie", auth_cookie(&token))
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({
                "text": long_text
            }))
            .unwrap(),
        ))
        .unwrap();
    let (status, _) = send(app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_list_todos() {
    let state = test_state();
    let (_, token) = create_test_user(&state, "heidi", "Heidi123");

    // Create a todo first
    let app = build_app(state.clone());
    let req = Request::post("/api/todos")
        .header("content-type", "application/json")
        .header("cookie", auth_cookie(&token))
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({
                "text": "Test item"
            }))
            .unwrap(),
        ))
        .unwrap();
    let _ = send(app, req).await;

    // List
    let app = build_app(state);
    let req = Request::get("/api/todos")
        .header("cookie", auth_cookie(&token))
        .body(Body::empty())
        .unwrap();
    let (status, body) = send(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["items"].as_array().unwrap().len() >= 1);
}

#[tokio::test]
async fn test_update_todo() {
    let state = test_state();
    let (_, token) = create_test_user(&state, "ivan", "Ivan1234");

    // Create
    let app = build_app(state.clone());
    let req = Request::post("/api/todos")
        .header("content-type", "application/json")
        .header("cookie", auth_cookie(&token))
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({ "text": "Original" })).unwrap(),
        ))
        .unwrap();
    let (_, body) = send(app, req).await;
    let todo_id = body["item"]["id"].as_str().unwrap().to_string();

    // Update
    let app = build_app(state);
    let req = Request::put(&format!("/api/todos/{}", todo_id))
        .header("content-type", "application/json")
        .header("cookie", auth_cookie(&token))
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({ "text": "Updated" })).unwrap(),
        ))
        .unwrap();
    let (status, body) = send(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["item"]["text"], "Updated");
}

#[tokio::test]
async fn test_delete_todo() {
    let state = test_state();
    let (_, token) = create_test_user(&state, "judy", "Judy1234");

    // Create
    let app = build_app(state.clone());
    let req = Request::post("/api/todos")
        .header("content-type", "application/json")
        .header("cookie", auth_cookie(&token))
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({ "text": "Delete me" })).unwrap(),
        ))
        .unwrap();
    let (_, body) = send(app, req).await;
    let todo_id = body["item"]["id"].as_str().unwrap().to_string();

    // Delete (soft)
    let app = build_app(state.clone());
    let req = Request::delete(&format!("/api/todos/{}", todo_id))
        .header("cookie", auth_cookie(&token))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, req).await;
    assert_eq!(status, StatusCode::OK);

    // List should not contain it
    let app = build_app(state);
    let req = Request::get("/api/todos")
        .header("cookie", auth_cookie(&token))
        .body(Body::empty())
        .unwrap();
    let (_, body) = send(app, req).await;
    let ids: Vec<&str> = body["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v["id"].as_str())
        .collect();
    assert!(!ids.contains(&todo_id.as_str()));
}

#[tokio::test]
async fn test_user_isolation() {
    let state = test_state();
    let (_, token_a) = create_test_user(&state, "alice_iso", "Alice123");
    let (_, token_b) = create_test_user(&state, "bob_iso", "Bobbb123");

    // Alice creates a todo
    let app = build_app(state.clone());
    let req = Request::post("/api/todos")
        .header("content-type", "application/json")
        .header("cookie", auth_cookie(&token_a))
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({ "text": "Alice secret" })).unwrap(),
        ))
        .unwrap();
    let _ = send(app, req).await;

    // Bob lists — should see nothing
    let app = build_app(state);
    let req = Request::get("/api/todos")
        .header("cookie", auth_cookie(&token_b))
        .body(Body::empty())
        .unwrap();
    let (status, body) = send(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["items"].as_array().unwrap().len(), 0);
}

// ──────────────────── Edge cases ────────────────────

#[tokio::test]
async fn test_empty_text() {
    let state = test_state();
    let (_, token) = create_test_user(&state, "kate", "Kate1234");

    let app = build_app(state);
    // Empty text — the server should accept it (no explicit empty check in create_todo
    // unless we add one). This test documents current behavior.
    let req = Request::post("/api/todos")
        .header("content-type", "application/json")
        .header("cookie", auth_cookie(&token))
        .body(Body::from(
            serde_json::to_string(&serde_json::json!({ "text": "" })).unwrap(),
        ))
        .unwrap();
    let (status, _) = send(app, req).await;
    // Currently the server accepts empty text (200). If we add validation later,
    // this test will catch the change.
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn test_batch_limit() {
    let state = test_state();
    let (_, token) = create_test_user(&state, "leo", "Leoo1234");

    let app = build_app(state);
    // 201 items exceeds the 200 batch limit
    let items: Vec<serde_json::Value> = (0..201)
        .map(|i| serde_json::json!({ "id": format!("fake-{}", i) }))
        .collect();
    let req = Request::put("/api/todos/batch")
        .header("content-type", "application/json")
        .header("cookie", auth_cookie(&token))
        .body(Body::from(serde_json::to_string(&items).unwrap()))
        .unwrap();
    let (status, _) = send(app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
