use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    /// Cache for moment text: user_id -> (text, timestamp)
    pub moment_cache: Arc<Mutex<HashMap<String, (String, chrono::DateTime<chrono::Utc>)>>>,
}
