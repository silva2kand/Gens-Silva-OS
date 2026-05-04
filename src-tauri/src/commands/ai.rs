use std::sync::Mutex;
use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::fs;
use futures::StreamExt;
use reqwest::Client;
use std::process::{Child, Command};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

static LOADED_MODEL: Lazy<Mutex<Option<serde_json::Value>>> = Lazy::new(|| Mutex::new(None));
static INFERENCE_PROCESS: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamEvent {
    pub event_type: String,
    pub run_id: String,
    pub agent: String,
    pub text: String,
    pub safe_to_speak: bool,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub id: String,
    pub label: String,
    pub active: bool,
    pub connected: bool,
    pub free_only: bool,
    pub model: String,
    pub base_url: String,
    pub connect_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderModel {
    pub id: String,
    pub label: String,
    pub provider: String,
    pub free_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct AiProviderSettings {
    active_provider: String,
    openai_api_key: String,
    gemini_api_key: String,
    openrouter_api_key: String,
    huggingface_api_key: String,
    nvidia_api_key: String,
    custom_api_key: String,
    openai_model: String,
    gemini_model: String,
    openrouter_model: String,
    huggingface_model: String,
    nvidia_model: String,
    ollama_model: String,
    ollama_base_url: String,
    lmstudio_model: String,
    lmstudio_base_url: String,
    custom_model: String,
    custom_base_url: String,
}

const DEFAULT_FREE_OPENROUTER_MODEL: &str = "";
const NVIDIA_FREE_ONLY_LOCKED_MODEL: &str = "free-only-locked";

static MODELS_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("models");
    path
});

fn get_models_dir() -> PathBuf {
    MODELS_DIR.clone()
}

fn get_settings_path() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path.join("ai_providers.json")
}

fn default_provider_settings() -> AiProviderSettings {
    AiProviderSettings {
        active_provider: "local".to_string(),
        openai_api_key: String::new(),
        gemini_api_key: String::new(),
        openrouter_api_key: String::new(),
        huggingface_api_key: String::new(),
        nvidia_api_key: String::new(),
        custom_api_key: String::new(),
        openai_model: "gpt-4o-mini".to_string(),
        gemini_model: "gemini-1.5-flash".to_string(),
        openrouter_model: DEFAULT_FREE_OPENROUTER_MODEL.to_string(),
        huggingface_model: "HuggingFaceH4/zephyr-7b-beta".to_string(),
        nvidia_model: NVIDIA_FREE_ONLY_LOCKED_MODEL.to_string(),
        ollama_model: "llama3.2".to_string(),
        ollama_base_url: "http://127.0.0.1:11434/v1".to_string(),
        lmstudio_model: "local-model".to_string(),
        lmstudio_base_url: "http://127.0.0.1:1234/v1".to_string(),
        custom_model: "custom-model".to_string(),
        custom_base_url: "http://127.0.0.1:8000/v1".to_string(),
    }
}

fn get_logs_dir() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("logs");
    let _ = fs::create_dir_all(&path);
    path
}

fn llama_server_log_path() -> PathBuf {
    get_logs_dir().join("llama-server.log")
}

fn read_llama_server_log_tail() -> String {
    let path = llama_server_log_path();
    fs::read_to_string(path)
        .map(|content| {
            let mut lines: Vec<&str> = content.lines().rev().take(24).collect();
            lines.reverse();
            lines.join("\n")
        })
        .unwrap_or_default()
}

impl Default for AiProviderSettings {
    fn default() -> Self {
        default_provider_settings()
    }
}

fn is_openrouter_free_model(model: &str) -> bool {
    model.trim().ends_with(":free")
}

fn is_nvidia_verified_free_model(model: &str) -> bool {
    let normalized = model.trim().to_ascii_lowercase();
    normalized.starts_with("free/") || normalized.ends_with(":free")
}

fn enforce_free_only_provider_model(provider_id: &str, model: &str) -> Result<(), String> {
    match provider_id {
        "openrouter" if !is_openrouter_free_model(model) => Err(format!(
            "OpenRouter is locked to free-only mode. Refusing to call paid model '{}'. Choose a model ending in ':free' or switch back to Local.",
            model
        )),
        "nvidia" if !is_nvidia_verified_free_model(model) => Err(
            "NVIDIA NIM is locked to free-only mode. Refusing to call NVIDIA cloud models because no verified free NVIDIA model is configured. Use Local, OpenRouter ':free', or add a verified free NVIDIA model id.".to_string()
        ),
        _ => Ok(()),
    }
}

fn clean_model_response(text: &str) -> String {
    let cleaned = if let Some((_, after_think)) = text.rsplit_once("</think>") {
        after_think
    } else {
        text
    };
    cleaned.trim().to_string()
}

