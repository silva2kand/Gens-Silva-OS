#[tauri::command]
pub async fn create_page(parent_id: String, properties: serde_json::Value) -> Result<(), String> {
    let token = std::env::var("NOTION_TOKEN").map_err(|_| "NOTION_TOKEN not found".to_string())?;
    let client = reqwest::Client::new();
    
    let payload = serde_json::json!({
        "parent": { "database_id": parent_id },
        "properties": properties
    });

    client.post("https://api.notion.com/v1/pages")
        .header("Authorization", format!("Bearer {}", token))
        .header("Notion-Version", "2022-06-28")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn query_database(database_id: String, filter: serde_json::Value) -> Result<serde_json::Value, String> {
    let token = std::env::var("NOTION_TOKEN").map_err(|_| "NOTION_TOKEN not found".to_string())?;
    let client = reqwest::Client::new();

    let resp = client.post(format!("https://api.notion.com/v1/databases/{}/query", database_id))
        .header("Authorization", format!("Bearer {}", token))
        .header("Notion-Version", "2022-06-28")
        .json(&filter)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}
