use std::path::Path;
use walkdir::WalkDir;
use chrono::{DateTime, Utc};

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let path = Path::new(&path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<serde_json::Value>, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err("Directory does not exist".to_string());
    }

    let mut entries = Vec::new();
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = metadata.is_dir();
        let size = metadata.len();
        
        let modified: DateTime<Utc> = metadata.modified().map(DateTime::from).unwrap_or_else(|_| Utc::now());
        
        entries.push(serde_json::json!({
            "name": file_name,
            "is_dir": is_dir,
            "size": size,
            "path": entry.path().to_string_lossy(),
            "modified_at": modified.format("%Y-%m-%d %H:%M").to_string()
        }));
    }
    Ok(entries)
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn search_files(query: String, base_path: String) -> Result<Vec<serde_json::Value>, String> {
    let mut results = Vec::new();
    let base_path = Path::new(&base_path);
    
    if !base_path.exists() {
        return Err("Base path does not exist".to_string());
    }

    for entry in WalkDir::new(base_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().to_lowercase().contains(&query.to_lowercase()))
        .take(100) 
    {
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        results.push(serde_json::json!({
            "name": entry.file_name().to_string_lossy(),
            "path": entry.path().to_string_lossy(),
            "is_dir": metadata.is_dir(),
            "size": metadata.len()
        }));
    }
    Ok(results)
}