fn base_memory_system_prompt() -> String {
    [
        "You are Genz Silva, Silva's local-first desktop AI workspace.",
        "Identity core: Silva Kandasamy in the UK, running Newton Newsagent and Silva Retail Ltd. Name history memory: current name Silva Kandasamy; previous names Shiva Kandasamy and Siyanthank Kandasamy. Treat records under any of those names as potentially relevant and ask before making sensitive assumptions.",
        "Primary specialist agents available in this workspace are Hermes, Paperclip, SpaceAgent, OpenClaw, Solicister, and Accountants.",
        "Hermes handles communications, inbox/outbox updates, drafts, follow-ups, pinned/flagged/saved/favourite item briefings, and handoffs.",
        "Paperclip handles documents, evidence, attachments, chronologies, bundles, knowledge filing, and source-tracked summaries.",
        "SpaceAgent handles research, undervalued properties, shops, premises, business opportunities, income plans, and mission coordination.",
        "OpenClaw handles coding, terminal, local files, web fetching, app navigation, automation, and runtime operations.",
        "Solicister is a UK-focused legal workbench for self-representation support: research, evidence organisation, drafts, visa/sponsor packs, and solicitor-check bundles. It is not a regulated solicitor and must flag when a human solicitor/OISC adviser should double-check.",
        "Accountants is a UK finance/bookkeeping workbench for Newton Newsagent, Silva Retail Ltd, property/shop analysis, records, cashflow, VAT/tax prep, and accountant-check packs. It is not a chartered accountant and must flag professional review points.",
        "Operate as a capable executive assistant across coding, business operations, documents, finance-style analysis, legal-style preparation, research, and task delegation.",
        "Use approval gates: draft, analyse, organise, and prepare everything, but do not submit legal/court/visa/tax/financial/social-media/email/WhatsApp actions externally without explicit approval at action time.",
        "Business memory: support shop improvement, lawful funding/loan preparation, overseas staff/family visa and sponsor paperwork preparation, CCTV/app restoration planning from GitHub repos, scam/spam/attack awareness, and lawful income/opportunity research.",
        "When asked for updates on a person, address, property, company, case, or project, gather available local/email/document/web context through tools where available, organise knowns/unknowns, and give next actions.",
        "Answer clearly and directly as the assistant.",
        "Do not continue fake User/Assistant transcripts.",
        "Do not include <think> blocks, scratchpad reasoning, or hidden chain-of-thought text.",
    ]
    .join(" ")
}

fn openai_chat_payload(model: String, prompt: String) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": base_memory_system_prompt()
            },
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 512,
        "stream": false
    })
}

fn openai_compatible_endpoint_connected(base_url: &str) -> bool {
    let trimmed = base_url
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    let host_port = trimmed.split('/').next().unwrap_or_default();
    if host_port.is_empty() {
        return false;
    }

    let mut parts = host_port.rsplitn(2, ':');
    let possible_port = parts.next().unwrap_or_default();
    let possible_host = parts.next();
    let (host, port) = match (possible_host, possible_port.parse::<u16>()) {
        (Some(host), Ok(port)) => (host, port),
        _ if base_url.starts_with("https://") => (host_port, 443),
        _ => (host_port, 80),
    };

    let Ok(addrs) = (host, port).to_socket_addrs() else {
        return false;
    };

    addrs.into_iter().any(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(450)).is_ok())
}

fn normalize_free_only_settings(mut settings: AiProviderSettings) -> AiProviderSettings {
    if !is_openrouter_free_model(&settings.openrouter_model) {
        settings.openrouter_model = DEFAULT_FREE_OPENROUTER_MODEL.to_string();
    }
    if !is_nvidia_verified_free_model(&settings.nvidia_model) {
        settings.nvidia_model = NVIDIA_FREE_ONLY_LOCKED_MODEL.to_string();
    }
    if settings.active_provider == "nvidia" && !is_nvidia_verified_free_model(&settings.nvidia_model) {
        settings.active_provider = "local".to_string();
    }
    if settings.active_provider == "openrouter" && settings.openrouter_model.trim().is_empty() {
        settings.active_provider = "local".to_string();
    }
    settings
}

fn load_provider_settings() -> AiProviderSettings {
    let path = get_settings_path();
    if !path.exists() {
        let defaults = normalize_free_only_settings(default_provider_settings());
        if let Ok(json) = serde_json::to_string_pretty(&defaults) {
            let _ = fs::write(path, json);
        }
        return defaults;
    }
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(settings) = serde_json::from_str::<AiProviderSettings>(&content) {
            let normalized = normalize_free_only_settings(settings);
            if let Ok(json) = serde_json::to_string_pretty(&normalized) {
                let _ = fs::write(path, json);
            }
            return normalized;
        }
    }
    normalize_free_only_settings(default_provider_settings())
}

fn save_provider_settings(settings: &AiProviderSettings) -> Result<(), String> {
    let path = get_settings_path();
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}


fn configured_local_endpoint() -> Option<String> {
    std::env::var("GENZ_SILVA_AI_ENDPOINT")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| std::env::var("LOCAL_AI_SERVER").ok().filter(|value| !value.trim().is_empty()))
}

fn candidate_local_endpoints() -> Vec<String> {
    let mut endpoints = vec![];

    if let Some(configured) = configured_local_endpoint() {
        endpoints.push(configured);
    }

    endpoints.push("http://localhost:8080".to_string());
    endpoints.push("http://127.0.0.1:8080".to_string());
    endpoints.push("http://localhost:1337/v1".to_string());
    endpoints.push("http://127.0.0.1:1337/v1".to_string());

    endpoints.dedup();
    endpoints
}

async fn endpoint_is_healthy(client: &Client, base_url: &str) -> bool {
    let base = base_url.trim_end_matches('/');
    let probes = if base.contains("/v1") || base.contains(":1337") {
        vec![format!("{}/models", base)]
    } else {
        vec![
            format!("{}/health", base),
            format!("{}/v1/models", base),
        ]
    };

    for probe in probes {
        if let Ok(response) = client.get(&probe).send().await {
            if response.status().is_success() {
                return true;
            }
        }
    }

    false
}

async fn first_available_local_endpoint() -> Option<String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_millis(1200))
        .build()
        .ok()?;

    for endpoint in candidate_local_endpoints() {
        if endpoint_is_healthy(&client, &endpoint).await {
            return Some(endpoint);
        }
    }

    None
}

