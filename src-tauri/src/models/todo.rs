//! Todo 数据结构
//!
//! 与前端 JSON 格式完全兼容

use chrono::Utc;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::VecDeque;
use uuid::Uuid;

/// 自定义反序列化器：处理 null、数字、字符串 -> String
fn deserialize_to_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::Error;
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Number(n) => Ok(n.to_string()),
        serde_json::Value::Null => Ok(String::new()),
        serde_json::Value::Bool(b) => Ok(b.to_string()),
        _ => Err(D::Error::custom("expected string, number, bool or null")),
    }
}

/// 时间维度标签
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Tab {
    Today,
    Week,
    Month,
}

impl Default for Tab {
    fn default() -> Self {
        Tab::Today
    }
}

impl Tab {
    pub fn as_str(&self) -> &'static str {
        match self {
            Tab::Today => "today",
            Tab::Week => "week",
            Tab::Month => "month",
        }
    }
}

/// 四象限类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Quadrant {
    #[serde(rename = "important-urgent")]
    ImportantUrgent,
    #[serde(rename = "important-not-urgent")]
    ImportantNotUrgent,
    #[serde(rename = "not-important-urgent")]
    NotImportantUrgent,
    #[serde(rename = "not-important-not-urgent")]
    NotImportantNotUrgent,
}

impl Default for Quadrant {
    fn default() -> Self {
        Quadrant::NotImportantNotUrgent
    }
}

impl Quadrant {
    pub fn as_str(&self) -> &'static str {
        match self {
            Quadrant::ImportantUrgent => "important-urgent",
            Quadrant::ImportantNotUrgent => "important-not-urgent",
            Quadrant::NotImportantUrgent => "not-important-urgent",
            Quadrant::NotImportantNotUrgent => "not-important-not-urgent",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Quadrant::ImportantUrgent => "优先处理",
            Quadrant::ImportantNotUrgent => "就等你翻牌子了",
            Quadrant::NotImportantUrgent => "待分类",
            Quadrant::NotImportantNotUrgent => "短平快",
        }
    }
}

/// 变更日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeEntry {
    #[serde(default)]
    pub field: String,
    #[serde(default)]
    pub label: String,
    #[serde(default, alias = "from", deserialize_with = "deserialize_to_string")]
    pub old_value: String,
    #[serde(default, alias = "to", deserialize_with = "deserialize_to_string")]
    pub new_value: String,
    #[serde(default, alias = "time")]
    pub timestamp: String,  // 使用 String 以兼容各种日期格式
}

impl ChangeEntry {
    pub fn new(field: &str, label: &str, old_value: &str, new_value: &str) -> Self {
        Self {
            field: field.to_string(),
            label: label.to_string(),
            old_value: old_value.to_string(),
            new_value: new_value.to_string(),
            timestamp: Utc::now().to_rfc3339(),
        }
    }
}

/// 变更日志 (最多保留 50 条)
const MAX_CHANGELOG_SIZE: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(transparent)]
pub struct Changelog(VecDeque<ChangeEntry>);

impl Changelog {
    pub fn new() -> Self {
        Self(VecDeque::new())
    }

    pub fn push(&mut self, entry: ChangeEntry) {
        self.0.push_back(entry);
        while self.0.len() > MAX_CHANGELOG_SIZE {
            self.0.pop_front();
        }
    }

    pub fn entries(&self) -> &VecDeque<ChangeEntry> {
        &self.0
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Todo 任务项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Todo {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub tab: Tab,
    #[serde(default)]
    pub quadrant: Quadrant,
    #[serde(default)]
    pub progress: u8,
    #[serde(default)]
    pub completed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(default)]
    pub assignee: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub changelog: Changelog,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

impl Todo {
    /// 创建新任务
    pub fn new(text: String, tab: Tab, quadrant: Quadrant) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Self::generate_id(),
            text,
            content: String::new(),
            tab,
            quadrant,
            progress: 0,
            completed: false,
            completed_at: None,
            due_date: None,
            assignee: String::new(),
            tags: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
            changelog: Changelog::new(),
            deleted: false,
            deleted_at: None,
        }
    }

    /// 生成 8 位唯一 ID
    fn generate_id() -> String {
        Uuid::new_v4().to_string()[..8].to_string()
    }

