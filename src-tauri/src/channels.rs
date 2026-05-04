use std::fs;
use std::path::PathBuf;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sysinfo::System;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelConfig {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub inbound: bool,
    pub outbound: bool,
    pub command_prefix: String,
    pub rate_limit_per_minute: u32,
    pub offline_message: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelDiagnostics {
    pub id: String,
    pub ok: bool,
    pub installed: bool,
    pub running: bool,
    pub status: String,
    pub detail: String,
    pub process_names: Vec<String>,
    pub detected_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelNotification {
    pub id: String,
    pub channel: String,
    pub agent_id: String,
    pub title: String,
    pub message: String,
    pub status: String,
    pub response: String,
    pub requires_approval: bool,
    pub created_at: String,
    pub updated_at: String,
}

static CHANNELS_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("channels");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
});

fn default_channels() -> Vec<ChannelConfig> {
    let now = chrono::Utc::now().to_rfc3339();
    vec![
        ChannelConfig {
            id: "discord-default".to_string(),
            name: "Discord".to_string(),
            kind: "discord".to_string(),
            enabled: false,
            inbound: true,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 30,
            offline_message: "Discord agent is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "slack-default".to_string(),
            name: "Slack".to_string(),
            kind: "slack".to_string(),
            enabled: false,
            inbound: true,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 30,
            offline_message: "Slack channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "teams-default".to_string(),
            name: "Microsoft Teams".to_string(),
            kind: "teams".to_string(),
            enabled: false,
            inbound: true,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 30,
            offline_message: "Teams channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "telegram-default".to_string(),
            name: "Telegram".to_string(),
            kind: "telegram".to_string(),
            enabled: false,
            inbound: true,
            outbound: true,
            command_prefix: "/gsos".to_string(),
            rate_limit_per_minute: 30,
            offline_message: "Telegram channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "line-default".to_string(),
            name: "LINE".to_string(),
            kind: "line".to_string(),
            enabled: false,
            inbound: true,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 30,
            offline_message: "LINE channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "sms-default".to_string(),
            name: "SMS / Twilio".to_string(),
            kind: "sms".to_string(),
            enabled: false,
            inbound: false,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 10,
            offline_message: "SMS channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "webhook-default".to_string(),
            name: "Webhook Listener".to_string(),
            kind: "webhook".to_string(),
            enabled: false,
            inbound: true,
            outbound: false,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 60,
            offline_message: "Webhook listener is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "whatsapp-default".to_string(),
            name: "WhatsApp Desktop".to_string(),
            kind: "whatsapp".to_string(),
            enabled: false,
            inbound: false,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 20,
            offline_message: "WhatsApp channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "phonelink-default".to_string(),
            name: "Windows Phone Link".to_string(),
            kind: "phone-link".to_string(),
            enabled: false,
            inbound: true,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 20,
            offline_message: "Phone Link channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "outlook-classic-default".to_string(),
            name: "Classic Outlook Desktop".to_string(),
            kind: "outlook".to_string(),
            enabled: false,
            inbound: true,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 15,
            offline_message: "Outlook desktop channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "gmail-default".to_string(),
            name: "Gmail".to_string(),
            kind: "gmail".to_string(),
            enabled: false,
            inbound: true,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 15,
            offline_message: "Gmail channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ChannelConfig {
            id: "email-default".to_string(),
            name: "Email Inbox".to_string(),
            kind: "email".to_string(),
            enabled: false,
            inbound: true,
            outbound: true,
            command_prefix: "!gsos".to_string(),
            rate_limit_per_minute: 15,
            offline_message: "Email channel is currently offline.".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
    ]
}

fn registry_path() -> PathBuf {
    CHANNELS_DIR.join("registry.json")
}

fn notifications_path() -> PathBuf {
    CHANNELS_DIR.join("notifications.json")
}

fn read_channels() -> Result<Vec<ChannelConfig>, String> {
    let path = registry_path();
    if !path.exists() {
        let defaults = default_channels();
        write_channels(&defaults)?;
        return Ok(defaults);
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut channels: Vec<ChannelConfig> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if channels.is_empty() {
        let defaults = default_channels();
        write_channels(&defaults)?;
        return Ok(defaults);
    }
    let mut changed = false;
    for default_channel in default_channels() {
        if !channels.iter().any(|channel| channel.id == default_channel.id) {
            channels.push(default_channel);
            changed = true;
        }
    }
    if changed {
        write_channels(&channels)?;
    }
    Ok(channels)
}

fn write_channels(channels: &[ChannelConfig]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(channels).map_err(|e| e.to_string())?;
    fs::write(registry_path(), json).map_err(|e| e.to_string())
}

fn read_notifications() -> Result<Vec<ChannelNotification>, String> {
    let path = notifications_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_notifications(notifications: &[ChannelNotification]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(notifications).map_err(|e| e.to_string())?;
    fs::write(notifications_path(), json).map_err(|e| e.to_string())
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).map(PathBuf::from)
}

fn existing_paths(candidates: &[PathBuf]) -> Vec<String> {
    candidates
        .iter()
        .filter(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

fn scan_dir_for_names(base: Option<PathBuf>, names: &[&str], max_depth: usize) -> Vec<String> {
    let Some(base) = base else {
        return vec![];
    };
    if !base.exists() {
        return vec![];
    }

    walkdir::WalkDir::new(base)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| {
            let file_name = entry.file_name().to_string_lossy().to_lowercase();
            names.iter().any(|name| file_name.contains(&name.to_lowercase()))
        })
        .take(12)
        .map(|entry| entry.path().to_string_lossy().to_string())
        .collect()
}

fn process_matches(patterns: &[&str]) -> (bool, Vec<String>, Vec<String>) {
    let mut system = System::new_all();
    system.refresh_all();

    let patterns: Vec<String> = patterns.iter().map(|pattern| pattern.to_lowercase()).collect();
    let mut names = Vec::new();
    let mut paths = Vec::new();

    for process in system.processes().values() {
        let name = process.name().to_string_lossy().to_string();
        let name_lower = name.to_lowercase();
        let path = process
            .exe()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        let path_lower = path.to_lowercase();

        if patterns
            .iter()
            .any(|pattern| name_lower.contains(pattern) || path_lower.contains(pattern))
        {
            names.push(name);
            if !path.is_empty() {
                paths.push(path);
            }
        }
    }

    names.sort();
    names.dedup();
    paths.sort();
    paths.dedup();
    (!names.is_empty(), names, paths)
}

fn channel_diagnostics(channel: &ChannelConfig) -> ChannelDiagnostics {
    let mut detected_paths = Vec::new();
    let (installed, running, status, detail, process_names, process_paths) = match channel.kind.as_str() {
        "whatsapp" => {
            let (running, names, process_paths) = process_matches(&["whatsapp"]);
            let mut paths = existing_paths(&[
                env_path("LOCALAPPDATA")
                    .unwrap_or_default()
                    .join("Microsoft")
                    .join("WindowsApps")
                    .join("WhatsApp.exe"),
            ]);
            paths.extend(scan_dir_for_names(
                env_path("APPDATA").map(|path| path.join("Microsoft").join("Windows").join("Start Menu").join("Programs")),
                &["whatsapp"],
                4,
            ));
            paths.extend(process_paths.clone());
            paths.sort();
            paths.dedup();
            let installed = !paths.is_empty() || running;
            let detail = if running {
                "WhatsApp Desktop is running on this Windows session.".to_string()
            } else if installed {
                "WhatsApp Desktop appears installed, but it is not currently running.".to_string()
            } else {
                "WhatsApp Desktop was not detected. Install/open WhatsApp from Microsoft Store, then refresh.".to_string()
            };
            (installed, running, if running { "connected" } else if installed { "installed" } else { "missing" }.to_string(), detail, names, paths)
        }
        "email" | "outlook" => {
            let (running, names, process_paths) = process_matches(&["outlook", "olk", "hxoutlook"]);
            let mut paths = existing_paths(&[
                env_path("ProgramFiles")
                    .unwrap_or_default()
                    .join("Microsoft Office")
                    .join("root")
                    .join("Office16")
                    .join("OUTLOOK.EXE"),
                env_path("ProgramFiles(x86)")
                    .unwrap_or_default()
                    .join("Microsoft Office")
                    .join("root")
                    .join("Office16")
                    .join("OUTLOOK.EXE"),
            ]);
            paths.extend(scan_dir_for_names(
                env_path("APPDATA").map(|path| path.join("Microsoft").join("Windows").join("Start Menu").join("Programs")),
                &["outlook"],
                5,
            ));
            paths.extend(process_paths.clone());
            paths.sort();
            paths.dedup();
            let installed = !paths.is_empty() || running;
            let classic = names
                .iter()
                .any(|name| name.eq_ignore_ascii_case("OUTLOOK") || name.eq_ignore_ascii_case("OUTLOOK.EXE"))
                || paths.iter().any(|path| path.to_lowercase().contains("office16"));
            let flavour = if classic { "classic Outlook" } else { "Outlook for Windows" };
            let detail = if running {
                format!("{flavour} is running on this Windows session.")
            } else if installed {
                format!("{flavour} appears installed, but it is not currently running.")
            } else {
                "Outlook was not detected. Open classic Outlook or Outlook for Windows, then refresh.".to_string()
            };
            (installed, running, if running { "connected" } else if installed { "installed" } else { "missing" }.to_string(), detail, names, paths)
        }
        "phone-link" => {
            let (running, names, process_paths) = process_matches(&["phoneexperiencehost", "yourphone"]);
            let mut paths = scan_dir_for_names(
                env_path("APPDATA").map(|path| path.join("Microsoft").join("Windows").join("Start Menu").join("Programs")),
                &["phone link", "your phone"],
                5,
            );
            paths.extend(process_paths.clone());
            paths.sort();
            paths.dedup();
            let installed = !paths.is_empty() || running;
            let detail = if running {
                "Windows Phone Link is running on this Windows session.".to_string()
            } else if installed {
                "Windows Phone Link appears installed, but it is not currently running.".to_string()
            } else {
                "Windows Phone Link was not detected. Install/open Phone Link, then refresh.".to_string()
            };
            (installed, running, if running { "connected" } else if installed { "installed" } else { "missing" }.to_string(), detail, names, paths)
        }
        "teams" => {
            let (running, names, process_paths) = process_matches(&["teams", "msteams"]);
            let mut paths = scan_dir_for_names(
                env_path("APPDATA").map(|path| path.join("Microsoft").join("Windows").join("Start Menu").join("Programs")),
                &["teams"],
                5,
            );
            paths.extend(process_paths.clone());
            paths.sort();
            paths.dedup();
            let installed = !paths.is_empty() || running;
            let detail = if running {
                "Microsoft Teams is running. Bot/app authorization is still required before real inbound/outbound messaging.".to_string()
            } else if installed {
                "Microsoft Teams appears installed, but it is not currently running. Bot/app authorization is still required.".to_string()
            } else {
                "Microsoft Teams was not detected. Install/open Teams and configure a bot/app token for real messaging.".to_string()
            };
            (installed, running, if running { "desktop_detected" } else if installed { "installed" } else { "setup_required" }.to_string(), detail, names, paths)
        }
        _ => {
            let detail = if channel.enabled {
                "This channel is enabled in the router catalog. Real send/receive requires its API token, OAuth, webhook, or desktop bridge.".to_string()
            } else {
                "Available in the router catalog. Enable after adding its API token, OAuth, webhook, or desktop bridge.".to_string()
            };
            (channel.enabled, channel.enabled, if channel.enabled { "setup_required" } else { "available" }.to_string(), detail, vec![], vec![])
        }
    };

    detected_paths.extend(process_paths);
    detected_paths.sort();
    detected_paths.dedup();

    ChannelDiagnostics {
        id: channel.id.clone(),
        ok: channel.enabled && running,
        installed,
        running,
        status,
        detail,
        process_names,
        detected_paths,
    }
}

#[tauri::command]
pub fn list_channels() -> Result<Vec<ChannelConfig>, String> {
    read_channels()
}

#[tauri::command]
pub fn restore_default_channels() -> Result<Vec<ChannelConfig>, String> {
    let mut channels = read_channels()?;
    let mut changed = false;
    for default_channel in default_channels() {
        if !channels.iter().any(|channel| channel.id == default_channel.id) {
            channels.push(default_channel);
            changed = true;
        }
    }
    if changed {
        write_channels(&channels)?;
    }
    Ok(channels)
}

#[tauri::command]
pub fn check_channel_connections() -> Result<Vec<ChannelDiagnostics>, String> {
    let channels = read_channels()?;
    Ok(channels.iter().map(channel_diagnostics).collect())
}

#[tauri::command]
pub fn create_channel_notification(
    channel: String,
    agent_id: String,
    title: String,
    message: String,
    requires_approval: Option<bool>,
) -> Result<ChannelNotification, String> {
    let mut notifications = read_notifications()?;
    let now = chrono::Utc::now().to_rfc3339();
    let notification = ChannelNotification {
        id: Uuid::new_v4().to_string(),
        channel,
        agent_id,
        title,
        message,
        status: "queued".to_string(),
        response: String::new(),
        requires_approval: requires_approval.unwrap_or(true),
        created_at: now.clone(),
        updated_at: now,
    };
    notifications.insert(0, notification.clone());
    write_notifications(&notifications)?;
    Ok(notification)
}

#[tauri::command]
pub fn list_channel_notifications(channel: Option<String>) -> Result<Vec<ChannelNotification>, String> {
    let notifications = read_notifications()?;
    Ok(match channel {
        Some(channel) => notifications
            .into_iter()
            .filter(|notification| notification.channel == channel)
            .collect(),
        None => notifications,
    })
}

#[tauri::command]
pub fn respond_channel_notification(id: String, response: String) -> Result<ChannelNotification, String> {
    let mut notifications = read_notifications()?;
    let notification = notifications
        .iter_mut()
        .find(|notification| notification.id == id)
        .ok_or_else(|| "Notification not found".to_string())?;
    notification.response = response;
    notification.status = "responded".to_string();
    notification.updated_at = chrono::Utc::now().to_rfc3339();
    let updated = notification.clone();
    write_notifications(&notifications)?;
    Ok(updated)
}

#[tauri::command]
pub fn create_channel(
    name: String,
    kind: String,
    inbound: bool,
    outbound: bool,
    command_prefix: Option<String>,
) -> Result<ChannelConfig, String> {
    let mut channels = read_channels()?;
    let now = chrono::Utc::now().to_rfc3339();
    let channel = ChannelConfig {
        id: Uuid::new_v4().to_string(),
        name,
        kind,
        enabled: true,
        inbound,
        outbound,
        command_prefix: command_prefix.unwrap_or_else(|| "!gsos".to_string()),
        rate_limit_per_minute: 30,
        offline_message: "Agent is currently offline.".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    channels.push(channel.clone());
    write_channels(&channels)?;
    Ok(channel)
}

#[tauri::command]
pub fn update_channel(id: String, updates: serde_json::Value) -> Result<ChannelConfig, String> {
    let mut channels = read_channels()?;
    let channel = channels
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| "Channel not found".to_string())?;

    if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
        channel.name = name.to_string();
    }
    if let Some(enabled) = updates.get("enabled").and_then(|v| v.as_bool()) {
        channel.enabled = enabled;
    }
    if let Some(prefix) = updates.get("commandPrefix").and_then(|v| v.as_str()) {
        channel.command_prefix = prefix.to_string();
    }
    if let Some(limit) = updates.get("rateLimitPerMinute").and_then(|v| v.as_u64()) {
        channel.rate_limit_per_minute = limit as u32;
    }
    if let Some(message) = updates.get("offlineMessage").and_then(|v| v.as_str()) {
        channel.offline_message = message.to_string();
    }

    channel.updated_at = chrono::Utc::now().to_rfc3339();
    let updated = channel.clone();
    write_channels(&channels)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_channel(id: String) -> Result<(), String> {
    let mut channels = read_channels()?;
    channels.retain(|c| c.id != id);
    write_channels(&channels)
}

#[tauri::command]
pub fn test_channel(id: String) -> Result<serde_json::Value, String> {
    let channels = read_channels()?;
    let channel = channels
        .iter()
        .find(|c| c.id == id)
        .ok_or_else(|| "Channel not found".to_string())?;

    let diagnostics = channel_diagnostics(channel);
    Ok(serde_json::json!({
        "ok": diagnostics.ok,
        "id": channel.id,
        "name": channel.name,
        "installed": diagnostics.installed,
        "running": diagnostics.running,
        "status": diagnostics.status,
        "processNames": diagnostics.process_names,
        "detectedPaths": diagnostics.detected_paths,
        "message": if !channel.enabled {
            format!("{} is disabled. Enable it after the desktop app is detected.", channel.name)
        } else {
            diagnostics.detail
        }
    }))
}