async fn server_model_id(client: &Client, base_url: &str) -> Option<String> {
    let base = base_url.trim_end_matches('/');
    let models_endpoint = if base.ends_with("/v1") {
        format!("{}/models", base)
    } else {
        format!("{}/v1/models", base)
    };

    let response = client.get(models_endpoint).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }

    let json = response.json::<serde_json::Value>().await.ok()?;
    json["data"]
        .as_array()
        .and_then(|items| items.first())
        .and_then(|item| {
            item["id"]
                .as_str()
                .or_else(|| item["model"].as_str())
                .or_else(|| item["name"].as_str())
        })
        .map(|value| value.to_string())
}

async fn openai_compatible_model_list(
    client: &Client,
    base_url: &str,
    provider: &str,
) -> Result<Vec<AiProviderModel>, String> {
    let response = client
        .get(format!("{}/models", base_url.trim_end_matches('/')))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_else(|_| "Unknown provider error".to_string());
        return Err(format!("{} models error ({}): {}", provider, status, text));
    }

    let json = response.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
    Ok(json["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item["id"].as_str()?.to_string();
            let label = item["name"].as_str().unwrap_or(&id).to_string();
            Some(AiProviderModel {
                id,
                label,
                provider: provider.to_string(),
                free_only: provider != "custom",
            })
        })
        .collect())
}

async fn fetch_openrouter_free_models(client: &Client, api_key: &str) -> Result<Vec<AiProviderModel>, String> {
    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_else(|_| "Unknown OpenRouter error".to_string());
        return Err(format!("OpenRouter models error ({}): {}", status, text));
    }

    let json = response.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
    Ok(json["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item["id"].as_str()?.to_string();
            if !id.ends_with(":free") {
                return None;
            }
            Some(AiProviderModel {
                label: item["name"].as_str().unwrap_or(&id).to_string(),
                id,
                provider: "openrouter".to_string(),
                free_only: true,
            })
        })
        .collect())
}

fn local_model_registry_entries() -> Vec<serde_json::Value> {
    let registry_path = get_models_dir().join("registry.json");
    if !registry_path.exists() {
        return vec![];
    }

    fs::read_to_string(&registry_path)
        .ok()
        .and_then(|content| serde_json::from_str::<Vec<serde_json::Value>>(&content).ok())
        .unwrap_or_default()
}

fn local_gguf_file_entries() -> Vec<serde_json::Value> {
    let models_dir = get_models_dir();
    let Ok(entries) = fs::read_dir(&models_dir) else {
        return vec![];
    };

    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.eq_ignore_ascii_case("gguf")) != Some(true) {
                return None;
            }

            let file_name = path.file_name()?.to_string_lossy().to_string();
            let stem = path.file_stem().map(|value| value.to_string_lossy().to_string()).unwrap_or_else(|| file_name.clone());
            let size = entry.metadata().ok().map(|meta| meta.len()).unwrap_or(0);

            Some(serde_json::json!({
                "id": file_name,
                "name": stem,
                "path": path.to_string_lossy(),
                "provider": "Local",
                "downloaded": true,
                "status": "available",
                "file": file_name,
                "fileSize": size,
            }))
        })
        .collect()
}

fn merged_local_model_entries() -> Vec<serde_json::Value> {
    let mut merged = local_model_registry_entries();

    for file_entry in local_gguf_file_entries() {
        let file_path = file_entry["path"].as_str().unwrap_or_default();
        let file_id = file_entry["id"].as_str().unwrap_or_default();
        let already_known = merged.iter().any(|entry| {
            entry["path"].as_str() == Some(file_path)
                || entry["id"].as_str() == Some(file_id)
                || entry["file"].as_str() == Some(file_id)
        });

        if !already_known {
            merged.push(file_entry);
        }
    }

    merged
}

fn local_provider_models() -> Vec<AiProviderModel> {
    merged_local_model_entries()
        .into_iter()
        .filter_map(|item| {
            let id = item["id"]
                .as_str()
                .or_else(|| item["file"].as_str())
                .or_else(|| item["path"].as_str())
                .map(|value| value.to_string())?;
            let label = item["name"]
                .as_str()
                .or_else(|| item["file"].as_str())
                .unwrap_or(&id)
                .to_string();

            Some(AiProviderModel {
                id,
                label,
                provider: "local".to_string(),
                free_only: true,
            })
        })
        .collect()
}

fn find_local_model_entry(model_id: &str) -> Option<serde_json::Value> {
    merged_local_model_entries().into_iter().find(|entry| {
        let stem_matches = entry["path"]
            .as_str()
            .and_then(|path| {
                PathBuf::from(path)
                    .file_stem()
                    .map(|stem| stem.to_string_lossy().to_string())
            })
            .map(|stem| stem == model_id)
            .unwrap_or(false);

        entry["id"].as_str() == Some(model_id)
            || entry["file"].as_str() == Some(model_id)
            || entry["path"].as_str() == Some(model_id)
            || stem_matches
    })
}

