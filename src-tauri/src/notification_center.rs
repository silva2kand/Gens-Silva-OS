use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllowedReply {
    pub code: String,
    pub label: String,
    pub action: String,
    pub requires_approval: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutedReply {
    pub id: String,
    pub at: String,
    pub channel: String,
    pub raw: String,
    pub notification_id: String,
    pub selected_code: String,
    pub selected_action: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UniversalNotification {
    pub notification_id: String,
    pub short_id: String,
    pub channel: String,
    pub source_agent: String,
    pub source_item_id: String,
    pub thread_id: String,
    pub action_type: String,
    pub title: String,
    pub message: String,
    pub allowed_replies: Vec<AllowedReply>,
    pub status: String,
    pub reply_history: Vec<RoutedReply>,
    pub requires_approval: bool,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: String,
}

static NOTIFICATION_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("notification_center");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
});

fn registry_path() -> PathBuf {
    NOTIFICATION_DIR.join("notifications.json")
}

fn read_notifications() -> Result<Vec<UniversalNotification>, String> {
    let path = registry_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_notifications(notifications: &[UniversalNotification]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(notifications).map_err(|e| e.to_string())?;
    fs::write(registry_path(), json).map_err(|e| e.to_string())
}

fn agent_prefix(agent: &str) -> String {
    match agent.to_ascii_lowercase().as_str() {
        "hermes" => "H",
        "paperclip" => "P",
        "openclaw" => "O",
        "solicister" => "S",
        "accountants" => "A",
        "spaceagent" => "SP",
        "self-study" | "selfstudy" => "SS",
        _ => "N",
    }
    .to_string()
}

fn next_short_id(agent: &str, existing: &[UniversalNotification]) -> String {
    let prefix = agent_prefix(agent);
    let max = existing
        .iter()
        .filter_map(|item| item.short_id.strip_prefix(&format!("{}-", prefix)))
        .filter_map(|tail| tail.parse::<u32>().ok())
        .max()
        .unwrap_or(1041);
    format!("{}-{}", prefix, max + 1)
}

pub fn default_allowed_replies(action_type: &str) -> Vec<AllowedReply> {
    match action_type {
        "email_approval" => vec![
            ("1", "Draft polite reply", "draft_reply", false),
            ("2", "Ignore for now", "ignore", false),
            ("3", "Show full email", "show_source", false),
            ("4", "Remind me later", "remind_later", false),
            ("5", "Approve send", "approve_send", true),
        ],
        "code_approval" => vec![
            ("1", "Show diff", "show_diff", false),
            ("2", "Run tests", "run_tests", false),
            ("3", "Approve change", "approve_change", true),
            ("4", "Pause", "pause", false),
        ],
        "legal_approval" => vec![
            ("1", "Show draft", "show_draft", false),
            ("2", "List evidence", "list_evidence", false),
            ("3", "Ask human solicitor", "human_review", true),
            ("4", "Do not send", "ignore", false),
        ],
        _ => vec![
            ("1", "Show details", "show_source", false),
            ("2", "Draft next action", "draft_next_action", false),
            ("3", "Ignore", "ignore", false),
            ("4", "Remind later", "remind_later", false),
        ],
    }
    .into_iter()
    .map(|(code, label, action, requires_approval)| AllowedReply {
        code: code.to_string(),
        label: label.to_string(),
        action: action.to_string(),
        requires_approval,
    })
    .collect()
}

fn render_notification(notification: &UniversalNotification) -> String {
    let options = notification
        .allowed_replies
        .iter()
        .map(|reply| format!("{} = {}", reply.code, reply.label))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "[{}]\n{}\n\nReply options:\n{}\n\nReply: {} <option>",
        notification.short_id, notification.message, options, notification.short_id
    )
}

pub fn create_universal_notification_internal(
    channel: String,
    source_agent: String,
    source_item_id: String,
    thread_id: String,
    action_type: String,
    title: String,
    message: String,
    allowed_replies: Option<Vec<AllowedReply>>,
    expires_minutes: Option<i64>,
    requires_approval: Option<bool>,
) -> Result<UniversalNotification, String> {
    let mut notifications = read_notifications()?;
    let now = chrono::Utc::now();
    let replies = allowed_replies.unwrap_or_else(|| default_allowed_replies(&action_type));
    let notification_id = Uuid::new_v4().to_string();
    let short_id = next_short_id(&source_agent, &notifications);
    let notification = UniversalNotification {
        notification_id,
        short_id,
        channel,
        source_agent,
        source_item_id,
        thread_id,
        action_type,
        title,
        message,
        allowed_replies: replies,
        status: "pending".to_string(),
        reply_history: vec![],
        requires_approval: requires_approval.unwrap_or(true),
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
        expires_at: (now + chrono::Duration::minutes(expires_minutes.unwrap_or(1440))).to_rfc3339(),
    };
    notifications.insert(0, notification.clone());
    write_notifications(&notifications)?;

    // Mirror into the legacy channel queue so the current Channels UI and notification queue still see it.
    let _ = crate::channels::create_channel_notification(
        notification.channel.clone(),
        notification.source_agent.clone(),
        format!("{} {}", notification.short_id, notification.title),
        render_notification(&notification),
        Some(notification.requires_approval),
    );

    Ok(notification)
}

