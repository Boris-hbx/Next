//! Tauri Commands
//!
//! 前端可调用的 Rust 命令，替代 Flask API

pub mod todos;
pub mod routines;
pub mod quotes;

pub use todos::*;
pub use routines::*;
pub use quotes::*;