async fn local_chat_completion_internal(prompt: String) -> Result<String, String> {
    let model_data = LOADED_MODEL.lock().ok().and_then(|loaded| loaded.clone());
    let Some(server_url) = first_available_local_endpoint().await else {
        return Err("Local engine is offline. Start Jan/llama-server or load a model from Model Hub.".to_string());
    };

    let client = reqwest::Client::new();
    let selected_model_name = model_data
        .as_ref()
        .and_then(|model| model["id"].as_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| std::env::var("GENZ_SILVA_CURRENT_MODEL").unwrap_or_else(|_| "local-model".to_string()));
    let model_name = server_model_id(&client, &server_url)
        .await
        .unwrap_or(selected_model_name);

    let completion_prompt = prompt.clone();
    let payload = openai_chat_payload(model_name, prompt);
    let endpoint = if server_url.trim_end_matches('/').ends_with("/v1") {
        format!("{}/chat/completions", server_url.trim_end_matches('/'))
    } else {
        format!("{}/v1/chat/completions", server_url.trim_end_matches('/'))
    };

    match client.post(&endpoint).json(&payload).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(c) = json["choices"][0]["message"]["content"].as_str() {
                        let cleaned = clean_model_response(c);
                        if !cleaned.trim().is_empty() {
                            return Ok(cleaned);
                        }
                    }
                }
            } else {
                let status = resp.status();
                let error_text = resp.text().await.unwrap_or_else(|_| "Unknown server error".to_string());
                return Err(format!("AI Server Error ({}): {}", status, error_text));
            }
            let completion_endpoint = format!("{}/completion", server_url.trim_end_matches('/'));
            let fallback_payload = serde_json::json!({
                "prompt": completion_prompt,
                "n_predict": 512,
                "temperature": 0.6,
            });

            let fallback_resp = client
                .post(&completion_endpoint)
                .json(&fallback_payload)
                .send()
                .await
                .map_err(|e| format!("Local AI fallback request failed against {}: {}", completion_endpoint, e))?;

            if !fallback_resp.status().is_success() {
                let status = fallback_resp.status();
                let error_text = fallback_resp.text().await.unwrap_or_else(|_| "Unknown server error".to_string());
                return Err(format!("AI Server Error ({}): {}", status, error_text));
            }

            let fallback_json = fallback_resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
            if let Some(text) = fallback_json["content"].as_str() {
                let cleaned = clean_model_response(text);
                if !cleaned.trim().is_empty() {
                    return Ok(cleaned);
                }
            }

            Err("Unexpected response format from AI server".to_string())
        }
        Err(e) => Err(format!("Local AI request failed against {}: {}", server_url, e)),
    }
}

fn stream_event(run_id: &str, event_type: &str, text: impl Into<String>, done: bool, error: Option<String>) -> ChatStreamEvent {
    let text = text.into();
    let sensitive = text.to_lowercase();
    ChatStreamEvent {
        event_type: event_type.to_string(),
        run_id: run_id.to_string(),
        agent: "assistant".to_string(),
        safe_to_speak: !sensitive.contains("password")
            && !sensitive.contains("api key")
            && !sensitive.contains("secret")
            && !sensitive.contains("token")
            && !sensitive.contains("private key")
            && !sensitive.contains("full email body")
            && !sensitive.contains("card number")
            && !sensitive.contains("sort code"),
        text,
        done,
        error,
    }
}

fn emit_stream(app_handle: &tauri::AppHandle, event: ChatStreamEvent) {
    let _ = crate::run_timeline::record_timeline_event(
        Some(app_handle),
        event.run_id.clone(),
        event.event_type.clone(),
        "chat".to_string(),
        event.agent.clone(),
        event.event_type.replace('_', " "),
        event.text.clone(),
        if event.done { "complete" } else { "running" }.to_string(),
        event.event_type == "approval_needed",
        serde_json::json!({ "safeToSpeak": event.safe_to_speak, "error": event.error }),
    );
    let _ = app_handle.emit("chat_stream_event", event);
}

fn extract_stream_token(json: &serde_json::Value) -> Option<String> {
    json["choices"][0]["delta"]["content"]
        .as_str()
        .or_else(|| json["choices"][0]["message"]["content"].as_str())
        .or_else(|| json["content"].as_str())
        .map(ToString::to_string)
}

fn sentence_boundary(text: &str) -> bool {
    let trimmed = text.trim_end();
    trimmed.ends_with('.')
        || trimmed.ends_with('!')
        || trimmed.ends_with('?')
        || trimmed.ends_with('।')
        || trimmed.ends_with('。')
        || trimmed.ends_with('\n')
}

async fn local_chat_stream_internal(app_handle: tauri::AppHandle, run_id: String, prompt: String) -> Result<String, String> {
    let model_data = LOADED_MODEL.lock().ok().and_then(|loaded| loaded.clone());
    let Some(server_url) = first_available_local_endpoint().await else {
        return Err("Local engine is offline. Start Jan/llama-server or load a model from Model Hub.".to_string());
    };

    let client = reqwest::Client::new();
    let selected_model_name = model_data
        .as_ref()
        .and_then(|model| model["id"].as_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| std::env::var("GENZ_SILVA_CURRENT_MODEL").unwrap_or_else(|_| "local-model".to_string()));
    let model_name = server_model_id(&client, &server_url)
        .await
        .unwrap_or(selected_model_name);

    let mut payload = openai_chat_payload(model_name, prompt.clone());
    payload["stream"] = serde_json::Value::Bool(true);
    let endpoint = if server_url.trim_end_matches('/').ends_with("/v1") {
        format!("{}/chat/completions", server_url.trim_end_matches('/'))
    } else {
        format!("{}/v1/chat/completions", server_url.trim_end_matches('/'))
    };

    emit_stream(&app_handle, stream_event(&run_id, "tool_started", "Local model stream started.", false, None));
    let response = client
        .post(&endpoint)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Local stream request failed against {}: {}", endpoint, e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown server error".to_string());
        return Err(format!("AI Server Error ({}): {}", status, error_text));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full = String::new();
    let mut sentence = String::new();

    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(index) = buffer.find('\n') {
            let line = buffer[..index].trim().to_string();
            buffer = buffer[index + 1..].to_string();
            if line.is_empty() || line.starts_with(':') {
                continue;
            }
            let data = line.strip_prefix("data:").map(str::trim).unwrap_or(line.as_str());
            if data == "[DONE]" {
                continue;
            }
            let Ok(json) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };
            if let Some(token) = extract_stream_token(&json) {
                if token.is_empty() {
                    continue;
                }
                full.push_str(&token);
                sentence.push_str(&token);
                emit_stream(&app_handle, stream_event(&run_id, "token", token, false, None));
                if sentence_boundary(&sentence) || sentence.chars().count() > 220 {
                    let ready = sentence.trim().to_string();
                    if !ready.is_empty() {
                        emit_stream(&app_handle, stream_event(&run_id, "sentence_ready", ready, false, None));
                    }
                    sentence.clear();
                }
            }
        }
    }

    if !sentence.trim().is_empty() {
        emit_stream(&app_handle, stream_event(&run_id, "sentence_ready", sentence.trim().to_string(), false, None));
    }
    emit_stream(&app_handle, stream_event(&run_id, "tool_finished", "Local model stream finished.", false, None));

    let cleaned = clean_model_response(&full);
    if cleaned.trim().is_empty() {
        return Err("Streaming response was empty.".to_string());
    }
    Ok(cleaned)
}

