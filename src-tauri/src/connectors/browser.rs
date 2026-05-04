#[tauri::command]
pub fn navigate(url: String) -> Result<(), String> {
    webbrowser::open(&url).map_err(|e| e.to_string())?;
    Ok(())
}

fn percent_encode(input: &str) -> String {
    input
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            b' ' => "+".to_string(),
            _ => format!("%{:02X}", byte),
        })
        .collect()
}

fn html_to_text(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    let mut entity = String::new();
    let mut in_entity = false;

    for ch in html.chars() {
        if in_entity {
            if ch == ';' {
                let decoded = match entity.as_str() {
                    "amp" => "&",
                    "lt" => "<",
                    "gt" => ">",
                    "quot" => "\"",
                    "apos" | "#39" => "'",
                    "nbsp" => " ",
                    _ => "",
                };
                out.push_str(decoded);
                entity.clear();
                in_entity = false;
            } else if entity.len() < 12 {
                entity.push(ch);
            } else {
                entity.clear();
                in_entity = false;
            }
            continue;
        }

        match ch {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            '&' if !in_tag => in_entity = true,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }

    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn extract_title(html: &str) -> String {
    let lower = html.to_lowercase();
    let Some(start) = lower.find("<title") else {
        return String::new();
    };
    let Some(open_end) = lower[start..].find('>') else {
        return String::new();
    };
    let content_start = start + open_end + 1;
    let Some(close) = lower[content_start..].find("</title>") else {
        return String::new();
    };
    html_to_text(&html[content_start..content_start + close])
}

fn extract_links(html: &str, limit: usize) -> Vec<serde_json::Value> {
    let mut links = vec![];
    let mut rest = html;

    while let Some(anchor_start) = rest.to_lowercase().find("<a ") {
        rest = &rest[anchor_start..];
        let lower = rest.to_lowercase();
        let Some(href_pos) = lower.find("href=") else {
            rest = &rest[2..];
            continue;
        };
        let value_start = href_pos + 5;
        let quote = rest[value_start..].chars().next().unwrap_or('"');
        if quote != '"' && quote != '\'' {
            rest = &rest[value_start..];
            continue;
        }
        let after_quote = value_start + quote.len_utf8();
        let Some(value_end) = rest[after_quote..].find(quote) else {
            break;
        };
        let href = rest[after_quote..after_quote + value_end].trim();
        let text_start = rest[after_quote + value_end..].find('>').map(|idx| after_quote + value_end + idx + 1);
        let text = text_start
            .and_then(|idx| rest[idx..].to_lowercase().find("</a>").map(|end| html_to_text(&rest[idx..idx + end])))
            .unwrap_or_default();

        if href.starts_with("http://") || href.starts_with("https://") {
            links.push(serde_json::json!({ "title": text, "url": href }));
            if links.len() >= limit {
                break;
            }
        }
        rest = &rest[after_quote + value_end..];
    }

    links
}

fn absolute_url(base: &str, value: &str) -> String {
    if value.starts_with("http://") || value.starts_with("https://") {
        return value.to_string();
    }
    if value.starts_with("//") {
        return format!("https:{}", value);
    }
    if value.starts_with('/') {
        if let Ok(url) = reqwest::Url::parse(base) {
            return format!(
                "{}://{}{}",
                url.scheme(),
                url.host_str().unwrap_or_default(),
                value
            );
        }
    }
    value.to_string()
}

fn extract_images(html: &str, base_url: &str, limit: usize) -> Vec<serde_json::Value> {
    let mut images = vec![];
    let mut rest = html;

    while let Some(img_start) = rest.to_lowercase().find("<img") {
        rest = &rest[img_start..];
        let Some(tag_end) = rest.find('>') else {
            break;
        };
        let tag = &rest[..tag_end];
        let lower = tag.to_lowercase();
        let src = ["src=", "data-src=", "data-original="]
            .iter()
            .find_map(|attr| {
                let pos = lower.find(attr)?;
                let value_start = pos + attr.len();
                let quote = tag[value_start..].chars().next().unwrap_or('"');
                if quote != '"' && quote != '\'' {
                    return None;
                }
                let after_quote = value_start + quote.len_utf8();
                let value_end = tag[after_quote..].find(quote)?;
                Some(tag[after_quote..after_quote + value_end].trim().to_string())
            })
            .unwrap_or_default();

        if !src.is_empty()
            && !src.starts_with("data:")
            && !src.to_lowercase().contains("logo")
            && !src.to_lowercase().contains("sprite")
        {
            let alt = lower.find("alt=").and_then(|pos| {
                let value_start = pos + 4;
                let quote = tag[value_start..].chars().next().unwrap_or('"');
                if quote != '"' && quote != '\'' {
                    return None;
                }
                let after_quote = value_start + quote.len_utf8();
                let value_end = tag[after_quote..].find(quote)?;
                Some(html_to_text(&tag[after_quote..after_quote + value_end]))
            }).unwrap_or_default();
            images.push(serde_json::json!({
                "url": absolute_url(base_url, &src),
                "alt": alt
            }));
            if images.len() >= limit {
                break;
            }
        }
        rest = &rest[tag_end..];
    }

    images
}

#[tauri::command]
pub async fn fetch_url(url: String) -> Result<serde_json::Value, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http and https URLs can be fetched.".to_string());
    }

    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("genz-silva-os")
        .build()
        .map_err(|e| e.to_string())?
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response.text().await.map_err(|e| e.to_string())?;
    let text = if content_type.contains("html") || body.contains("<html") {
        html_to_text(&body)
    } else {
        body.clone()
    };

    Ok(serde_json::json!({
        "status": status,
        "url": final_url,
        "title": extract_title(&body),
        "contentType": content_type,
        "text": text.chars().take(12000).collect::<String>(),
        "links": extract_links(&body, 30),
        "images": extract_images(&body, &final_url, 12)
    }))
}

#[tauri::command]
pub async fn web_search(query: String) -> Result<Vec<serde_json::Value>, String> {
    let url = format!("https://duckduckgo.com/html/?q={}", percent_encode(&query));
    let fetched = fetch_url(url).await?;
    let links = fetched["links"].as_array().cloned().unwrap_or_default();
    let mut results = vec![];

    for link in links {
        let title = link["title"].as_str().unwrap_or("").trim();
        let target = link["url"].as_str().unwrap_or("").trim();
        if title.is_empty() || target.contains("duckduckgo.com") {
            continue;
        }
        results.push(serde_json::json!({
            "title": title,
            "url": target
        }));
        if results.len() >= 8 {
            break;
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn take_screenshot() -> Result<String, String> {
    Err("Screenshot is not implemented yet. Use the in-app browser plugin for capture automation.".to_string())
}

#[tauri::command]
pub fn click_element(selector: String) -> Result<(), String> {
    Err(format!(
        "DOM click automation is not available in this backend connector yet (selector: {}).",
        selector
    ))
}

#[tauri::command]
pub fn type_text(selector: String, _text: String) -> Result<(), String> {
    Err(format!(
        "DOM typing automation is not available in this backend connector yet (selector: {}).",
        selector
    ))
}
