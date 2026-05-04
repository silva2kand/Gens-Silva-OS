use std::fs;
use std::path::PathBuf;

use once_cell::sync::Lazy;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillValidation {
    pub ok: bool,
    pub issues: Vec<String>,
    pub warnings: Vec<String>,
    pub has_skill_md: bool,
    pub has_description: bool,
    pub has_instructions: bool,
    pub has_scripts_dir: bool,
    pub has_references_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRunLog {
    pub id: String,
    pub skill_id: String,
    pub input: String,
    pub output: String,
    pub ok: bool,
    pub error: String,
    pub created_at: String,
}

static SKILLS_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("skills");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
});

fn sanitize_name(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if ch == ' ' || ch == '-' || ch == '_' {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "skill".to_string()
    } else {
        trimmed
    }
}

fn skill_markdown(name: &str, description: &str, instructions: &str) -> String {
    format!(
        "# {name}\n\n## Description\n{description}\n\n## Instructions\n{instructions}\n\n## Resources\n- Add scripts in `scripts/`\n- Add references in `references/`\n"
    )
}

fn skill_dir(id: &str) -> PathBuf {
    SKILLS_DIR.join(id)
}

fn skill_file(id: &str) -> PathBuf {
    skill_dir(id).join("SKILL.md")
}

fn skill_logs_path(id: &str) -> PathBuf {
    skill_dir(id).join("logs.json")
}

fn read_skill_logs(id: &str) -> Result<Vec<SkillRunLog>, String> {
    let path = skill_logs_path(id);
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_skill_logs(id: &str, logs: &[SkillRunLog]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(logs).map_err(|e| e.to_string())?;
    fs::write(skill_logs_path(id), json).map_err(|e| e.to_string())
}

fn validate_skill_dir(id: &str) -> SkillValidation {
    let dir = skill_dir(id);
    let skill_md = skill_file(id);
    let content = fs::read_to_string(&skill_md).unwrap_or_default();
    let has_skill_md = skill_md.exists();
    let has_description = content.contains("## Description") && !content
        .lines()
        .skip_while(|line| !line.starts_with("## Description"))
        .skip(1)
        .take_while(|line| !line.starts_with("## "))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .is_empty();
    let has_instructions = content.contains("## Instructions") && !content
        .lines()
        .skip_while(|line| !line.starts_with("## Instructions"))
        .skip(1)
        .take_while(|line| !line.starts_with("## "))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .is_empty();
    let has_scripts_dir = dir.join("scripts").is_dir();
    let has_references_dir = dir.join("references").is_dir();

    let mut issues = Vec::new();
    let mut warnings = Vec::new();
    if !has_skill_md {
        issues.push("Missing SKILL.md".to_string());
    }
    if !has_description {
        issues.push("Missing non-empty ## Description section".to_string());
    }
    if !has_instructions {
        issues.push("Missing non-empty ## Instructions section".to_string());
    }
    if !has_scripts_dir {
        warnings.push("Missing scripts/ directory".to_string());
    }
    if !has_references_dir {
        warnings.push("Missing references/ directory".to_string());
    }

    SkillValidation {
        ok: issues.is_empty(),
        issues,
        warnings,
        has_skill_md,
        has_description,
        has_instructions,
        has_scripts_dir,
        has_references_dir,
    }
}

#[tauri::command]
pub fn list_skills() -> Result<Vec<serde_json::Value>, String> {
    let mut items = Vec::new();
    let entries = fs::read_dir(&*SKILLS_DIR).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        let skill_file = path.join("SKILL.md");
        if !skill_file.exists() {
            continue;
        }

        let content = fs::read_to_string(&skill_file).unwrap_or_default();
        let mut lines = content.lines();
        let title = lines
            .next()
            .unwrap_or("# Skill")
            .trim_start_matches('#')
            .trim()
            .to_string();
        let description = content
            .lines()
            .skip_while(|l| !l.starts_with("## Description"))
            .nth(1)
            .unwrap_or("")
            .trim()
            .to_string();

        let validation = validate_skill_dir(&id);
        items.push(serde_json::json!({
            "id": id,
            "name": if title.is_empty() { "Skill" } else { &title },
            "description": if description.is_empty() { "No description" } else { &description },
            "path": skill_file.to_string_lossy(),
            "validation": validation
        }));
    }

    Ok(items)
}

#[tauri::command]
pub fn create_skill(name: String, description: String, instructions: String) -> Result<serde_json::Value, String> {
    let base_slug = sanitize_name(&name);
    let id = format!("{}-{}", base_slug, &Uuid::new_v4().to_string()[..8]);
    let skill_dir = SKILLS_DIR.join(&id);
    fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(skill_dir.join("scripts")).map_err(|e| e.to_string())?;
    fs::create_dir_all(skill_dir.join("references")).map_err(|e| e.to_string())?;

    let content = skill_markdown(&name, &description, &instructions);
    let file_path = skill_dir.join("SKILL.md");
    fs::write(&file_path, content).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "id": id,
        "name": name,
        "description": description,
        "path": file_path.to_string_lossy()
    }))
}

#[tauri::command]
pub fn get_skill_content(id: String) -> Result<String, String> {
    fs::read_to_string(skill_file(&id)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_skill_content(id: String, content: String) -> Result<(), String> {
    fs::write(skill_file(&id), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn validate_skill(id: String) -> Result<SkillValidation, String> {
    if !skill_dir(&id).exists() {
        return Err("Skill not found".to_string());
    }
    Ok(validate_skill_dir(&id))
}

#[tauri::command]
pub fn list_skill_logs(id: String) -> Result<Vec<SkillRunLog>, String> {
    read_skill_logs(&id)
}

#[tauri::command]
pub async fn run_skill(id: String, input: String) -> Result<serde_json::Value, String> {
    if !skill_dir(&id).exists() {
        return Err("Skill not found".to_string());
    }
    let validation = validate_skill_dir(&id);
    if !validation.ok {
        return Ok(serde_json::json!({
            "ok": false,
            "error": "Skill validation failed",
            "validation": validation
        }));
    }
    let content = fs::read_to_string(skill_file(&id)).map_err(|e| e.to_string())?;
    let prompt = format!(
        "You are executing a local Genz Silva OS skill. Follow the skill exactly, use only capabilities available through the app/tools, and ask for approval before external sends/submissions, deletes, installs, credential handling, or sensitive-data transmission.\n\nSKILL.md:\n{}\n\nUser input:\n{}\n\nReturn a clear result, next actions, and any missing setup.",
        content,
        input
    );
    let created_at = chrono::Utc::now().to_rfc3339();
    let run_id = Uuid::new_v4().to_string();
    let result = crate::commands::ai::chat_completion(prompt).await;
    let (ok, output, error) = match result {
        Ok(output) => (true, output, String::new()),
        Err(error) => (false, String::new(), error),
    };

    let mut logs = read_skill_logs(&id)?;
    logs.insert(0, SkillRunLog {
        id: run_id.clone(),
        skill_id: id.clone(),
        input,
        output: output.clone(),
        ok,
        error: error.clone(),
        created_at: created_at.clone(),
    });
    logs.truncate(50);
    write_skill_logs(&id, &logs)?;

    Ok(serde_json::json!({
        "ok": ok,
        "id": run_id,
        "skillId": id,
        "output": output,
        "error": error,
        "createdAt": created_at
    }))
}