#[tauri::command]
pub fn create_universal_notification(
    channel: String,
    source_agent: String,
    source_item_id: String,
    thread_id: String,
    action_type: String,
    title: String,
    message: String,
    allowed_replies: Option<Vec<AllowedReply>>,
    expires_minutes: Option<i64>,
    requires_approval: Option<bool>,
) -> Result<UniversalNotification, String> {
    create_universal_notification_internal(
        channel,
        source_agent,
        source_item_id,
        thread_id,
        action_type,
        title,
        message,
        allowed_replies,
        expires_minutes,
        requires_approval,
    )
}

#[tauri::command]
pub fn list_universal_notifications(status: Option<String>) -> Result<Vec<UniversalNotification>, String> {
    let notifications = read_notifications()?;
    Ok(match status {
        Some(status) => notifications
            .into_iter()
            .filter(|notification| notification.status == status)
            .collect(),
        None => notifications,
    })
}

#[tauri::command]
pub fn route_inbound_reply(channel: String, raw: String) -> Result<RoutedReply, String> {
    let mut parts = raw.split_whitespace();
    let notification_key = parts
        .next()
        .ok_or_else(|| "Reply must start with notification id, e.g. H-1042 1.".to_string())?
        .trim()
        .to_string();
    let selected_code = parts
        .next()
        .ok_or_else(|| "Reply must include an option, e.g. H-1042 1.".to_string())?
        .trim()
        .to_string();

    let mut notifications = read_notifications()?;
    let notification = notifications
        .iter_mut()
        .find(|item| item.short_id.eq_ignore_ascii_case(&notification_key) || item.notification_id == notification_key)
        .ok_or_else(|| format!("Notification {} not found.", notification_key))?;

    if chrono::DateTime::parse_from_rfc3339(&notification.expires_at)
        .map(|expiry| expiry < chrono::Utc::now())
        .unwrap_or(false)
    {
        let short_id = notification.short_id.clone();
        notification.status = "expired".to_string();
        notification.updated_at = chrono::Utc::now().to_rfc3339();
        write_notifications(&notifications)?;
        return Err(format!("Notification {} has expired.", short_id));
    }

    let allowed = notification
        .allowed_replies
        .iter()
        .find(|reply| reply.code == selected_code)
        .cloned()
        .ok_or_else(|| format!("Option {} is not allowed for {}.", selected_code, notification.short_id))?;

    let routed = RoutedReply {
        id: Uuid::new_v4().to_string(),
        at: chrono::Utc::now().to_rfc3339(),
        channel,
        raw,
        notification_id: notification.notification_id.clone(),
        selected_code,
        selected_action: allowed.action.clone(),
        status: if allowed.requires_approval { "approval_selected".to_string() } else { "routed".to_string() },
        message: format!(
            "{} selected: {}. Routed to {} for {} on thread {}.",
            notification.short_id, allowed.label, notification.source_agent, notification.action_type, notification.thread_id
        ),
    };

    notification.reply_history.insert(0, routed.clone());
    notification.status = routed.status.clone();
    notification.updated_at = routed.at.clone();
    write_notifications(&notifications)?;
    Ok(routed)
}

#[tauri::command]
pub fn dispatch_notification_action(notification_id: String, selected_action: String) -> Result<serde_json::Value, String> {
    let notifications = read_notifications()?;
    let notification = notifications
        .iter()
        .find(|item| item.notification_id == notification_id || item.short_id.eq_ignore_ascii_case(&notification_id))
        .ok_or_else(|| "Notification not found.".to_string())?;

    Ok(serde_json::json!({
        "ok": true,
        "notificationId": notification.notification_id,
        "shortId": notification.short_id,
        "sourceAgent": notification.source_agent,
        "sourceItemId": notification.source_item_id,
        "threadId": notification.thread_id,
        "actionType": notification.action_type,
        "selectedAction": selected_action,
        "requiresApproval": notification.requires_approval,
        "message": "Action routed to the source agent. Execution remains approval-gated; this dispatcher records intent and context for the next agent step."
    }))
}
