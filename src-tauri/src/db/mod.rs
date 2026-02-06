//! 数据存储层
//!
//! 管理 Todo 和 Routine 的持久化存储

use crate::models::{Quadrant, Routine, Tab, Todo};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter};
use std::path::PathBuf;

/// Todo 数据库
pub struct TodoDb {
    items: HashMap<String, Todo>,
    file_path: PathBuf,
}

/// JSON 文件格式 (与现有格式兼容)
#[derive(Debug, Serialize, Deserialize)]
struct TodosFile {
    items: Vec<Todo>,
}

impl TodoDb {
    /// 从文件加载数据库
    pub fn load(file_path: PathBuf) -> Result<Self, DbError> {
        if !file_path.exists() {
            // 文件不存在，创建空数据库
            return Ok(Self {
                items: HashMap::new(),
                file_path,
            });
        }

        let file = File::open(&file_path).map_err(DbError::Io)?;
        let reader = BufReader::new(file);
        let data: TodosFile = serde_json::from_reader(reader).map_err(DbError::Json)?;

        // 构建 HashMap 索引
        let mut items = HashMap::with_capacity(data.items.len());
        for item in data.items {
            items.insert(item.id.clone(), item);
        }

        Ok(Self { items, file_path })
    }

    /// 原子保存到文件
    pub fn save(&self) -> Result<(), DbError> {
        // 确保目录存在
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).map_err(DbError::Io)?;
        }

        // 写入临时文件
        let temp_path = self.file_path.with_extension("tmp");
        let file = File::create(&temp_path).map_err(DbError::Io)?;
        let writer = BufWriter::new(file);

        // 转换为 Vec 并排序 (保持与现有格式一致)
        let mut items: Vec<&Todo> = self.items.values().collect();
        items.sort_by(|a, b| {
            // 未完成的在前，然后按创建时间排序
            a.completed
                .cmp(&b.completed)
                .then_with(|| a.created_at.cmp(&b.created_at))
        });

        let data = TodosFile {
            items: items.into_iter().cloned().collect(),
        };

        serde_json::to_writer_pretty(writer, &data).map_err(DbError::Json)?;

        // 原子替换
        fs::rename(&temp_path, &self.file_path).map_err(DbError::Io)?;

        Ok(())
    }

    /// 获取所有任务
    pub fn all(&self) -> Vec<&Todo> {
        self.items.values().filter(|t| !t.deleted).collect()
    }

    /// 按 tab 筛选任务
    pub fn filter_by_tab(&self, tab: &Tab) -> Vec<&Todo> {
        self.items
            .values()
            .filter(|t| !t.deleted && &t.tab == tab)
            .collect()
    }

    /// 按象限筛选任务
    pub fn filter_by_quadrant(&self, quadrant: &Quadrant) -> Vec<&Todo> {
        self.items
            .values()
            .filter(|t| !t.deleted && &t.quadrant == quadrant)
            .collect()
    }

    /// 按 tab 和象限筛选
    pub fn filter_by_tab_and_quadrant(&self, tab: &Tab, quadrant: &Quadrant) -> Vec<&Todo> {
        self.items
            .values()
            .filter(|t| !t.deleted && &t.tab == tab && &t.quadrant == quadrant)
            .collect()
    }

    /// 获取单个任务
    pub fn get(&self, id: &str) -> Option<&Todo> {
        self.items.get(id)
    }

    /// 获取单个任务 (可变)
    pub fn get_mut(&mut self, id: &str) -> Option<&mut Todo> {
        self.items.get_mut(id)
    }

    /// 添加任务
    pub fn insert(&mut self, todo: Todo) {
        self.items.insert(todo.id.clone(), todo);
    }

    /// 移除任务 (永久删除)
    pub fn remove(&mut self, id: &str) -> Option<Todo> {
        self.items.remove(id)
    }

    /// 获取已删除的任务
    pub fn deleted(&self) -> Vec<&Todo> {
        self.items.values().filter(|t| t.deleted).collect()
    }

    /// 任务数量
    pub fn len(&self) -> usize {
        self.items.values().filter(|t| !t.deleted).count()
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// 统计各象限任务数
    pub fn count_by_quadrant(&self, tab: &Tab) -> HashMap<String, usize> {
        let mut counts = HashMap::new();

        for quadrant in &[
            Quadrant::ImportantUrgent,
            Quadrant::ImportantNotUrgent,
            Quadrant::NotImportantUrgent,
            Quadrant::NotImportantNotUrgent,
        ] {
            let count = self
                .items
                .values()
                .filter(|t| !t.deleted && !t.completed && &t.tab == tab && &t.quadrant == quadrant)
                .count();
            counts.insert(quadrant.as_str().to_string(), count);
        }

        counts
    }
}

