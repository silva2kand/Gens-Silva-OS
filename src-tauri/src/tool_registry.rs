use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRegistryEntry {
    pub name: String,
    pub connector: String,
    pub auth_type: String,
    pub implemented: bool,
    pub risk: String,
    pub notes: String,
}

fn entries() -> Vec<ToolRegistryEntry> {
    vec![
        ("read_file", "local_files", "none", true, "local_read", "Reads local text files."),
        ("write_file", "local_files", "none", true, "local_write", "Writes local files after UI confirmation."),
        ("list_directory", "local_files", "none", true, "local_read", "Lists local directories."),
        ("search_files", "local_files", "none", true, "local_read", "Searches local file names."),
        ("create_directory", "local_files", "none", true, "local_write", "Creates local folders."),
        ("delete_path", "local_files", "none", true, "destructive", "Deletes local files/folders only after confirmation."),
        ("execute_command", "terminal", "none", true, "local_command", "Runs shell commands through the terminal module."),
        ("execute_command_in_directory", "terminal", "none", true, "local_command", "Runs shell commands in a specified folder."),
        ("fetch_url", "browser", "none", true, "web_read", "Fetches HTTP/HTTPS page text, links, and images."),
        ("web_search", "browser", "none", true, "web_read", "Runs web search through DuckDuckGo HTML."),
        ("navigate", "browser", "none", true, "external_open", "Opens a URL in the system browser."),
        ("search_emails", "email_archive", "local/env", true, "local_read", "Searches local exported email archive."),
        ("classic_outlook_status", "classic_outlook", "desktop", true, "local_read", "Checks classic Outlook desktop profile/accounts through local COM bridge."),
        ("search_classic_outlook", "classic_outlook", "desktop", true, "local_read", "Searches classic Outlook Inbox/Sent/Drafts through the signed-in desktop profile."),
        ("list_classic_outlook_latest", "classic_outlook", "desktop", true, "local_read", "Reads latest Classic Outlook Inbox/Sent/Drafts items."),
        ("list_classic_outlook_all", "classic_outlook", "desktop", true, "local_read", "Reads Classic Outlook default folders and recursively walks mail stores with safety limits."),
        ("run_hermes_email_intelligence", "hermes", "desktop/local_ai", true, "local_read", "Runs Hermes Email Intelligence v1 over Classic Outlook mail folders and creates draft-only recommendations."),
        ("run_openclaw_computer_operator", "openclaw", "desktop/local_ai", true, "approval_gated", "Inspects local computer/app context, opens safe URLs, and prepares approval-gated operator plans."),
        ("run_openclaw_vision_operator", "openclaw", "screen/local_ai", true, "approval_gated", "Captures screen, checks OCR status, loads allowlist, and prepares approval-gated UI automation plans."),
        ("capture_screen_screenshot", "computer_operator", "windows", true, "local_read", "Captures current Windows virtual screen to local replay-log screenshot."),
        ("detect_screen_text", "computer_operator", "windows", true, "local_read", "OCR placeholder that records status until Windows OCR/Tesseract is wired."),
        ("perform_ui_action", "computer_operator", "windows", true, "approval_gated", "Approval-gated click/type/hotkey against allowlisted apps."),
        ("list_operator_replay_log", "computer_operator", "none", true, "local_read", "Lists screenshot and UI action replay/audit log."),
        ("send_email", "smtp", "env", true, "external_send", "SMTP send requires SMTP_SERVER/SMTP_USER/SMTP_PASS and approval."),
        ("create_channel_notification", "channels", "none", true, "local_queue", "Queues a WhatsApp/channel notification inside the app."),
        ("list_channel_notifications", "channels", "none", true, "local_read", "Lists queued channel notifications."),
        ("respond_channel_notification", "channels", "none", true, "local_write", "Stores a response for one queued notification."),
        ("create_universal_notification", "notification_center", "none", true, "local_queue", "Creates a routed notification with source item, thread, allowed replies, and expiry."),
        ("route_inbound_reply", "notification_center", "none", true, "local_write", "Routes a reply like H-1042 1 back to the exact source notification/task."),
        ("run_agent", "agents", "none", true, "ai", "Runs a configured agent through the active AI provider."),
        ("run_skill", "skills", "none", true, "ai", "Runs a saved skill through the active AI provider and logs output."),
    ]
    .into_iter()
    .map(|(name, connector, auth_type, implemented, risk, notes)| ToolRegistryEntry {
        name: name.to_string(),
        connector: connector.to_string(),
        auth_type: auth_type.to_string(),
        implemented,
        risk: risk.to_string(),
        notes: notes.to_string(),
    })
    .collect()
}

