use std::fs;
use std::path::PathBuf;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTaskConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub schedule: String,
    pub action: String,
    pub enabled: bool,
    pub last_run_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

static TASKS_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("scheduled_tasks");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
});

fn registry_path() -> PathBuf {
    TASKS_DIR.join("registry.json")
}

fn read_tasks() -> Result<Vec<ScheduledTaskConfig>, String> {
    let path = registry_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_tasks(tasks: &[ScheduledTaskConfig]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(tasks).map_err(|e| e.to_string())?;
    fs::write(registry_path(), json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_scheduled_tasks() -> Result<Vec<ScheduledTaskConfig>, String> {
    read_tasks()
}

#[tauri::command]
pub fn create_scheduled_task(
    name: String,
    description: String,
    schedule: String,
    action: String,
) -> Result<ScheduledTaskConfig, String> {
    let mut tasks = read_tasks()?;
    let now = chrono::Utc::now().to_rfc3339();
    let task = ScheduledTaskConfig {
        id: Uuid::new_v4().to_string(),
        name,
        description,
        schedule,
        action,
        enabled: true,
        last_run_at: None,
        created_at: now.clone(),
        updated_at: now,
    };
    tasks.push(task.clone());
    write_tasks(&tasks)?;
    Ok(task)
}

#[tauri::command]
pub fn update_scheduled_task(id: String, updates: serde_json::Value) -> Result<ScheduledTaskConfig, String> {
    let mut tasks = read_tasks()?;
    let task = tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| "Scheduled task not found".to_string())?;

    if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
        task.name = name.to_string();
    }
    if let Some(description) = updates.get("description").and_then(|v| v.as_str()) {
        task.description = description.to_string();
    }
    if let Some(schedule) = updates.get("schedule").and_then(|v| v.as_str()) {
        task.schedule = schedule.to_string();
    }
    if let Some(action) = updates.get("action").and_then(|v| v.as_str()) {
        task.action = action.to_string();
    }
    if let Some(enabled) = updates.get("enabled").and_then(|v| v.as_bool()) {
        task.enabled = enabled;
    }

    task.updated_at = chrono::Utc::now().to_rfc3339();
    let updated = task.clone();
    write_tasks(&tasks)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_scheduled_task(id: String) -> Result<(), String> {
    let mut tasks = read_tasks()?;
    tasks.retain(|t| t.id != id);
    write_tasks(&tasks)
}

#[tauri::command]
pub async fn run_scheduled_task_now(id: String) -> Result<serde_json::Value, String> {
    let mut tasks = read_tasks()?;
    let task = tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| "Scheduled task not found".to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    task.last_run_at = Some(now.clone());
    task.updated_at = now.clone();
    let task_name = task.name.clone();
    let action = task.action.clone();

    write_tasks(&tasks)?;
    let result = crate::commands::ai::chat_completion(action.clone()).await?;

    Ok(serde_json::json!({
        "ok": true,
        "id": id,
        "name": task_name,
        "executedAt": now,
        "action": action,
        "result": result
    }))
}
