use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::Emitter;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTimelineEvent {
    pub id: String,
    pub at: String,
    pub run_id: String,
    pub event_type: String,
    pub source: String,
    pub agent: String,
    pub title: String,
    pub text: String,
    pub status: String,
    pub safe_to_speak: bool,
    pub requires_approval: bool,
    pub metadata: serde_json::Value,
}

static TIMELINE_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("run_timeline");
    let _ = fs::create_dir_all(&path);
    path
});

fn timeline_path() -> PathBuf {
    TIMELINE_DIR.join("events.json")
}

fn read_events() -> Result<Vec<RunTimelineEvent>, String> {
    let path = timeline_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_events(events: &[RunTimelineEvent]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(events).map_err(|e| e.to_string())?;
    fs::write(timeline_path(), json).map_err(|e| e.to_string())
}

fn safe_to_speak(text: &str) -> bool {
    let lower = text.to_lowercase();
    !lower.contains("password")
        && !lower.contains("api key")
        && !lower.contains("secret")
        && !lower.contains("token")
        && !lower.contains("private key")
        && !lower.contains("full email body")
        && !lower.contains("card number")
        && !lower.contains("sort code")
}

pub fn record_timeline_event(
    app_handle: Option<&tauri::AppHandle>,
    run_id: String,
    event_type: String,
    source: String,
    agent: String,
    title: String,
    text: String,
    status: String,
    requires_approval: bool,
    metadata: serde_json::Value,
) -> Result<RunTimelineEvent, String> {
    let event = RunTimelineEvent {
        id: Uuid::new_v4().to_string(),
        at: chrono::Utc::now().to_rfc3339(),
        run_id,
        event_type,
        source,
        agent,
        title,
        safe_to_speak: safe_to_speak(&text),
        text,
        status,
        requires_approval,
        metadata,
    };

    let mut events = read_events()?;
    events.insert(0, event.clone());
    events.truncate(300);
    write_events(&events)?;
    if let Some(app_handle) = app_handle {
        let _ = app_handle.emit("unified_run_timeline_event", event.clone());
    }
    Ok(event)
}

#[tauri::command]
pub fn add_run_timeline_event(
    run_id: String,
    event_type: String,
    source: String,
    agent: String,
    title: String,
    text: String,
    status: String,
    requires_approval: Option<bool>,
    metadata: Option<serde_json::Value>,
) -> Result<RunTimelineEvent, String> {
    record_timeline_event(
        None,
        run_id,
        event_type,
        source,
        agent,
        title,
        text,
        status,
        requires_approval.unwrap_or(false),
        metadata.unwrap_or_else(|| serde_json::json!({})),
    )
}

#[tauri::command]
pub fn list_run_timeline(limit: Option<usize>) -> Result<Vec<RunTimelineEvent>, String> {
    let mut events = read_events()?;
    events.truncate(limit.unwrap_or(60).clamp(1, 300));
    Ok(events)
}
