use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRule {
    pub action: String,
    pub risk: String,
    pub approval_required: bool,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDecision {
    pub action: String,
    pub risk: String,
    pub approval_required: bool,
    pub allowed_without_approval: bool,
    pub reason: String,
}

fn rules() -> Vec<PermissionRule> {
    vec![
        ("read", "local_read", false, "Read local app data, files selected by the user, inbox metadata, and knowledge context."),
        ("observe", "screen_observe", false, "Capture screenshots or inspect visible app state for audit, OCR, and replay without clicking or typing."),
        ("write", "local_write", true, "Create or update files, drafts, labels, local records, memories, or task state."),
        ("send", "external_send", true, "Send email, WhatsApp, SMS, social posts, legal/court messages, forms, or any external communication."),
        ("delete", "destructive", true, "Delete, archive, move, overwrite, or permanently alter files, emails, records, models, or connector data."),
        ("install", "install", true, "Install packages, models, tools, browser extensions, services, or system components."),
        ("terminal", "local_command", true, "Run local terminal commands or scripts."),
        ("web", "web_read", false, "Read public web pages and search results without submitting private information."),
        ("credential", "credential", true, "Handle OAuth tokens, API keys, secrets, identity documents, or sensitive authentication data."),
        ("legal_submit", "regulated_submit", true, "Submit legal, court, visa, tax, accounting, finance, or regulated professional communications."),
    ]
    .into_iter()
    .map(|(action, risk, approval_required, description)| PermissionRule {
        action: action.to_string(),
        risk: risk.to_string(),
        approval_required,
        description: description.to_string(),
    })
    .collect()
}

#[tauri::command]
pub fn list_permission_rules() -> Result<Vec<PermissionRule>, String> {
    Ok(rules())
}

#[tauri::command]
pub fn evaluate_permission(action: String) -> Result<PermissionDecision, String> {
    let normalized = action.trim().to_lowercase();
    let rule = rules()
        .into_iter()
        .find(|rule| {
            normalized == rule.action
                || normalized == rule.risk
                || normalized.contains(&rule.action)
                || normalized.contains(&rule.risk)
        })
        .unwrap_or(PermissionRule {
            action: action.clone(),
            risk: "unknown".to_string(),
            approval_required: true,
            description: "Unknown actions default to approval required.".to_string(),
        });

    Ok(PermissionDecision {
        action,
        risk: rule.risk.clone(),
        approval_required: rule.approval_required,
        allowed_without_approval: !rule.approval_required,
        reason: rule.description,
    })
}
