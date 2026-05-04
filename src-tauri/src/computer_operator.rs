use once_cell::sync::Lazy;
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};
use std::{fs, path::PathBuf, process::Command};
use std::collections::hash_map::DefaultHasher;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorAllowlistEntry {
    pub id: String,
    pub name: String,
    pub process_hint: String,
    pub enabled: bool,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionSnapshot {
    pub id: String,
    pub at: String,
    pub image_path: String,
    pub width: i32,
    pub height: i32,
    pub source: String,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayLogEntry {
    pub id: String,
    pub at: String,
    pub action_type: String,
    pub target_app: String,
    pub approved: bool,
    pub status: String,
    pub message: String,
    pub screenshot_path: Option<String>,
    pub metadata: serde_json::Value,
}

static OPERATOR_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("computer_operator");
    let _ = fs::create_dir_all(path.join("screenshots"));
    path
});

fn allowlist_path() -> PathBuf {
    OPERATOR_DIR.join("allowlist.json")
}

fn replay_path() -> PathBuf {
    OPERATOR_DIR.join("replay_log.json")
}

fn default_allowlist() -> Vec<OperatorAllowlistEntry> {
    vec![
        ("browser", "Browser", "chrome|msedge|firefox|browser", true, "Approved for safe browsing/navigation. Sending forms still needs approval."),
        ("outlook", "Classic Outlook", "outlook", true, "Approved for observe/read workflows. Sending/deleting/archiving needs approval."),
        ("explorer", "File Explorer", "explorer", true, "Approved for observe/open folders. Delete/move/write needs approval."),
        ("notepad", "Notepad", "notepad", true, "Approved for safe typing tests and draft text."),
        ("terminal", "Terminal / PowerShell", "powershell|pwsh|windows terminal|cmd", false, "Disabled by default. Commands require explicit approval."),
        ("codex", "Genz Silva OS / Codex", "genz-silva-os|codex|tauri", true, "Approved for controlling this app UI."),
    ]
    .into_iter()
    .map(|(id, name, process_hint, enabled, notes)| OperatorAllowlistEntry {
        id: id.to_string(),
        name: name.to_string(),
        process_hint: process_hint.to_string(),
        enabled,
        notes: notes.to_string(),
    })
    .collect()
}

fn read_allowlist() -> Result<Vec<OperatorAllowlistEntry>, String> {
    let path = allowlist_path();
    if !path.exists() {
        let list = default_allowlist();
        write_allowlist(&list)?;
        return Ok(list);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_allowlist(list: &[OperatorAllowlistEntry]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(allowlist_path(), json).map_err(|e| e.to_string())
}

fn read_replay_log() -> Result<Vec<ReplayLogEntry>, String> {
    let path = replay_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn append_replay(entry: ReplayLogEntry) -> Result<ReplayLogEntry, String> {
    let mut entries = read_replay_log()?;
    entries.insert(0, entry.clone());
    entries.truncate(250);
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(replay_path(), json).map_err(|e| e.to_string())?;
    Ok(entry)
}

fn is_target_allowed(target_app: &str) -> Result<bool, String> {
    let target = target_app.to_ascii_lowercase();
    Ok(read_allowlist()?.into_iter().any(|entry| {
        entry.enabled
            && (entry.id.eq_ignore_ascii_case(&target)
                || entry.name.to_ascii_lowercase().contains(&target)
                || entry
                    .process_hint
                    .split('|')
                    .any(|hint| !hint.is_empty() && target.contains(hint)))
    }))
}

fn run_powershell(script: &str) -> Result<String, String> {
    if !cfg!(target_os = "windows") {
        return Err("Computer operator v2 currently supports Windows only.".to_string());
    }
    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-STA")
        .arg("-Command")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "PowerShell operator bridge failed.".to_string()
        } else {
            stderr
        });
    }
    Ok(stdout)
}

fn file_hash(path: &PathBuf) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    Ok(format!("{:016x}", hasher.finish()))
}

#[tauri::command]
pub fn capture_screen_screenshot() -> Result<VisionSnapshot, String> {
    let permission = crate::permissions::evaluate_permission("observe".to_string())?;
    if permission.approval_required {
        return Err(format!(
            "Screenshot capture requires approval: {}",
            permission.reason
        ));
    }

    let id = Uuid::new_v4().to_string();
    let path = OPERATOR_DIR
        .join("screenshots")
        .join(format!("screen_{}.png", id));
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.first().ok_or_else(|| "No screen detected for native screenshot capture.".to_string())?;
    let image = screen.capture().map_err(|e| e.to_string())?;
    image.save(&path).map_err(|e| e.to_string())?;
    let hash = file_hash(&path)?;
    let snapshot = VisionSnapshot {
        id,
        at: chrono::Utc::now().to_rfc3339(),
        image_path: path.to_string_lossy().to_string(),
        width: image.width() as i32,
        height: image.height() as i32,
        source: "native_screenshots_crate".to_string(),
        hash: hash.clone(),
    };
    append_replay(ReplayLogEntry {
        id: Uuid::new_v4().to_string(),
        at: snapshot.at.clone(),
        action_type: "screenshot".to_string(),
        target_app: "screen".to_string(),
        approved: true,
        status: "complete".to_string(),
        message: "Captured current screen screenshot with native Rust screenshots crate.".to_string(),
        screenshot_path: Some(snapshot.image_path.clone()),
        metadata: serde_json::json!({
            "width": snapshot.width,
            "height": snapshot.height,
            "hash": hash,
            "source": snapshot.source,
            "permission": {
                "action": permission.action,
                "risk": permission.risk,
                "approvalRequired": permission.approval_required
            }
        }),
    })?;
    Ok(snapshot)
}

