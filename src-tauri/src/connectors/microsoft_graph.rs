use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

const DEFAULT_CLIENT_ID: &str = "90613455-9738-4f79-8ad6-d257d173c929";
const DEFAULT_TENANT_ID: &str = "39f9740f-7162-4ff5-93ea-149c79ee1b7a";
const DEFAULT_REDIRECT_URI: &str = "http://localhost:1420/";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftGraphConfig {
    pub client_id: String,
    pub tenant_id: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    pub configured: bool,
    pub token_connected: bool,
}

impl Default for MicrosoftGraphConfig {
    fn default() -> Self {
        Self {
            client_id: DEFAULT_CLIENT_ID.to_string(),
            tenant_id: DEFAULT_TENANT_ID.to_string(),
            redirect_uri: DEFAULT_REDIRECT_URI.to_string(),
            scopes: default_scopes(),
            configured: true,
            token_connected: false,
        }
    }
}

fn default_scopes() -> Vec<String> {
    [
        "openid",
        "offline_access",
        "User.Read",
        "Mail.Read",
        "Mail.Send",
        "Calendars.ReadWrite",
        "Contacts.Read",
        "Files.ReadWrite",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

fn config_path() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("connectors");
    path.push("microsoft_graph.json");
    path
}

fn save_config(config: &MicrosoftGraphConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn percent_encode(input: &str) -> String {
    input
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{:02X}", byte),
        })
        .collect()
}

#[tauri::command]
pub fn get_microsoft_graph_config() -> Result<MicrosoftGraphConfig, String> {
    let path = config_path();
    if !path.exists() {
        let config = MicrosoftGraphConfig::default();
        save_config(&config)?;
        return Ok(config);
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut config: MicrosoftGraphConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if config.scopes.is_empty() {
        config.scopes = default_scopes();
    }
    if config.redirect_uri.trim() == "http://localhost" {
        config.redirect_uri = DEFAULT_REDIRECT_URI.to_string();
        let _ = save_config(&config);
    }
    config.configured = !config.client_id.trim().is_empty() && !config.tenant_id.trim().is_empty();
    Ok(config)
}

#[tauri::command]
pub fn save_microsoft_graph_config(
    client_id: String,
    tenant_id: String,
    redirect_uri: Option<String>,
) -> Result<MicrosoftGraphConfig, String> {
    let config = MicrosoftGraphConfig {
        client_id: client_id.trim().to_string(),
        tenant_id: tenant_id.trim().to_string(),
        redirect_uri: redirect_uri
            .unwrap_or_else(|| DEFAULT_REDIRECT_URI.to_string())
            .trim()
            .to_string(),
        scopes: default_scopes(),
        configured: !client_id.trim().is_empty() && !tenant_id.trim().is_empty(),
        token_connected: false,
    };

    if !config.configured {
        return Err("Microsoft Graph needs both Application (client) ID and Directory (tenant) ID.".to_string());
    }

    save_config(&config)?;
    Ok(config)
}

#[tauri::command]
pub fn get_microsoft_graph_auth_url() -> Result<String, String> {
    let config = get_microsoft_graph_config()?;
    if !config.configured {
        return Err("Microsoft Graph app registration is not configured yet.".to_string());
    }

    let scope = config.scopes.join(" ");
    Ok(format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/authorize?client_id={}&response_type=code&redirect_uri={}&response_mode=query&scope={}&prompt=select_account",
        percent_encode(&config.tenant_id),
        percent_encode(&config.client_id),
        percent_encode(&config.redirect_uri),
        percent_encode(&scope)
    ))
}

#[tauri::command]
pub fn microsoft_graph_status() -> Result<serde_json::Value, String> {
    let config = get_microsoft_graph_config()?;
    Ok(serde_json::json!({
        "configured": config.configured,
        "tokenConnected": config.token_connected,
        "clientId": config.client_id,
        "tenantId": config.tenant_id,
        "redirectUri": config.redirect_uri,
        "scopes": config.scopes,
        "message": if config.token_connected {
            "Microsoft Graph token is connected."
        } else {
            "Microsoft Graph app registration is saved. Sign-in/token exchange is the next step before reading or sending live Outlook data."
        }
    }))
}