#[tauri::command]
pub fn list_tool_registry() -> Result<Vec<ToolRegistryEntry>, String> {
    Ok(entries())
}

fn arg_string(args: &serde_json::Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| format!("Missing string argument '{}'", key))
}

#[tauri::command]
pub async fn execute_registered_tool(name: String, args: serde_json::Value) -> Result<serde_json::Value, String> {
    match name.as_str() {
        "read_file" => Ok(serde_json::json!(crate::commands::file_system::read_file(arg_string(&args, "path")?)?)),
        "write_file" => {
            crate::commands::file_system::write_file(arg_string(&args, "path")?, arg_string(&args, "content")?)?;
            Ok(serde_json::json!({ "ok": true }))
        }
        "list_directory" => Ok(serde_json::json!(crate::commands::file_system::list_directory(arg_string(&args, "path")?)?)),
        "search_files" => Ok(serde_json::json!(crate::commands::file_system::search_files(
            args.get("query").and_then(|value| value.as_str()).or_else(|| args.get("pattern").and_then(|value| value.as_str())).unwrap_or_default().to_string(),
            args.get("basePath").and_then(|value| value.as_str()).or_else(|| args.get("path").and_then(|value| value.as_str())).unwrap_or(".").to_string(),
        )?)),
        "create_directory" => {
            crate::commands::file_system::create_directory(arg_string(&args, "path")?)?;
            Ok(serde_json::json!({ "ok": true }))
        }
        "delete_path" => {
            crate::commands::file_system::delete_path(arg_string(&args, "path")?)?;
            Ok(serde_json::json!({ "ok": true }))
        }
        "execute_command" => Ok(serde_json::json!(crate::commands::terminal::execute_command(arg_string(&args, "command")?)?)),
        "execute_command_in_directory" => Ok(serde_json::json!(crate::commands::terminal::execute_command_in_directory(arg_string(&args, "command")?, arg_string(&args, "cwd")?)?)),
        "fetch_url" => crate::connectors::browser::fetch_url(arg_string(&args, "url")?).await,
        "web_search" => Ok(serde_json::json!(crate::connectors::browser::web_search(arg_string(&args, "query")?).await?)),
        "navigate" => {
            crate::connectors::browser::navigate(arg_string(&args, "url")?)?;
            Ok(serde_json::json!({ "ok": true }))
        }
        "search_emails" => Ok(serde_json::json!(crate::connectors::gmail::search_emails(arg_string(&args, "query")?)?)),
        "classic_outlook_status" => crate::connectors::classic_outlook::classic_outlook_status(),
        "search_classic_outlook" => Ok(serde_json::json!(crate::connectors::classic_outlook::search_classic_outlook(
            args.get("query").and_then(|value| value.as_str()).unwrap_or_default().to_string(),
            args.get("limit").and_then(|value| value.as_u64()).map(|value| value as usize),
        )?)),
        "list_classic_outlook_latest" => Ok(serde_json::json!(crate::connectors::classic_outlook::list_classic_outlook_latest(
            args.get("perFolder").and_then(|value| value.as_u64()).map(|value| value as usize),
        )?)),
        "list_classic_outlook_all" => Ok(serde_json::json!(crate::connectors::classic_outlook::list_classic_outlook_all(
            args.get("perFolder").and_then(|value| value.as_u64()).map(|value| value as usize),
            args.get("totalLimit").and_then(|value| value.as_u64()).map(|value| value as usize),
        )?)),
        "run_hermes_email_intelligence" => Ok(serde_json::json!(crate::agent_runtime::run_hermes_email_intelligence_inner(
            None,
            args.get("perFolder").and_then(|value| value.as_u64()).map(|value| value as usize),
        ).await?)),
        "run_openclaw_computer_operator" => Ok(serde_json::json!(crate::agent_runtime::run_openclaw_computer_operator(
            args.get("goal").and_then(|value| value.as_str()).unwrap_or("Inspect computer context and prepare safe next operator steps.").to_string(),
        ).await?)),
        "run_openclaw_vision_operator" => Ok(serde_json::json!(crate::agent_runtime::run_openclaw_vision_operator(
            args.get("goal").and_then(|value| value.as_str()).unwrap_or("Capture screen and prepare safe UI automation plan.").to_string(),
        ).await?)),
        "capture_screen_screenshot" => Ok(serde_json::json!(crate::computer_operator::capture_screen_screenshot()?)),
        "detect_screen_text" => crate::computer_operator::detect_screen_text(arg_string(&args, "snapshotPath")?),
        "perform_ui_action" => Ok(serde_json::json!(crate::computer_operator::perform_ui_action(
            arg_string(&args, "actionType")?,
            arg_string(&args, "targetApp")?,
            args.get("x").and_then(|value| value.as_i64()).map(|value| value as i32),
            args.get("y").and_then(|value| value.as_i64()).map(|value| value as i32),
            args.get("text").and_then(|value| value.as_str()).map(|value| value.to_string()),
            args.get("hotkey").and_then(|value| value.as_str()).map(|value| value.to_string()),
            args.get("approved").and_then(|value| value.as_bool()).unwrap_or(false),
            args.get("screenshotPath").and_then(|value| value.as_str()).map(|value| value.to_string()),
        )?)),
        "list_operator_replay_log" => Ok(serde_json::json!(crate::computer_operator::list_operator_replay_log()?)),
        "create_channel_notification" => Ok(serde_json::json!(crate::channels::create_channel_notification(
            arg_string(&args, "channel")?,
            args.get("agentId").and_then(|value| value.as_str()).unwrap_or("tool").to_string(),
            arg_string(&args, "title")?,
            arg_string(&args, "message")?,
            args.get("requiresApproval").and_then(|value| value.as_bool()),
        )?)),
        "list_channel_notifications" => Ok(serde_json::json!(crate::channels::list_channel_notifications(args.get("channel").and_then(|value| value.as_str()).map(|value| value.to_string()))?)),
        "respond_channel_notification" => Ok(serde_json::json!(crate::channels::respond_channel_notification(arg_string(&args, "id")?, arg_string(&args, "response")?)?)),
        "create_universal_notification" => Ok(serde_json::json!(crate::notification_center::create_universal_notification(
            args.get("channel").and_then(|value| value.as_str()).unwrap_or("app").to_string(),
            args.get("sourceAgent").and_then(|value| value.as_str()).unwrap_or("assistant").to_string(),
            args.get("sourceItemId").and_then(|value| value.as_str()).unwrap_or("").to_string(),
            args.get("threadId").and_then(|value| value.as_str()).unwrap_or("").to_string(),
            args.get("actionType").and_then(|value| value.as_str()).unwrap_or("general").to_string(),
            arg_string(&args, "title")?,
            arg_string(&args, "message")?,
            None,
            args.get("expiresMinutes").and_then(|value| value.as_i64()),
            args.get("requiresApproval").and_then(|value| value.as_bool()),
        )?)),
        "route_inbound_reply" => Ok(serde_json::json!(crate::notification_center::route_inbound_reply(
            args.get("channel").and_then(|value| value.as_str()).unwrap_or("app").to_string(),
            arg_string(&args, "raw")?,
        )?)),
        "run_agent" => Ok(serde_json::json!(crate::agents::run_agent(arg_string(&args, "id")?, arg_string(&args, "input")?).await?)),
        "run_skill" => crate::skills::run_skill(arg_string(&args, "id")?, arg_string(&args, "input")?).await,
        _ => Err(format!("Tool '{}' is catalogued but not implemented in the backend execution registry yet.", name)),
    }
}