#[tauri::command]
pub fn detect_screen_text(snapshot_path: String) -> Result<serde_json::Value, String> {
    let entry = ReplayLogEntry {
        id: Uuid::new_v4().to_string(),
        at: chrono::Utc::now().to_rfc3339(),
        action_type: "ocr".to_string(),
        target_app: "screen".to_string(),
        approved: true,
        status: "pending_engine".to_string(),
        message: "OCR engine is not wired yet. Screenshot is saved for future Windows OCR/Tesseract processing.".to_string(),
        screenshot_path: Some(snapshot_path.clone()),
        metadata: serde_json::json!({ "snapshotPath": snapshot_path }),
    };
    append_replay(entry.clone())?;
    Ok(serde_json::json!({
        "ok": false,
        "status": entry.status,
        "textBlocks": [],
        "controls": [],
        "message": entry.message
    }))
}

#[tauri::command]
pub fn list_operator_allowlist() -> Result<Vec<OperatorAllowlistEntry>, String> {
    read_allowlist()
}

#[tauri::command]
pub fn update_operator_allowlist(id: String, enabled: bool) -> Result<OperatorAllowlistEntry, String> {
    let mut list = read_allowlist()?;
    let entry = list
        .iter_mut()
        .find(|entry| entry.id == id)
        .ok_or_else(|| "Allowlist entry not found.".to_string())?;
    entry.enabled = enabled;
    let updated = entry.clone();
    write_allowlist(&list)?;
    Ok(updated)
}

#[tauri::command]
pub fn perform_ui_action(
    action_type: String,
    target_app: String,
    x: Option<i32>,
    y: Option<i32>,
    text: Option<String>,
    hotkey: Option<String>,
    approved: bool,
    screenshot_path: Option<String>,
) -> Result<ReplayLogEntry, String> {
    let action = action_type.to_ascii_lowercase();
    let metadata = serde_json::json!({ "x": x, "y": y, "text": text.clone(), "hotkey": hotkey.clone() });
    let allowed = is_target_allowed(&target_app)?;
    if !allowed {
        let entry = ReplayLogEntry {
            id: Uuid::new_v4().to_string(),
            at: chrono::Utc::now().to_rfc3339(),
            action_type,
            target_app,
            approved,
            status: "blocked_not_allowlisted".to_string(),
            message: "Target app is not enabled in the operator allowlist.".to_string(),
            screenshot_path,
            metadata,
        };
        return append_replay(entry);
    }
    if !approved {
        let entry = ReplayLogEntry {
            id: Uuid::new_v4().to_string(),
            at: chrono::Utc::now().to_rfc3339(),
            action_type,
            target_app,
            approved,
            status: "needs_approval".to_string(),
            message: "UI action prepared but not executed. Approval is required before click/type/hotkey/scroll/drag.".to_string(),
            screenshot_path,
            metadata,
        };
        return append_replay(entry);
    }

    let script = match action.as_str() {
        "click" => {
            let x = x.ok_or_else(|| "Click requires x.".to_string())?;
            let y = y.ok_or_else(|| "Click requires y.".to_string())?;
            format!(
                r#"
$sig = '[DllImport("user32.dll")] public static extern bool SetCursorPos(int X,int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);'
Add-Type -MemberDefinition $sig -Name NativeMouse -Namespace GSOS
[GSOS.NativeMouse]::SetCursorPos({x},{y}) | Out-Null
[GSOS.NativeMouse]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
[GSOS.NativeMouse]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
"#
            )
        }
        "type" => {
            let text = text.clone().unwrap_or_default().replace('\'', "''");
            format!(
                r#"
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('{text}')
"#
            )
        }
        "hotkey" => {
            let hotkey = hotkey.clone().unwrap_or_default().replace('\'', "''");
            format!(
                r#"
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('{hotkey}')
"#
            )
        }
        "scroll" | "drag" => {
            let entry = ReplayLogEntry {
                id: Uuid::new_v4().to_string(),
                at: chrono::Utc::now().to_rfc3339(),
                action_type,
                target_app,
                approved,
                status: "pending_implementation".to_string(),
                message: "This UI action type is logged but not implemented in v2 yet.".to_string(),
                screenshot_path,
                metadata,
            };
            return append_replay(entry);
        }
        _ => return Err("Unsupported UI action. Use click, type, hotkey, scroll, or drag.".to_string()),
    };

    let result = run_powershell(&script);
    let (status, message) = match result {
        Ok(_) => ("complete".to_string(), "Approved UI action executed and logged.".to_string()),
        Err(error) => ("error".to_string(), error),
    };
    append_replay(ReplayLogEntry {
        id: Uuid::new_v4().to_string(),
        at: chrono::Utc::now().to_rfc3339(),
        action_type,
        target_app,
        approved,
        status,
        message,
        screenshot_path,
        metadata,
    })
}

#[tauri::command]
pub fn list_operator_replay_log() -> Result<Vec<ReplayLogEntry>, String> {
    read_replay_log()
}
