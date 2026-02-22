use serde_json::{json, Value};

const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-sonnet-4-5-20250929";
const MAX_TOOL_ROUNDS: usize = 5;

pub struct ClaudeClient {
    api_key: String,
    http: reqwest::Client,
}

/// Represents one content block from Claude's response
#[derive(Debug, Clone)]
pub enum ContentBlock {
    Text(String),
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
}

/// The result of a complete Claude conversation turn (potentially multi-round with tools)
pub struct ChatResult {
    /// The final text response to show the user
    pub text: String,
    /// Tool calls that were executed (name, input, result)
    pub tool_calls: Vec<(String, Value, Value)>,
    /// Total input tokens used across all rounds
    pub input_tokens: i64,
    /// Total output tokens used across all rounds
    pub output_tokens: i64,
}

impl ClaudeClient {
    pub fn new() -> Option<Self> {
        let api_key = std::env::var("ANTHROPIC_API_KEY").ok()?;
        if api_key.is_empty() {
            return None;
        }
        Some(Self {
            api_key,
            http: reqwest::Client::new(),
        })
    }

    /// Send a message to Claude with tool use loop.
    /// `messages` should contain the conversation history.
    /// `system` is the system prompt.
    /// `execute_tool` is called for each tool_use block.
    pub async fn chat(
        &self,
        system: &str,
        messages: Vec<Value>,
        tools: &[Value],
        mut execute_tool: impl FnMut(&str, &Value) -> Value,
    ) -> Result<ChatResult, String> {
        let mut all_messages = messages;
        let mut total_input = 0i64;
        let mut total_output = 0i64;
        let mut tool_calls_log: Vec<(String, Value, Value)> = Vec::new();

        for round in 0..MAX_TOOL_ROUNDS {
            let mut body = json!({
                "model": MODEL,
                "max_tokens": 2048,
                "system": system,
                "tools": tools,
                "messages": all_messages,
            });
            // First round: let the model decide freely (auto)
            // Subsequent rounds after tool results: also auto
            if round == 0 {
                body["tool_choice"] = json!({"type": "auto"});
            }

            // Debug: log request on first round
            if round == 0 {
                eprintln!("[Claude] Sending {} messages, {} tools", all_messages.len(), tools.len());
            }

            let resp = self
                .http
                .post(CLAUDE_API_URL)
                .header("x-api-key", &self.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .timeout(std::time::Duration::from_secs(30))
                .send()
                .await
                .map_err(|e| format!("Claude API request failed: {}", e))?;

            let status = resp.status();
            if status.as_u16() == 429 {
                // Rate limited — retry with backoff
                if round < 2 {
                    tokio::time::sleep(std::time::Duration::from_secs(2u64.pow(round as u32)))
                        .await;
                    continue;
                }
                return Err("阿宝太忙了，请稍后再试".into());
            }
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("Claude API error {}: {}", status.as_u16(), text));
            }

            let resp_json: Value = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse Claude response: {}", e))?;

            // Track tokens
            if let Some(usage) = resp_json.get("usage") {
                total_input += usage["input_tokens"].as_i64().unwrap_or(0);
                total_output += usage["output_tokens"].as_i64().unwrap_or(0);
            }

            // Parse content blocks
            let content = resp_json["content"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let stop_reason = resp_json["stop_reason"].as_str().unwrap_or("end_turn");
            eprintln!("[Claude] Round {}: stop_reason={}, blocks={}", round, stop_reason, content.len());

            let mut blocks: Vec<ContentBlock> = Vec::new();
            for block in &content {
                match block["type"].as_str() {
                    Some("text") => {
                        if let Some(text) = block["text"].as_str() {
                            blocks.push(ContentBlock::Text(text.to_string()));
                        }
                    }
                    Some("tool_use") => {
                        blocks.push(ContentBlock::ToolUse {
                            id: block["id"].as_str().unwrap_or("").to_string(),
                            name: block["name"].as_str().unwrap_or("").to_string(),
                            input: block["input"].clone(),
                        });
                    }
                    _ => {}
                }
            }

            // If stop_reason is "tool_use", execute tools and continue loop
            if stop_reason == "tool_use" {
                // Add assistant's response to messages
                all_messages.push(json!({
                    "role": "assistant",
                    "content": content,
                }));

                // Execute each tool and build tool_result messages
                let mut tool_results = Vec::new();
                for block in &blocks {
                    if let ContentBlock::ToolUse { id, name, input } = block {
                        let result = execute_tool(name, input);
                        tool_calls_log.push((name.clone(), input.clone(), result.clone()));
                        tool_results.push(json!({
                            "type": "tool_result",
                            "tool_use_id": id,
                            "content": serde_json::to_string(&result).unwrap_or_default(),
                        }));
                    }
                }

                all_messages.push(json!({
                    "role": "user",
                    "content": tool_results,
                }));

                continue;
            }

            // end_turn — extract final text
            let mut final_text = String::new();
            for block in &blocks {
                if let ContentBlock::Text(t) = block {
                    if !final_text.is_empty() {
                        final_text.push('\n');
                    }
                    final_text.push_str(t);
                }
            }

            return Ok(ChatResult {
                text: final_text,
                tool_calls: tool_calls_log,
                input_tokens: total_input,
                output_tokens: total_output,
            });
        }

        Err("操作太复杂，请简化请求".into())
    }

    /// Simple one-shot generation — no tools, no conversation history.
    /// Used for lightweight text generation like moment header.
    pub async fn simple_generate(&self, system: &str, user_message: &str, max_tokens: u32) -> Result<String, String> {
        let body = json!({
            "model": MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user_message}],
        });

        let resp = self
            .http
            .post(CLAUDE_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Claude API request failed: {}", e))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Claude API error: {}", text));
        }

        let resp_json: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse Claude response: {}", e))?;

        // Extract text from first content block
        if let Some(content) = resp_json["content"].as_array() {
            for block in content {
                if block["type"].as_str() == Some("text") {
                    if let Some(text) = block["text"].as_str() {
                        return Ok(text.trim().to_string());
                    }
                }
            }
        }

        Err("No text in Claude response".into())
    }
}
