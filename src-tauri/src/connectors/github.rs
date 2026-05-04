use octocrab::Octocrab;

async fn get_octocrab() -> Result<Octocrab, String> {
    let token = std::env::var("GITHUB_TOKEN").map_err(|_| "GITHUB_TOKEN not found in environment".to_string())?;
    Octocrab::builder()
        .personal_token(token)
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_issue(title: String, body: String, repo_owner: String, repo_name: String) -> Result<(), String> {
    let octo = get_octocrab().await?;
    octo.issues(repo_owner, repo_name)
        .create(title)
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn create_pr(title: String, body: String, head: String, base: String, repo_owner: String, repo_name: String) -> Result<(), String> {
    let octo = get_octocrab().await?;
    octo.pulls(repo_owner, repo_name)
        .create(title, head, base)
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_repo_info(repo_owner: String, repo_name: String) -> Result<serde_json::Value, String> {
    let octo = get_octocrab().await?;
    let repo = octo.repos(repo_owner, repo_name).get().await.map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(repo).map_err(|e| e.to_string())?)
}
