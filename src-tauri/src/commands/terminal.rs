#[tauri::command]
pub fn execute_command(command: String) -> Result<serde_json::Value, String> {
    let output = if cfg!(target_os = "windows") {
        std::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(&command)
            .output()
    } else {
        std::process::Command::new("sh")
            .arg("-c")
            .arg(&command)
            .output()
    }.map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let status = output.status.code().unwrap_or(if output.status.success() { 0 } else { 1 });

    Ok(serde_json::json!({
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": status,
        "success": output.status.success()
    }))
}

#[tauri::command]
pub fn execute_command_in_directory(command: String, cwd: String) -> Result<serde_json::Value, String> {
    let mut process = if cfg!(target_os = "windows") {
        let mut command_builder = std::process::Command::new("powershell");
        command_builder
            .arg("-NoProfile")
            .arg("-Command")
            .arg(&command);
        command_builder
    } else {
        let mut command_builder = std::process::Command::new("sh");
        command_builder.arg("-c").arg(&command);
        command_builder
    };

    let output = process
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let status = output.status.code().unwrap_or(if output.status.success() { 0 } else { 1 });

    Ok(serde_json::json!({
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": status,
        "success": output.status.success()
    }))
}

#[tauri::command]
pub fn get_shell_info() -> Result<serde_json::Value, String> {
    let os = std::env::consts::OS;
    let shell = if cfg!(target_os = "windows") { "powershell" } else { "sh" };
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_else(|_| "user".to_string());
    let cwd = std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| ".".to_string());
    let home = dirs::home_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|| cwd.clone());

    let documents = dirs::document_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| format!("{}\\Documents", home));
    let downloads = dirs::download_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| format!("{}\\Downloads", home));
    let desktop = dirs::desktop_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| format!("{}\\Desktop", home));

    Ok(serde_json::json!({
        "os": os,
        "shell": shell,
        "user": user,
        "cwd": cwd,
        "home": home,
        "documents": documents,
        "downloads": downloads,
        "desktop": desktop
    }))
}