    /// 记录字段变更
    pub fn record_change(&mut self, field: &str, old_value: &str, new_value: &str) {
        let label = match field {
            "tab" => "时间维度",
            "quadrant" => "象限",
            "progress" => "进度",
            "completed" => "完成状态",
            "assignee" => "负责人",
            "due_date" => "截止日期",
            "tags" => "标签",
            "text" => "标题",
            "content" => "内容",
            _ => field,
        };

        self.changelog.push(ChangeEntry::new(field, label, old_value, new_value));
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// 更新进度，100% 时自动完成
    pub fn set_progress(&mut self, progress: u8) {
        let old_progress = self.progress;
        let new_progress = progress.min(100);

        if old_progress != new_progress {
            self.record_change("progress", &old_progress.to_string(), &new_progress.to_string());
            self.progress = new_progress;

            // 100% 自动完成
            if new_progress == 100 && !self.completed {
                self.set_completed(true);
            }
        }
    }

    /// 设置完成状态
    pub fn set_completed(&mut self, completed: bool) {
        if self.completed != completed {
            self.record_change(
                "completed",
                if self.completed { "已完成" } else { "未完成" },
                if completed { "已完成" } else { "未完成" },
            );
            self.completed = completed;
            self.completed_at = if completed { Some(Utc::now().to_rfc3339()) } else { None };
        }
    }

    /// 设置象限
    pub fn set_quadrant(&mut self, quadrant: Quadrant) {
        if self.quadrant != quadrant {
            self.record_change("quadrant", self.quadrant.label(), quadrant.label());
            self.quadrant = quadrant;
        }
    }

    /// 设置时间标签
    pub fn set_tab(&mut self, tab: Tab) {
        if self.tab != tab {
            self.record_change("tab", self.tab.as_str(), tab.as_str());
            self.tab = tab;
        }
    }

    /// 软删除
    pub fn soft_delete(&mut self) {
        self.deleted = true;
        self.deleted_at = Some(Utc::now().to_rfc3339());
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// 恢复删除
    pub fn restore(&mut self) {
        self.deleted = false;
        self.deleted_at = None;
        self.updated_at = Utc::now().to_rfc3339();
    }
}

/// 用于 API 更新的部分字段结构
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TodoUpdate {
    pub text: Option<String>,
    pub content: Option<String>,
    pub tab: Option<Tab>,
    pub quadrant: Option<Quadrant>,
    pub progress: Option<u8>,
    pub completed: Option<bool>,
    pub due_date: Option<String>,
    pub assignee: Option<String>,
    pub tags: Option<Vec<String>>,
}

impl Todo {
    /// 应用部分更新
    pub fn apply_update(&mut self, update: TodoUpdate) {
        if let Some(text) = update.text {
            if self.text != text {
                let old_text = self.text.clone();
                self.record_change("text", &old_text, &text);
                self.text = text;
            }
        }

        if let Some(content) = update.content {
            if self.content != content {
                // 内容变更不记录详细 diff
                self.record_change("content", "(已更新)", "(已更新)");
                self.content = content;
            }
        }

        if let Some(tab) = update.tab {
            self.set_tab(tab);
        }

        if let Some(quadrant) = update.quadrant {
            self.set_quadrant(quadrant);
        }

        if let Some(progress) = update.progress {
            self.set_progress(progress);
        }

        if let Some(completed) = update.completed {
            self.set_completed(completed);
        }

        if let Some(due_date) = update.due_date {
            let old = self.due_date.clone().unwrap_or_default();
            self.due_date = Some(due_date.clone());
            self.record_change("due_date", &old, &due_date);
        }

        if let Some(assignee) = update.assignee {
            if self.assignee != assignee {
                let old_assignee = self.assignee.clone();
                self.record_change("assignee", &old_assignee, &assignee);
                self.assignee = assignee;
            }
        }

        if let Some(tags) = update.tags {
            let old = self.tags.join(", ");
            let new = tags.join(", ");
            if old != new {
                self.record_change("tags", &old, &new);
                self.tags = tags;
            }
        }

        self.updated_at = Utc::now().to_rfc3339();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_todo_creation() {
        let todo = Todo::new(
            "测试任务".to_string(),
            Tab::Today,
            Quadrant::ImportantUrgent,
        );

        assert_eq!(todo.text, "测试任务");
        assert_eq!(todo.tab, Tab::Today);
        assert_eq!(todo.quadrant, Quadrant::ImportantUrgent);
        assert_eq!(todo.progress, 0);
        assert!(!todo.completed);
        assert_eq!(todo.id.len(), 8);
    }

    #[test]
    fn test_progress_auto_complete() {
        let mut todo = Todo::new("任务".to_string(), Tab::Today, Quadrant::ImportantUrgent);

        todo.set_progress(100);

        assert!(todo.completed);
        assert!(todo.completed_at.is_some());
        assert_eq!(todo.changelog.len(), 2); // progress + completed
    }

    #[test]
    fn test_changelog_limit() {
        let mut changelog = Changelog::new();

        for i in 0..60 {
            changelog.push(ChangeEntry::new("field", "label", &i.to_string(), &(i+1).to_string()));
        }

        assert_eq!(changelog.len(), MAX_CHANGELOG_SIZE);
    }

    #[test]
    fn test_quadrant_serialization() {
        let quadrant = Quadrant::ImportantUrgent;
        let json = serde_json::to_string(&quadrant).unwrap();
        assert_eq!(json, "\"important-urgent\"");

        let parsed: Quadrant = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, Quadrant::ImportantUrgent);
    }
}
