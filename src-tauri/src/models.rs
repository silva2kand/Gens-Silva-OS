use std::sync::Mutex;
use std::collections::HashMap;
use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::fs;
use futures::{future::join_all, StreamExt};

static DOWNLOAD_PROGRESS: Lazy<Mutex<HashMap<String, f32>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static DOWNLOAD_STATUS: Lazy<Mutex<HashMap<String, DownloadStatus>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStatus {
    pub id: String,
    pub state: String,
    pub current_file: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub error: String,
}

static MODELS_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("models");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
});

fn get_models_dir() -> PathBuf {
    MODELS_DIR.clone()
}

fn file_size(file: &serde_json::Value) -> u64 {
    file["size"].as_u64().or_else(|| file["lfs"]["size"].as_u64()).unwrap_or(0)
}

fn format_size(bytes: u64) -> String {
    if bytes == 0 {
        return "Unknown".to_string();
    }

    if bytes > 1024 * 1024 * 1024 {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

fn quantization_from_file(file_name: &str) -> String {
    let lower = file_name.to_lowercase();
    for part in lower.split(['.', '-', '_']) {
        if part.starts_with('q') && part.len() > 1 {
            return part.to_uppercase();
        }
    }
    if lower.contains("bf16") {
        return "BF16".to_string();
    }
    if lower.contains("fp16") || lower.contains("f16") {
        return "FP16".to_string();
    }
    "Mixed".to_string()
}

fn preferred_gguf_files(model_data: &serde_json::Value) -> Vec<(String, u64)> {
    let files: Vec<(String, u64)> = model_data["siblings"]
        .as_array()
        .map(|siblings| {
            siblings
                .iter()
                .filter_map(|file| {
                    let name = file["rfilename"].as_str()?;
                    if name.ends_with(".gguf") {
                        Some((name.to_string(), file_size(file)))
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    if let Some(first_split) = files.iter().find(|(name, _)| name.contains("-00001-of-")) {
        let prefix = first_split.0.split("-00001-of-").next().unwrap_or("").to_string();
        return files
            .into_iter()
            .filter(|(name, _)| name.starts_with(&prefix) && name.contains("-of-"))
            .collect();
    }

    let preferred = files
        .iter()
        .find(|(name, _)| name.to_lowercase().contains("q4_k_m"))
        .or_else(|| files.iter().find(|(name, _)| name.to_lowercase().contains("q4")))
        .or_else(|| files.iter().find(|(name, _)| name.to_lowercase().contains("q5")))
        .or_else(|| files.iter().find(|(name, _)| name.to_lowercase().contains("q8")))
        .or_else(|| files.first());

    preferred.cloned().into_iter().collect()
}

fn summarize_hf_model(model_data: &serde_json::Value) -> serde_json::Value {
    let selected_files = preferred_gguf_files(model_data);
    let selected_size: u64 = selected_files.iter().map(|(_, size)| *size).sum();
    let selected_file = selected_files.first().map(|(name, _)| name.clone()).unwrap_or_default();
    let quantization = if selected_file.is_empty() {
        model_data["tags"].as_array().and_then(|tags| {
            tags.iter().find_map(|tag| {
                let value = tag.as_str()?;
                if value.contains("q4") || value.contains("q8") || value.contains("fp16") {
                    Some(value.to_uppercase())
                } else {
                    None
                }
            })
        }).unwrap_or_else(|| "Mixed".to_string())
    } else {
        quantization_from_file(&selected_file)
    };

    serde_json::json!({
        "id": model_data["id"],
        "name": model_data["id"],
        "provider": "Hugging Face",
        "size": format_size(selected_size),
        "selectedFile": selected_file,
        "selectedFileCount": selected_files.len(),
        "selectedBytes": selected_size,
        "quantization": quantization,
        "contextLength": model_data["config"].as_object().and_then(|c| c.get("max_position_embeddings")).and_then(|v| v.as_u64()).unwrap_or(4096),
        "status": "available_on_hf",
        "description": format!("Downloads: {} | Pipeline: {}", model_data["downloads"], model_data["pipeline_tag"].as_str().unwrap_or("unknown"))
    })
}

#[tauri::command]
pub async fn get_local_models() -> Result<Vec<serde_json::Value>, String> {
    let registry_path = get_models_dir().join("registry.json");
    if !registry_path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(registry_path).map_err(|e| e.to_string())?;
    let models: Vec<serde_json::Value> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(models)
}

#[tauri::command]
pub async fn search_models(query: String) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://huggingface.co/api/models?search={}&filter=gguf&sort=downloads&direction=-1&limit=20&full=true&expand[]=siblings", query);
    
    let response = client.get(url)
        .header("User-Agent", "genz-silva-os")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let models: Vec<serde_json::Value> = response.json()
        .await
        .map_err(|e| e.to_string())?;

    let results = join_all(models.into_iter().map(|summary| {
        let client = client.clone();
        async move {
            let summary_size: u64 = preferred_gguf_files(&summary).iter().map(|(_, size)| *size).sum();
            if summary_size > 0 {
                return summarize_hf_model(&summary);
            }

            let Some(id) = summary["id"].as_str() else {
                return summarize_hf_model(&summary);
            };

            let detail_url = format!("https://huggingface.co/api/models/{}?blobs=true", id);
            match client.get(detail_url).header("User-Agent", "genz-silva-os").send().await {
                Ok(response) if response.status().is_success() => {
                    match response.json::<serde_json::Value>().await {
                        Ok(detail) => summarize_hf_model(&detail),
                        Err(_) => summarize_hf_model(&summary),
                    }
                }
                _ => summarize_hf_model(&summary),
            }
        }
    })).await;

    Ok(results)
}

#[tauri::command]
pub async fn download_model(id: String) -> Result<(), String> {
    let id_clone = id.clone();
    if let Ok(mut progress) = DOWNLOAD_PROGRESS.lock() {
        progress.insert(id_clone.clone(), 0.0);
    }

    let client = reqwest::Client::new();
    let api_url = format!("https://huggingface.co/api/models/{}", id);
    let response = client.get(api_url)
        .header("User-Agent", "genz-silva-os")
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch model info from HF: {}", e);
            e.to_string()
        })?;

    let model_data: serde_json::Value = response.json().await.map_err(|e| {
        tracing::error!("Failed to parse model JSON: {}", e);
        e.to_string()
    })?;

    let selected_files = preferred_gguf_files(&model_data);

    if selected_files.is_empty() {
        if let Ok(mut progress) = DOWNLOAD_PROGRESS.lock() {
            progress.insert(id_clone.clone(), -1.0);
        }
        return Err("No GGUF file found for this model".to_string());
    }

    let files_to_download: Vec<String> = selected_files.iter().map(|(name, _)| name.clone()).collect();

    let id_for_progress = id_clone.clone();
    let registry_id = id_clone.clone();

    tokio::spawn(async move {
        let set_failed = |message: &str| {
            tracing::error!("{}", message);
            if let Ok(mut progress) = DOWNLOAD_PROGRESS.lock() {
                progress.insert(id_for_progress.clone(), -1.0);
            }
            if let Ok(mut statuses) = DOWNLOAD_STATUS.lock() {
                let status = statuses.entry(id_for_progress.clone()).or_insert(DownloadStatus {
                    id: id_for_progress.clone(),
                    state: "failed".to_string(),
                    current_file: String::new(),
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    speed_bps: 0,
                    error: String::new(),
                });
                status.state = "failed".to_string();
                status.error = message.to_string();
            }
        };

        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3600))
            .user_agent("genz-silva-os")
            .build() {
                Ok(client) => client,
                Err(e) => {
                    set_failed(&format!("Failed to create download client: {}", e));
                    return;
                }
            };

        let mut total_bytes_to_download: u64 = 0;
        let mut all_file_info: Vec<(String, PathBuf, u64)> = vec![];

        tracing::info!("Starting download of {} files for model {}", files_to_download.len(), id_clone);

        for file_name in &files_to_download {
            let download_url = format!("https://huggingface.co/{}/resolve/main/{}", id_clone, file_name);
            let file_path = get_models_dir().join(file_name);

            let mut discovered_size = selected_files
                .iter()
                .find(|(name, _)| name == file_name)
                .map(|(_, size)| *size)
                .unwrap_or(0);
            if let Ok(head_res) = client.head(&download_url).send().await {
                if head_res.status().is_success() {
                    discovered_size = head_res.content_length().unwrap_or(discovered_size);
                }
            }

            all_file_info.push((download_url, file_path, discovered_size));
            total_bytes_to_download += discovered_size;
        }

        if all_file_info.is_empty() {
            set_failed(&format!("No files could be queued for download for {}", registry_id));
            return;
        }

        let total_files = all_file_info.len() as u64;
        let mut total_downloaded: u64 = 0;
        let mut completed_files: u64 = 0;
        let started_at = std::time::Instant::now();

        if let Ok(mut statuses) = DOWNLOAD_STATUS.lock() {
            statuses.insert(id_for_progress.clone(), DownloadStatus {
                id: id_for_progress.clone(),
                state: "downloading".to_string(),
                current_file: files_to_download.first().cloned().unwrap_or_default(),
                downloaded_bytes: 0,
                total_bytes: total_bytes_to_download,
                speed_bps: 0,
                error: String::new(),
            });
        }

        for (url, path, known_size) in all_file_info {
            tracing::info!("Downloading {}...", url);
            let response = match client.get(&url).send().await {
                Ok(response) => response,
                Err(e) => {
                    set_failed(&format!("Failed downloading {}: {}", url, e));
                    return;
                }
            };

            if !response.status().is_success() {
                set_failed(&format!("Download request failed for {} with status {}", url, response.status()));
                return;
            }

            let response_size = response.content_length().unwrap_or(known_size);
            let mut stream = response.bytes_stream();

            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }

            let mut file = match fs::File::create(&path) {
                Ok(file) => file,
                Err(e) => {
                    set_failed(&format!("Failed to create file {:?}: {}", path, e));
                    return;
                }
            };

            use std::io::Write;
            let mut file_downloaded: u64 = 0;
            while let Some(item) = stream.next().await {
                let chunk = match item {
                    Ok(chunk) => chunk,
                    Err(e) => {
                        let _ = fs::remove_file(&path);
                        set_failed(&format!("Stream error while downloading {}: {}", url, e));
                        return;
                    }
                };

                if let Err(e) = file.write_all(&chunk) {
                    let _ = fs::remove_file(&path);
                    set_failed(&format!("Failed writing {:?}: {}", path, e));
                    return;
                }

                total_downloaded += chunk.len() as u64;
                file_downloaded += chunk.len() as u64;

                if let Ok(mut progress) = DOWNLOAD_PROGRESS.lock() {
                    let progress_value = if total_bytes_to_download > 0 {
                        (total_downloaded as f32 / total_bytes_to_download as f32).min(0.99)
                    } else {
                        let file_fraction = if response_size > 0 {
                            (file_downloaded as f32 / response_size as f32).min(1.0)
                        } else {
                            0.0
                        };
                        let completed_fraction = if total_files > 0 {
                            completed_files as f32 / total_files as f32
                        } else {
                            0.0
                        };
                        (completed_fraction + (file_fraction / total_files.max(1) as f32)).min(0.99)
                    };
                    progress.insert(id_for_progress.clone(), progress_value);
                }
                if let Ok(mut statuses) = DOWNLOAD_STATUS.lock() {
                    let elapsed = started_at.elapsed().as_secs().max(1);
                    statuses.insert(id_for_progress.clone(), DownloadStatus {
                        id: id_for_progress.clone(),
                        state: "downloading".to_string(),
                        current_file: path.file_name().and_then(|name| name.to_str()).unwrap_or("").to_string(),
                        downloaded_bytes: total_downloaded,
                        total_bytes: total_bytes_to_download.max(response_size),
                        speed_bps: total_downloaded / elapsed,
                        error: String::new(),
                    });
                }
            }

            if let Err(e) = file.flush() {
                let _ = fs::remove_file(&path);
                set_failed(&format!("Failed to flush {:?}: {}", path, e));
                return;
            }

            completed_files += 1;
            if let Ok(mut progress) = DOWNLOAD_PROGRESS.lock() {
                let completed_fraction = if total_files > 0 {
                    completed_files as f32 / total_files as f32
                } else {
                    0.0
                };
                progress.insert(id_for_progress.clone(), completed_fraction.min(0.99));
            }
        }

        let registry_path = get_models_dir().join("registry.json");
        let mut models: Vec<serde_json::Value> = vec![];
        if registry_path.exists() {
            if let Ok(content) = fs::read_to_string(&registry_path) {
                models = serde_json::from_str(&content).unwrap_or_default();
            }
        }

        let first_file = &files_to_download[0];
        let quantization = {
            let name_lower = first_file.to_lowercase();
            let mut result = "Unknown".to_string();
            for part in name_lower.split('.') {
                if part.starts_with('q') && part.len() > 1 {
                    result = part.to_uppercase();
                    break;
                }
            }
            result
        };

        let model_entry = serde_json::json!({
            "id": registry_id,
            "name": registry_id,
            "path": get_models_dir().join(first_file).to_string_lossy(),
            "status": "available",
            "provider": "Hugging Face",
            "size": if total_bytes_to_download > 1024 * 1024 * 1024 { format!("{:.1} GB", total_bytes_to_download as f64 / 1.0737e9) } else { format!("{:.1} MB", total_bytes_to_download as f64 / 1.0486e6) },
            "quantization": quantization,
            "contextLength": 0,
            "description": "Locally stored model"
        });

        models.retain(|m| m["id"] != registry_id);
        models.push(model_entry);
        if let Ok(json) = serde_json::to_string_pretty(&models) {
            let _ = fs::write(registry_path, json);
        }

        if let Ok(mut progress) = DOWNLOAD_PROGRESS.lock() {
            progress.insert(id_for_progress.clone(), 1.0);
        }
        if let Ok(mut statuses) = DOWNLOAD_STATUS.lock() {
            statuses.insert(id_for_progress.clone(), DownloadStatus {
                id: id_for_progress.clone(),
                state: "complete".to_string(),
                current_file: first_file.clone(),
                downloaded_bytes: total_bytes_to_download,
                total_bytes: total_bytes_to_download,
                speed_bps: 0,
                error: String::new(),
            });
        }
    });

    Ok(())
}

#[tauri::command]
pub fn delete_model(id: String) -> Result<(), String> {
    let registry_path = get_models_dir().join("registry.json");
    if registry_path.exists() {
        let content = fs::read_to_string(&registry_path).map_err(|e| e.to_string())?;
        let mut models: Vec<serde_json::Value> = serde_json::from_str(&content).unwrap_or_default();
        
        if let Some(pos) = models.iter().position(|m| m["id"].as_str() == Some(&id)) {
            let model = models.remove(pos);
            
            // Try to delete the actual file(s)
            if let Some(path_str) = model["path"].as_str() {
                let path = PathBuf::from(path_str);
                if path.exists() {
                    // If it's a split model, delete all related splits
                    if path_str.contains("-00001-of-") {
                        let prefix = path_str.split("-00001-of-").next().unwrap_or("");
                        if let Ok(entries) = fs::read_dir(path.parent().unwrap_or(&PathBuf::from("."))) {
                            for entry in entries.flatten() {
                                let entry_path = entry.path();
                                if let Some(s) = entry_path.to_str() {
                                    if s.starts_with(prefix) && s.ends_with(".gguf") {
                                        let _ = fs::remove_file(entry_path);
                                    }
                                }
                            }
                        }
                    } else {
                        let _ = fs::remove_file(path);
                    }
                }
            }

            let json = serde_json::to_string_pretty(&models).map_err(|e| e.to_string())?;
            fs::write(registry_path, json).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_download_progress(id: String) -> Result<f32, String> {
    if let Ok(progress) = DOWNLOAD_PROGRESS.lock() {
        Ok(*progress.get(&id).unwrap_or(&0.0))
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
pub fn get_download_status(id: String) -> Result<DownloadStatus, String> {
    if let Ok(statuses) = DOWNLOAD_STATUS.lock() {
        if let Some(status) = statuses.get(&id) {
            return Ok(status.clone());
        }
    }

    Ok(DownloadStatus {
        id,
        state: "idle".to_string(),
        current_file: String::new(),
        downloaded_bytes: 0,
        total_bytes: 0,
        speed_bps: 0,
        error: String::new(),
    })
}

#[tauri::command]
pub fn clear_download_progress(id: String) -> Result<(), String> {
    if let Ok(mut progress) = DOWNLOAD_PROGRESS.lock() {
        progress.remove(&id);
    }
    if let Ok(mut statuses) = DOWNLOAD_STATUS.lock() {
        statuses.remove(&id);
    }
    Ok(())
}

#[tauri::command]
pub fn import_local_model(path: String, model_name: Option<String>) -> Result<serde_json::Value, String> {
    let model_path = PathBuf::from(&path);
    if !model_path.exists() {
        return Err("Model file does not exist".to_string());
    }
    if !model_path.is_file() {
        return Err("Provided model path is not a file".to_string());
    }

    let file_name = model_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid model file name".to_string())?
        .to_string();

    let metadata = fs::metadata(&model_path).map_err(|e| e.to_string())?;
    let size_bytes = metadata.len();
    let size = if size_bytes > 1024 * 1024 * 1024 {
        format!("{:.2} GB", size_bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else {
        format!("{:.2} MB", size_bytes as f64 / (1024.0 * 1024.0))
    };

    let id = model_name.clone().unwrap_or_else(|| file_name.clone());
    let quantization = {
        let lower = file_name.to_lowercase();
        if lower.contains("q4") {
            "Q4".to_string()
        } else if lower.contains("q5") {
            "Q5".to_string()
        } else if lower.contains("q6") {
            "Q6".to_string()
        } else if lower.contains("q8") {
            "Q8".to_string()
        } else if lower.contains("fp16") {
            "FP16".to_string()
        } else {
            "Unknown".to_string()
        }
    };

    let model_entry = serde_json::json!({
        "id": id,
        "name": model_name.unwrap_or(file_name),
        "path": model_path.to_string_lossy(),
        "status": "available",
        "provider": "Local Import",
        "size": size,
        "quantization": quantization,
        "contextLength": 0,
        "description": "Imported local model file"
    });

    let registry_path = get_models_dir().join("registry.json");
    let mut models: Vec<serde_json::Value> = vec![];
    if registry_path.exists() {
        if let Ok(content) = fs::read_to_string(&registry_path) {
            models = serde_json::from_str(&content).unwrap_or_default();
        }
    }
    models.retain(|m| m["id"] != model_entry["id"]);
    models.push(model_entry.clone());
    let json = serde_json::to_string_pretty(&models).map_err(|e| e.to_string())?;
    fs::write(registry_path, json).map_err(|e| e.to_string())?;

    Ok(model_entry)
}
