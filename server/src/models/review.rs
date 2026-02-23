use chrono::{Datelike, Local, NaiveDate};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Frequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FrequencyConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day_of_week: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day_of_month: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub month: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DueStatus {
    Overdue,
    DueToday,
    DueSoon,
    Upcoming,
    Completed,
    Paused,
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_status: Option<DueStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub days_until_due: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_label: Option<String>,
}

impl ReviewItem {
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

    fn is_completed_this_period(&self, today: NaiveDate) -> bool {
        let last = match &self.last_completed {
            Some(s) => {
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
                let today_week = today.iso_week();
                let last_week = last.iso_week();
                today_week.year() == last_week.year() && today_week.week() == last_week.week()
            }
            Frequency::Monthly => last.year() == today.year() && last.month() == today.month(),
            Frequency::Yearly => last.year() == today.year(),
        }
    }

    fn next_due_date(&self, today: NaiveDate) -> NaiveDate {
        match self.frequency {
            Frequency::Daily => today,
            Frequency::Weekly => {
                let target_dow = self.frequency_config.day_of_week.unwrap_or(1);
                let today_dow = today.weekday().number_from_monday() as u8;
                if today_dow <= target_dow {
                    today + chrono::Duration::days((target_dow - today_dow) as i64)
                } else {
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
                } else if today.month() == 12 {
                    NaiveDate::from_ymd_opt(today.year() + 1, 1, target_day).unwrap_or(today)
                } else {
                    NaiveDate::from_ymd_opt(today.year(), today.month() + 1, target_day)
                        .unwrap_or(today)
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
}

#[derive(Debug, Deserialize)]
pub struct CreateReviewRequest {
    pub text: String,
    pub frequency: Frequency,
    #[serde(default)]
    pub frequency_config: FrequencyConfig,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub category: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReviewRequest {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub frequency: Option<Frequency>,
    #[serde(default)]
    pub frequency_config: Option<FrequencyConfig>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub paused: Option<bool>,
}