/// Routine 数据库
pub struct RoutineDb {
    items: HashMap<String, Routine>,
    file_path: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
struct RoutinesFile {
    items: Vec<Routine>,
}

impl RoutineDb {
    /// 从文件加载
    pub fn load(file_path: PathBuf) -> Result<Self, DbError> {
        if !file_path.exists() {
            return Ok(Self {
                items: HashMap::new(),
                file_path,
            });
        }

        let file = File::open(&file_path).map_err(DbError::Io)?;
        let reader = BufReader::new(file);
        let data: RoutinesFile = serde_json::from_reader(reader).map_err(DbError::Json)?;

        let mut items = HashMap::with_capacity(data.items.len());
        for mut item in data.items {
            // 检查每日重置
            item.check_daily_reset();
            items.insert(item.id.clone(), item);
        }

        Ok(Self { items, file_path })
    }

    /// 保存到文件
    pub fn save(&self) -> Result<(), DbError> {
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).map_err(DbError::Io)?;
        }

        let temp_path = self.file_path.with_extension("tmp");
        let file = File::create(&temp_path).map_err(DbError::Io)?;
        let writer = BufWriter::new(file);

        let items: Vec<&Routine> = self.items.values().collect();
        let data = RoutinesFile {
            items: items.into_iter().cloned().collect(),
        };

        serde_json::to_writer_pretty(writer, &data).map_err(DbError::Json)?;
        fs::rename(&temp_path, &self.file_path).map_err(DbError::Io)?;

        Ok(())
    }

    /// 获取所有 routine
    pub fn all(&self) -> Vec<&Routine> {
        self.items.values().collect()
    }

    /// 获取单个
    pub fn get(&self, id: &str) -> Option<&Routine> {
        self.items.get(id)
    }

    /// 获取单个 (可变)
    pub fn get_mut(&mut self, id: &str) -> Option<&mut Routine> {
        self.items.get_mut(id)
    }

    /// 添加
    pub fn insert(&mut self, routine: Routine) {
        self.items.insert(routine.id.clone(), routine);
    }

    /// 移除
    pub fn remove(&mut self, id: &str) -> Option<Routine> {
        self.items.remove(id)
    }
}

/// 获取数据目录路径
pub fn get_data_dir() -> PathBuf {
    // 统一使用 %LOCALAPPDATA%/Next/data/
    // 开发和生产环境使用相同路径，避免路径问题
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Next")
        .join("data")
}

/// 获取 todos.json 路径
pub fn get_todos_path() -> PathBuf {
    get_data_dir().join("todos.json")
}

/// 获取 routines.json 路径
pub fn get_routines_path() -> PathBuf {
    get_data_dir().join("routines.json")
}

/// 数据库错误类型
#[derive(Debug)]
pub enum DbError {
    Io(std::io::Error),
    Json(serde_json::Error),
    NotFound(String),
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DbError::Io(e) => write!(f, "IO error: {}", e),
            DbError::Json(e) => write!(f, "JSON error: {}", e),
            DbError::NotFound(id) => write!(f, "Item not found: {}", id),
        }
    }
}

impl std::error::Error for DbError {}

impl From<DbError> for String {
    fn from(e: DbError) -> Self {
        e.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_todo_db_crud() {
        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path().to_path_buf();

        let mut db = TodoDb::load(path.clone()).unwrap();

        // Create
        let todo = Todo::new("测试任务".to_string(), Tab::Today, Quadrant::ImportantUrgent);
        let id = todo.id.clone();
        db.insert(todo);

        // Read
        let todo = db.get(&id).unwrap();
        assert_eq!(todo.text, "测试任务");

        // Update
        {
            let todo = db.get_mut(&id).unwrap();
            todo.set_progress(50);
        }
        assert_eq!(db.get(&id).unwrap().progress, 50);

        // Delete
        db.remove(&id);
        assert!(db.get(&id).is_none());
    }

    #[test]
    fn test_load_existing_json() {
        let mut temp_file = NamedTempFile::new().unwrap();
        let json = r#"{"items": [{"id": "test1234", "text": "任务1", "content": "", "tab": "today", "quadrant": "important-urgent", "progress": 0, "completed": false, "assignee": "", "tags": [], "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", "changelog": [], "deleted": false}]}"#;
        temp_file.write_all(json.as_bytes()).unwrap();

        let db = TodoDb::load(temp_file.path().to_path_buf()).unwrap();
        assert_eq!(db.len(), 1);

        let todo = db.get("test1234").unwrap();
        assert_eq!(todo.text, "任务1");
    }
}