#[tauri::command]
pub fn list_ai_providers() -> Result<Vec<AiProviderConfig>, String> {
    let settings = load_provider_settings();
    let ollama_connected = openai_compatible_endpoint_connected(&settings.ollama_base_url);
    let lmstudio_connected = openai_compatible_endpoint_connected(&settings.lmstudio_base_url);
    let custom_connected = openai_compatible_endpoint_connected(&settings.custom_base_url);
    Ok(vec![
        AiProviderConfig {
            id: "local".to_string(),
            label: "Local (Built-in)".to_string(),
            active: settings.active_provider == "local",
            connected: true,
            free_only: true,
            model: "local-registry".to_string(),
            base_url: "http://localhost:8080".to_string(),
            connect_url: "".to_string(),
        },
        AiProviderConfig {
            id: "ollama".to_string(),
            label: "Ollama".to_string(),
            active: settings.active_provider == "ollama",
            connected: ollama_connected,
            free_only: true,
            model: settings.ollama_model.clone(),
            base_url: settings.ollama_base_url.clone(),
            connect_url: "https://ollama.com/download".to_string(),
        },
        AiProviderConfig {
            id: "lmstudio".to_string(),
            label: "LM Studio".to_string(),
            active: settings.active_provider == "lmstudio",
            connected: lmstudio_connected,
            free_only: true,
            model: settings.lmstudio_model.clone(),
            base_url: settings.lmstudio_base_url.clone(),
            connect_url: "https://lmstudio.ai/".to_string(),
        },
        AiProviderConfig {
            id: "chatgpt".to_string(),
            label: "ChatGPT (OpenAI)".to_string(),
            active: settings.active_provider == "chatgpt",
            connected: !settings.openai_api_key.is_empty(),
            free_only: false,
            model: settings.openai_model,
            base_url: "https://api.openai.com/v1".to_string(),
            connect_url: "https://platform.openai.com/api-keys".to_string(),
        },
        AiProviderConfig {
            id: "gemini".to_string(),
            label: "Gemini".to_string(),
            active: settings.active_provider == "gemini",
            connected: !settings.gemini_api_key.is_empty(),
            free_only: false,
            model: settings.gemini_model,
            base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
            connect_url: "https://aistudio.google.com/app/apikey".to_string(),
        },
        AiProviderConfig {
            id: "openrouter".to_string(),
            label: "OpenRouter".to_string(),
            active: settings.active_provider == "openrouter",
            connected: !settings.openrouter_api_key.is_empty(),
            free_only: true,
            model: settings.openrouter_model,
            base_url: "https://openrouter.ai/api/v1".to_string(),
            connect_url: "https://openrouter.ai/keys".to_string(),
        },
        AiProviderConfig {
            id: "huggingface".to_string(),
            label: "Hugging Face".to_string(),
            active: settings.active_provider == "huggingface",
            connected: !settings.huggingface_api_key.is_empty(),
            free_only: false,
            model: settings.huggingface_model,
            base_url: "https://router.huggingface.co/v1".to_string(),
            connect_url: "https://huggingface.co/settings/tokens".to_string(),
        },
        AiProviderConfig {
            id: "nvidia".to_string(),
            label: "NVIDIA NIM".to_string(),
            active: settings.active_provider == "nvidia",
            connected: !settings.nvidia_api_key.is_empty(),
            free_only: true,
            model: settings.nvidia_model,
            base_url: "https://integrate.api.nvidia.com/v1".to_string(),
            connect_url: "https://build.nvidia.com/".to_string(),
        },
        AiProviderConfig {
            id: "custom".to_string(),
            label: "Custom API".to_string(),
            active: settings.active_provider == "custom",
            connected: custom_connected,
            free_only: false,
            model: settings.custom_model,
            base_url: settings.custom_base_url,
            connect_url: "".to_string(),
        },
    ])
}

#[tauri::command]
pub fn set_active_ai_provider(provider_id: String) -> Result<(), String> {
    let mut settings = load_provider_settings();
    if provider_id == "openrouter" && !is_openrouter_free_model(&settings.openrouter_model) {
        settings.openrouter_model = DEFAULT_FREE_OPENROUTER_MODEL.to_string();
    }
    if provider_id == "openrouter" && settings.openrouter_model.trim().is_empty() {
        return Err("Choose a verified free OpenRouter model from the model list before activating OpenRouter.".to_string());
    }
    if provider_id == "nvidia" && !is_nvidia_verified_free_model(&settings.nvidia_model) {
        settings.nvidia_model = NVIDIA_FREE_ONLY_LOCKED_MODEL.to_string();
        return Err("NVIDIA is locked until a verified free NVIDIA model is configured. Local remains active.".to_string());
    }
    settings.active_provider = provider_id;
    save_provider_settings(&settings)
}

