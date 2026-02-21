//! ReviewItem 例行审视数据结构

use chrono::{Datelike, Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 重复频率
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Frequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

impl Frequency {
    pub fn label(&self) -> &str {
        match self {
            Frequency::Daily => "每日",
            Frequency::Weekly => "每周",
            Frequency::Monthly => "每月",
            Frequency::Yearly => "每年",
        }
    }
}

/// 频率详细配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FrequencyConfig {
    /// 每周几 (1=周一 ... 7=周日)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day_of_week: Option<u8>,
    /// 每月几号 (1-31)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day_of_month: Option<u8>,
    /// 月份 (1-12)，Yearly 时使用
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub month: Option<u8>,
    /// 日期 (1-31)，Yearly 时使用
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day: Option<u8>,
}

/// 到期状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DueStatus {
    Overdue,   // 已过期未完成
    DueToday,  // 今天到期
    DueSoon,   // 3天内到期
    Upcoming,  // 未来到期
    Completed, // 本周期已完成
    Paused,    // 已暂停
}

/// 例行审视项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewItem {
    pub id: String,
    pub text: String,
    pub frequency: Frequency,
    #[serde(default)]
    pub frequency_config: FrequencyConfig,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub category: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_completed: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub paused: bool,
    /// 计算字段: 到期状态 (不持久化，每次查询时计算)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_status: Option<DueStatus>,
    /// 计算字段: 距离到期天数 (负数=过期，0=今天，正数=未来)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub days_until_due: Option<i64>,
    /// 计算字段: 到期日描述
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_label: Option<String>,
}

