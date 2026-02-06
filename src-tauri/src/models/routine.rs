//! Routine 日常任务数据结构

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 日常任务项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Routine {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub completed_today: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_completed_date: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

impl Routine {
    /// 创建新的日常任务
    pub fn new(text: String) -> Self {
        Self {
            id: Self::generate_id(),
            text,
            completed_today: false,
            last_completed_date: None,
            created_at: Utc::now().to_rfc3339(),
        }
    }

    /// 生成 8 位唯一 ID
    fn generate_id() -> String {
        Uuid::new_v4().to_string()[..8].to_string()
    }

    /// 切换今日完成状态
    pub fn toggle(&mut self) {
        self.completed_today = !self.completed_today;
        if self.completed_today {
            self.last_completed_date = Some(Utc::now().format("%Y-%m-%d").to_string());
        }
    }

    /// 检查并重置每日状态
    /// 如果 last_completed_date 不是今天，则重置 completed_today
    pub fn check_daily_reset(&mut self) {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        if let Some(ref last_date) = self.last_completed_date {
            if last_date != &today {
                self.completed_today = false;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_routine_creation() {
        let routine = Routine::new("每日锻炼".to_string());

        assert_eq!(routine.text, "每日锻炼");
        assert!(!routine.completed_today);
        assert!(routine.last_completed_date.is_none());
        assert_eq!(routine.id.len(), 8);
    }

    #[test]
    fn test_routine_toggle() {
        let mut routine = Routine::new("每日阅读".to_string());

        routine.toggle();
        assert!(routine.completed_today);
        assert!(routine.last_completed_date.is_some());

        routine.toggle();
        assert!(!routine.completed_today);
    }
}