#[tauri::command]
pub fn set_ai_provider_api_key(provider_id: String, api_key: String) -> Result<(), String> {
    let mut settings = load_provider_settings();
    match provider_id.as_str() {
        "chatgpt" => settings.openai_api_key = api_key,
        "gemini" => settings.gemini_api_key = api_key,
        "openrouter" => settings.openrouter_api_key = api_key,
        "huggingface" => settings.huggingface_api_key = api_key,
        "nvidia" => settings.nvidia_api_key = api_key,
        "custom" => settings.custom_api_key = api_key,
        _ => return Err("Unknown provider".to_string()),
    }
    save_provider_settings(&settings)
}

#[tauri::command]
pub fn set_ai_provider_model(provider_id: String, model_id: String) -> Result<(), String> {
    let mut settings = load_provider_settings();
    match provider_id.as_str() {
        "chatgpt" => settings.openai_model = model_id,
        "gemini" => settings.gemini_model = model_id,
        "openrouter" => {
            enforce_free_only_provider_model("openrouter", &model_id)?;
            settings.openrouter_model = model_id;
        }
        "huggingface" => settings.huggingface_model = model_id,
        "nvidia" => {
            enforce_free_only_provider_model("nvidia", &model_id)?;
            settings.nvidia_model = model_id;
        }
        "ollama" => settings.ollama_model = model_id,
        "lmstudio" => settings.lmstudio_model = model_id,
        "custom" => settings.custom_model = model_id,
        _ => return Err("Unknown provider".to_string()),
    }
    save_provider_settings(&settings)
}

#[tauri::command]
pub async fn list_ai_provider_models(provider_id: String) -> Result<Vec<AiProviderModel>, String> {
    let settings = load_provider_settings();
    let client = reqwest::Client::new();

    match provider_id.as_str() {
        "local" => Ok(local_provider_models()),
        "openrouter" => {
            if settings.openrouter_api_key.is_empty() {
                return Err("OpenRouter is not connected. Add your API key first.".to_string());
            }
            fetch_openrouter_free_models(&client, &settings.openrouter_api_key).await
        }
        "ollama" => openai_compatible_model_list(&client, &settings.ollama_base_url, "ollama").await,
        "lmstudio" => openai_compatible_model_list(&client, &settings.lmstudio_base_url, "lmstudio").await,
        "custom" => openai_compatible_model_list(&client, &settings.custom_base_url, "custom").await,
        "nvidia" => Ok(vec![]),
        _ => Err("Free model listing is currently available for OpenRouter. NVIDIA is locked until a verified free NIM model catalog is available.".to_string()),
    }
}

#[tauri::command]
pub async fn check_ai_status() -> Result<bool, String> {
    Ok(first_available_local_endpoint().await.is_some())
}

#[tauri::command]
pub async fn get_local_engine_diagnostics() -> Result<serde_json::Value, String> {
    let mut exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    exe_path.pop();

    let runtime_server = exe_path.join("bin").join("llama-server.exe");
    let source_server = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("bin")
        .join("llama-server.exe");
    let server_path = if runtime_server.exists() {
        runtime_server
    } else {
        source_server
    };

    let local_model_count = merged_local_model_entries().len();

    let loaded_model = LOADED_MODEL
        .lock()
        .ok()
        .and_then(|loaded| loaded.as_ref().and_then(|value| value["id"].as_str().map(|id| id.to_string())));
    let endpoint = first_available_local_endpoint().await;

    Ok(serde_json::json!({
        "online": endpoint.is_some(),
        "endpoint": endpoint,
        "serverBinaryFound": server_path.exists(),
        "serverBinaryPath": server_path.to_string_lossy(),
        "serverLogPath": llama_server_log_path().to_string_lossy(),
        "serverLogTail": read_llama_server_log_tail(),
        "localModelCount": local_model_count,
        "loadedModel": loaded_model,
        "modelsDir": get_models_dir().to_string_lossy(),
    }))
}

#[tauri::command]
pub async fn start_local_engine(app_handle: tauri::AppHandle, model_id: Option<String>) -> Result<String, String> {
    if let Some(endpoint) = first_available_local_endpoint().await {
        if let Some(model_id) = model_id {
            if let Some(model_entry) = find_local_model_entry(&model_id) {
                if let Ok(mut loaded) = LOADED_MODEL.lock() {
                    *loaded = Some(serde_json::json!({
                        "id": model_id,
                        "path": model_entry["path"].as_str().unwrap_or_default()
                    }));
                }
            }
        }
        return Ok(format!("Local AI endpoint already responding at {}", endpoint));
    }

    let target_model = model_id.or_else(|| {
        LOADED_MODEL
            .lock()
            .ok()
            .and_then(|loaded| loaded.as_ref().and_then(|value| value["id"].as_str().map(|id| id.to_string())))
    });

    if let Some(model_id) = target_model {
        load_model(app_handle, model_id.clone())?;
        return Ok(format!("Started local engine for {}", model_id));
    }

    Err("No local model selected. Download or import a model, then load it into VRAM to start the engine.".to_string())
}

#[tauri::command]
pub fn list_models() -> Result<Vec<serde_json::Value>, String> {
    Ok(merged_local_model_entries())
}

