use sysinfo::{System, Disks, Components};

#[tauri::command]
pub fn get_system_info() -> Result<serde_json::Value, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_model = sys.cpus().first().map(|c| c.brand()).unwrap_or("unknown");

    Ok(serde_json::json!({
        "os": std::env::consts::OS,
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "hostname": System::host_name().unwrap_or_else(|| "unknown".to_string()),
        "cpuModel": cpu_model,
        "cpuCores": sys.cpus().len(),
        "memory": {
            "total_kb": sys.total_memory(),
            "used_kb": sys.used_memory(),
            "free_kb": sys.total_memory().saturating_sub(sys.used_memory()),
            "total_gb": (sys.total_memory() as f64) / (1024.0 * 1024.0),
            "used_gb": (sys.used_memory() as f64) / (1024.0 * 1024.0)
        }
    }))
}

#[tauri::command]
pub fn get_hardware_info() -> Result<serde_json::Value, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let components = Components::new_with_refreshed_list();
    let cpu_temp = components.iter()
        .find(|c| c.label().to_lowercase().contains("cpu"))
        .map(|c| c.temperature())
        .unwrap_or(0.0);

    let gpu_info = if cfg!(target_os = "windows") {
        let nvidia_smi = [
            "nvidia-smi".to_string(),
            "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe".to_string(),
            "C:\\Windows\\System32\\nvidia-smi.exe".to_string(),
        ]
        .into_iter()
        .find(|candidate| candidate == "nvidia-smi" || std::path::Path::new(candidate).exists())
        .unwrap_or_else(|| "nvidia-smi".to_string());

        let output = std::process::Command::new(nvidia_smi)
            .arg("--query-gpu=gpu_name,utilization.gpu,memory.used,memory.total,temperature.gpu")
            .arg("--format=csv,noheader,nounits")
            .output();

        if let Ok(out) = output {
            let s = String::from_utf8_lossy(&out.stdout);
            let parts: Vec<&str> = s.split(',').map(|p| p.trim()).collect();
            if parts.len() >= 5 {
                serde_json::json!({
                    "name": parts[0],
                    "usage": parts[1].parse::<i32>().unwrap_or(0),
                    "vram_used": parts[2].parse::<f32>().unwrap_or(0.0) / 1024.0,
                    "vram_total": parts[3].parse::<f32>().unwrap_or(0.0) / 1024.0,
                    "temp": parts[4].parse::<f32>().unwrap_or(0.0)
                })
            } else {
                serde_json::json!({ "name": "Unknown GPU", "usage": 0, "vram_used": 0, "vram_total": 0, "temp": 0 })
            }
        } else {
            serde_json::json!({ "name": "Unknown GPU", "usage": 0, "vram_used": 0, "vram_total": 0, "temp": 0 })
        }
    } else {
        serde_json::json!({ "name": "Unknown GPU", "usage": 0, "vram_used": 0, "vram_total": 0, "temp": 0 })
    };

    Ok(serde_json::json!({
        "cpu": {
            "usage": sys.global_cpu_usage(),
            "temp": cpu_temp,
            "cores": sys.cpus().len()
        },
        // sysinfo reports memory in KiB; convert to bytes for frontend display code.
        "memory_total": sys.total_memory() * 1024,
        "memory_used": sys.used_memory() * 1024,
        "gpu": gpu_info
    }))
}

#[tauri::command]
pub fn get_storage_info() -> Result<serde_json::Value, String> {
    let disks = Disks::new_with_refreshed_list();
    let mut total = 0;
    let mut free = 0;
    
    for disk in &disks {
        total += disk.total_space();
        free += disk.available_space();
    }

    Ok(serde_json::json!({
        "total": total, // Bytes
        "free": free,   // Bytes
    }))
}