impl ReviewItem {
    pub fn new(text: String, frequency: Frequency, frequency_config: FrequencyConfig) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Self::generate_id(),
            text,
            frequency,
            frequency_config,
            notes: String::new(),
            category: String::new(),
            last_completed: None,
            created_at: now.clone(),
            updated_at: now,
            paused: false,
            due_status: None,
            days_until_due: None,
            due_label: None,
        }
    }

    fn generate_id() -> String {
        Uuid::new_v4().to_string()[..8].to_string()
    }

    /// 计算并填充到期状态字段
    pub fn compute_due_status(&mut self) {
        if self.paused {
            self.due_status = Some(DueStatus::Paused);
            self.days_until_due = None;
            self.due_label = Some("已暂停".to_string());
            return;
        }

        let today = Local::now().date_naive();
        let completed_this_period = self.is_completed_this_period(today);

        if completed_this_period {
            self.due_status = Some(DueStatus::Completed);
            self.days_until_due = None;
            self.due_label = Some(self.completed_label());
            return;
        }

        let due_date = self.next_due_date(today);
        let days = (due_date - today).num_days();
        self.days_until_due = Some(days);

        if days < 0 {
            self.due_status = Some(DueStatus::Overdue);
            self.due_label = Some(format!("过期 {} 天", -days));
        } else if days == 0 {
            self.due_status = Some(DueStatus::DueToday);
            self.due_label = Some("今天到期".to_string());
        } else if days <= 3 {
            self.due_status = Some(DueStatus::DueSoon);
            self.due_label = Some(format!("{}天后到期", days));
        } else {
            self.due_status = Some(DueStatus::Upcoming);
            self.due_label = Some(format!("{}天后", days));
        }
    }

    /// 判断本周期是否已完成
    fn is_completed_this_period(&self, today: NaiveDate) -> bool {
        let last = match &self.last_completed {
            Some(s) => {
                // 尝试解析 ISO datetime 或 YYYY-MM-DD
                if let Some(d) = s.get(..10) {
                    NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()
                } else {
                    None
                }
            }
            None => return false,
        };

        let last = match last {
            Some(d) => d,
            None => return false,
        };

        match self.frequency {
            Frequency::Daily => last == today,
            Frequency::Weekly => {
                // 本周内完成即可 (周一为周起始)
                let today_week = today.iso_week();
                let last_week = last.iso_week();
                today_week.year() == last_week.year() && today_week.week() == last_week.week()
            }
            Frequency::Monthly => {
                last.year() == today.year() && last.month() == today.month()
            }
            Frequency::Yearly => {
                last.year() == today.year()
            }
        }
    }

    /// 计算下一个到期日
    fn next_due_date(&self, today: NaiveDate) -> NaiveDate {
        match self.frequency {
            Frequency::Daily => today,
            Frequency::Weekly => {
                let target_dow = self.frequency_config.day_of_week.unwrap_or(1); // 默认周一
                // chrono: Mon=1, Tue=2, ..., Sun=7
                let today_dow = today.weekday().number_from_monday() as u8;
                if today_dow <= target_dow {
                    today + chrono::Duration::days((target_dow - today_dow) as i64)
                } else {
                    // 本周已过，但如果还没完成，仍显示本周的到期日
                    let days_back = (today_dow - target_dow) as i64;
                    today - chrono::Duration::days(days_back)
                }
            }
            Frequency::Monthly => {
                let target_day = self.frequency_config.day_of_month.unwrap_or(1).min(28) as u32;
                let candidate = NaiveDate::from_ymd_opt(today.year(), today.month(), target_day)
                    .unwrap_or(today);
                if candidate >= today || !self.is_completed_this_period(today) {
                    candidate
                } else {
                    // 本月已过且已完成，跳到下月
                    if today.month() == 12 {
                        NaiveDate::from_ymd_opt(today.year() + 1, 1, target_day).unwrap_or(today)
                    } else {
                        NaiveDate::from_ymd_opt(today.year(), today.month() + 1, target_day)
                            .unwrap_or(today)
                    }
                }
            }
            Frequency::Yearly => {
                let target_month = self.frequency_config.month.unwrap_or(1) as u32;
                let target_day = self.frequency_config.day.unwrap_or(1).min(28) as u32;
                let candidate = NaiveDate::from_ymd_opt(today.year(), target_month, target_day)
                    .unwrap_or(today);
                if candidate >= today {
                    candidate
                } else {
                    // 今年已过
                    NaiveDate::from_ymd_opt(today.year() + 1, target_month, target_day)
                        .unwrap_or(today)
                }
            }
        }
    }

    fn completed_label(&self) -> String {
        match self.frequency {
            Frequency::Daily => "今日已完成".to_string(),
            Frequency::Weekly => "本周已完成".to_string(),
            Frequency::Monthly => "本月已完成".to_string(),
            Frequency::Yearly => "今年已完成".to_string(),
        }
    }

    /// 标记完成
    pub fn complete(&mut self) {
        self.last_completed = Some(Utc::now().to_rfc3339());
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// 取消完成
    pub fn uncomplete(&mut self) {
        self.last_completed = None;
        self.updated_at = Utc::now().to_rfc3339();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_daily_review() {
        let mut item = ReviewItem::new(
            "每日锻炼".to_string(),
            Frequency::Daily,
            FrequencyConfig::default(),
        );
        item.compute_due_status();
        assert_eq!(item.due_status, Some(DueStatus::DueToday));

        item.complete();
        item.compute_due_status();
        assert_eq!(item.due_status, Some(DueStatus::Completed));
    }

    #[test]
    fn test_monthly_review() {
        let item = ReviewItem::new(
            "信用卡账单".to_string(),
            Frequency::Monthly,
            FrequencyConfig {
                day_of_month: Some(15),
                ..Default::default()
            },
        );
        assert_eq!(item.frequency, Frequency::Monthly);
        assert_eq!(item.frequency_config.day_of_month, Some(15));
    }

    #[test]
    fn test_yearly_review() {
        let item = ReviewItem::new(
            "老婆生日".to_string(),
            Frequency::Yearly,
            FrequencyConfig {
                month: Some(3),
                day: Some(14),
                ..Default::default()
            },
        );
        assert_eq!(item.frequency, Frequency::Yearly);
        assert_eq!(item.frequency_config.month, Some(3));
        assert_eq!(item.frequency_config.day, Some(14));
    }
}