#[tauri::command]
pub fn load_model(_app_handle: tauri::AppHandle, model_id: String) -> Result<(), String> {
    // 1. Kill existing process if any
    unload_model()?;

    // 2. Find model path
    let model_entry = find_local_model_entry(&model_id);

    let model_path_str = model_entry.and_then(|m| m["path"].as_str().map(|s| s.to_string()))
        .ok_or_else(|| format!("Model {} not found in local library. Please download it first.", model_id))?;

    let model_path = PathBuf::from(&model_path_str);
    
    // Check if the file actually exists
    if !model_path.exists() {
        return Err(format!("Model file not found at {:?}. Please re-download the model.", model_path));
    }

    // Heuristic: If it's a split model (-00001-of-), check if part 2 exists
    if model_path_str.contains("-00001-of-") {
        let part2 = model_path_str.replace("-00001-of-", "-00002-of-");
        if !PathBuf::from(&part2).exists() {
            return Err("This is a multi-part model, but only the first part is downloaded. Please delete and re-download the model to fetch all parts.".to_string());
        }
    }

    // 3. Start inference server
    let mut exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    exe_path.pop();
    let runtime_bin_dir = exe_path.join("bin");
    let source_bin_dir = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("bin");
    let bundled_bin_dir = if runtime_bin_dir.join("llama-server.exe").exists() {
        runtime_bin_dir
    } else {
        source_bin_dir
    };
    let local_bin = bundled_bin_dir.join("llama-server.exe");
    
    let cmd_name = if local_bin.exists() {
        local_bin.to_string_lossy().to_string()
    } else {
        "llama-server".to_string()
    };

    let mut command = Command::new(cmd_name);
    if bundled_bin_dir.exists() {
        command.current_dir(&bundled_bin_dir);
    }
    let log_path = llama_server_log_path();
    let _ = fs::remove_file(&log_path);

    let child = command
        .arg("-m")
        .arg(&model_path)
        .arg("--alias")
        .arg(&model_id)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("8080")
        .arg("--ctx-size")
        .arg("4096")
        .arg("--parallel")
        .arg("1")
        .arg("--n-gpu-layers")
        .arg("auto")
        .arg("--reasoning-budget")
        .arg("0")
        .arg("--log-file")
        .arg(&log_path)
        .spawn();

    match child {
        Ok(mut c) => {
            if let Ok(mut loaded) = LOADED_MODEL.lock() {
                *loaded = Some(serde_json::json!({ "id": model_id, "path": model_path_str }));
            }

            let ready_deadline = std::time::Instant::now() + std::time::Duration::from_secs(90);
            while std::time::Instant::now() < ready_deadline {
                match c.try_wait() {
                    Ok(Some(status)) => {
                        let log_tail = read_llama_server_log_tail();
                        return Err(format!(
                            "Local AI engine exited during startup with status {}.{}",
                            status,
                            if log_tail.is_empty() {
                                "".to_string()
                            } else {
                                format!("\n\nllama-server log:\n{}", log_tail)
                            }
                        ));
                    }
                    Ok(None) => {}
                    Err(e) => return Err(format!("Could not check local engine startup status: {}", e)),
                }

                if std::net::TcpStream::connect(("127.0.0.1", 8080)).is_ok()
                    || std::net::TcpStream::connect(("::1", 8080)).is_ok()
                {
                    if let Ok(mut process) = INFERENCE_PROCESS.lock() {
                        *process = Some(c);
                    }
                    return Ok(());
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }

            let _ = c.kill();
            let log_tail = read_llama_server_log_tail();
            return Err(format!(
                "Local AI engine was launched, but it did not become ready on port 8080 within 90 seconds. The model may be too large for available RAM/VRAM, or llama-server is still failing during startup.{}",
                if log_tail.is_empty() {
                    "".to_string()
                } else {
                    format!("\n\nllama-server log:\n{}", log_tail)
                }
            ));
        }
        Err(e) => {
            return Err(format!(
                "Unable to start local AI engine. Ensure llama-server.exe is available in src-tauri/bin or on PATH. {}",
                e
            ));
        }
    }
}

#[tauri::command]
pub fn select_loaded_model(model_id: String) -> Result<(), String> {
    let model_entry = find_local_model_entry(&model_id);
    let path = model_entry
        .as_ref()
        .and_then(|entry| entry["path"].as_str())
        .unwrap_or_default()
        .to_string();

    if let Ok(mut loaded) = LOADED_MODEL.lock() {
        *loaded = Some(serde_json::json!({ "id": model_id, "path": path }));
    }
    Ok(())
}

#[tauri::command]
pub fn unload_model() -> Result<(), String> {
    if let Ok(mut process) = INFERENCE_PROCESS.lock() {
        if let Some(mut child) = process.take() {
            let _ = child.kill();
        }
    }
    
    if let Ok(mut loaded) = LOADED_MODEL.lock() {
        *loaded = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn chat_completion(prompt: String) -> Result<String, String> {
    let provider_settings = load_provider_settings();
    if provider_settings.active_provider != "local" {
        let provider_attempt = async {
            let client = reqwest::Client::new();
            let user_message = serde_json::json!([
                {
                    "role": "system",
                    "content": base_memory_system_prompt()
                },
                {"role":"user","content": prompt.clone()}
            ]);

            let (url, token, payload, parser): (String, String, serde_json::Value, &str) = match provider_settings.active_provider.as_str() {
            "chatgpt" => (
                "https://api.openai.com/v1/chat/completions".to_string(),
                provider_settings.openai_api_key.clone(),
                serde_json::json!({ "model": provider_settings.openai_model, "messages": user_message, "max_tokens": 512 }),
                "openai",
            ),
            "openrouter" => {
                enforce_free_only_provider_model("openrouter", &provider_settings.openrouter_model)?;
                (
                    "https://openrouter.ai/api/v1/chat/completions".to_string(),
                    provider_settings.openrouter_api_key.clone(),
                    serde_json::json!({ "model": provider_settings.openrouter_model, "messages": user_message, "max_tokens": 512 }),
                    "openai",
                )
            },
            "huggingface" => (
                "https://router.huggingface.co/v1/chat/completions".to_string(),
                provider_settings.huggingface_api_key.clone(),
                serde_json::json!({ "model": provider_settings.huggingface_model, "messages": user_message, "max_tokens": 512 }),
                "openai",
            ),
            "ollama" => (
                format!("{}/chat/completions", provider_settings.ollama_base_url.trim_end_matches('/')),
                String::new(),
                serde_json::json!({ "model": provider_settings.ollama_model, "messages": user_message, "max_tokens": 512 }),
                "openai",
            ),
            "lmstudio" => (
                format!("{}/chat/completions", provider_settings.lmstudio_base_url.trim_end_matches('/')),
                String::new(),
                serde_json::json!({ "model": provider_settings.lmstudio_model, "messages": user_message, "max_tokens": 512 }),
                "openai",
            ),
            "nvidia" => {
                enforce_free_only_provider_model("nvidia", &provider_settings.nvidia_model)?;
                (
                    "https://integrate.api.nvidia.com/v1/chat/completions".to_string(),
                    provider_settings.nvidia_api_key.clone(),
                    serde_json::json!({ "model": provider_settings.nvidia_model, "messages": user_message, "max_tokens": 512 }),
                    "openai",
                )
            },
            "gemini" => (
                format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", provider_settings.gemini_model, provider_settings.gemini_api_key),
                String::new(),
                serde_json::json!({
                    "contents": [{"parts":[{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": 512}
                }),
                "gemini",
            ),
            "custom" => (
                format!("{}/chat/completions", provider_settings.custom_base_url.trim_end_matches('/')),
                provider_settings.custom_api_key.clone(),
                serde_json::json!({ "model": provider_settings.custom_model, "messages": user_message, "max_tokens": 512 }),
                "openai",
            ),
            _ => return Err("Unknown active AI provider".to_string()),
        };

            if !matches!(provider_settings.active_provider.as_str(), "gemini" | "ollama" | "lmstudio") && token.is_empty() {
                return Err(format!("Provider '{}' is not connected. Add API key in Integrations.", provider_settings.active_provider));
            }
            if provider_settings.active_provider == "gemini" && provider_settings.gemini_api_key.is_empty() {
                return Err("Provider 'gemini' is not connected. Add API key in Integrations.".to_string());
            }

            let mut req = client.post(url).json(&payload);
            if !token.is_empty() {
                req = req.bearer_auth(token);
            }
            let resp = req.send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                let status = resp.status();
                let error_text = resp.text().await.unwrap_or_else(|_| "Unknown provider error".to_string());

                if provider_settings.active_provider == "openrouter" && status == reqwest::StatusCode::NOT_FOUND {
                    let free_models = fetch_openrouter_free_models(&client, &provider_settings.openrouter_api_key).await?;
                    if let Some(model) = free_models.first() {
                        let mut settings = load_provider_settings();
                        settings.openrouter_model = model.id.clone();
                        let _ = save_provider_settings(&settings);

                        let retry_resp = client
                            .post("https://openrouter.ai/api/v1/chat/completions")
                            .bearer_auth(provider_settings.openrouter_api_key.clone())
                            .json(&serde_json::json!({
                                "model": model.id,
                                "messages": user_message,
                                "max_tokens": 512
                            }))
                            .send()
                            .await
                            .map_err(|e| e.to_string())?;

                        if retry_resp.status().is_success() {
                            let retry_json = retry_resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
                            if let Some(text) = retry_json["choices"][0]["message"]["content"].as_str() {
                                return Ok(clean_model_response(text));
                            }
                        }
                    }
                }

                return Err(format!("Provider Error ({}): {}", status, error_text));
            }
            let json = resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
            if parser == "gemini" {
                if let Some(text) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                    return Ok(clean_model_response(text));
                }
            } else if let Some(text) = json["choices"][0]["message"]["content"].as_str() {
                return Ok(clean_model_response(text));
            }
            Err("Unexpected provider response format".to_string())
        }.await;

        match provider_attempt {
            Ok(response) => return Ok(response),
            Err(_) if first_available_local_endpoint().await.is_some() => {
                return local_chat_completion_internal(prompt).await;
            }
            Err(error) => return Err(error),
        }
    }
    local_chat_completion_internal(prompt).await
}

#[tauri::command]
pub async fn stream_chat(prompt: String) -> Result<Vec<String>, String> {
    let response = chat_completion(prompt).await?;
    // Compatibility shim: until token streaming is implemented in the UI event channel,
    // return a single chunk so callers can use one API path.
    Ok(vec![response])
}

#[tauri::command]
pub async fn start_chat_stream(app_handle: tauri::AppHandle, run_id: String, prompt: String) -> Result<String, String> {
    emit_stream(&app_handle, stream_event(&run_id, "tool_started", "Chat stream requested.", false, None));
    let result = if load_provider_settings().active_provider == "local" {
        local_chat_stream_internal(app_handle.clone(), run_id.clone(), prompt.clone()).await
    } else {
        match chat_completion(prompt).await {
            Ok(response) => {
                for chunk in response.split_inclusive(['.', '!', '?', '\n']).map(str::trim).filter(|chunk| !chunk.is_empty()) {
                    emit_stream(&app_handle, stream_event(&run_id, "token", chunk.to_string(), false, None));
                    emit_stream(&app_handle, stream_event(&run_id, "sentence_ready", chunk.to_string(), false, None));
                }
                Ok(response)
            }
            Err(error) => Err(error),
        }
    };

    match result {
        Ok(response) => {
            emit_stream(&app_handle, stream_event(&run_id, "done", response.clone(), true, None));
            Ok(response)
        }
        Err(error) => {
            emit_stream(&app_handle, stream_event(&run_id, "error", "", true, Some(error.clone())));
            Err(error)
        }
    }
}
