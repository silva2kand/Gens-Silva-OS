#[tauri::command]
pub async fn create_invoice(customer_id: String, amount: i64) -> Result<(), String> {
    let secret_key = std::env::var("STRIPE_SECRET_KEY").map_err(|_| "STRIPE_SECRET_KEY not found".to_string())?;
    let client = reqwest::Client::new();

    let mut params = std::collections::HashMap::new();
    params.insert("customer", customer_id);
    params.insert("amount", amount.to_string());
    params.insert("currency", "usd".to_string());

    client.post("https://api.stripe.com/v1/invoices")
        .basic_auth(secret_key, Some(""))
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_transactions(limit: u32) -> Result<serde_json::Value, String> {
    let secret_key = std::env::var("STRIPE_SECRET_KEY").map_err(|_| "STRIPE_SECRET_KEY not found".to_string())?;
    let client = reqwest::Client::new();

    let resp = client.get(format!("https://api.stripe.com/v1/charges?limit={}", limit))
        .basic_auth(secret_key, Some(""))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}
