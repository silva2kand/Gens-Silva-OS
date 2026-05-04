use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use std::fs;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn send_email(to: String, subject: String, body: String) -> Result<(), String> {
    let smtp_server = std::env::var("SMTP_SERVER").map_err(|_| "SMTP_SERVER not found".to_string())?;
    let smtp_user = std::env::var("SMTP_USER").map_err(|_| "SMTP_USER not found".to_string())?;
    let smtp_pass = std::env::var("SMTP_PASS").map_err(|_| "SMTP_PASS not found".to_string())?;

    let email = Message::builder()
        .from(smtp_user.parse().map_err(|e: lettre::address::AddressError| e.to_string())?)
        .to(to.parse().map_err(|e: lettre::address::AddressError| e.to_string())?)
        .subject(subject)
        .body(body)
        .map_err(|e| e.to_string())?;

    let creds = Credentials::new(smtp_user, smtp_pass);

    let mailer = SmtpTransport::relay(&smtp_server)
        .map_err(|e| e.to_string())?
        .credentials(creds)
        .build();

    mailer.send(&email).map_err(|e| e.to_string())?;
    Ok(())
}

fn email_archive_dir() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("email");
    path
}

fn collect_email_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_email_files(&path, files);
            continue;
        }

        let Some(ext) = path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()) else {
            continue;
        };

        if matches!(ext.as_str(), "eml" | "txt" | "json" | "md") {
            files.push(path);
        }
    }
}

#[tauri::command]
pub fn search_emails(query: String) -> Result<Vec<String>, String> {
    let archive_dir = email_archive_dir();
    let mut files = vec![];
    collect_email_files(&archive_dir, &mut files);

    if files.is_empty() {
        return Ok(vec![format!(
            "No searchable local email archive found at {}. Connect/export email into this folder or configure a future IMAP/OAuth connector. SMTP send can use SMTP_SERVER, SMTP_USER, and SMTP_PASS.",
            archive_dir.to_string_lossy()
        )]);
    }

    let query_lower = query.to_ascii_lowercase();
    let mut matches = vec![];

    for path in files {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        if !content.to_ascii_lowercase().contains(&query_lower) {
            continue;
        }

        let preview = content
            .lines()
            .find(|line| line.to_ascii_lowercase().contains(&query_lower))
            .or_else(|| content.lines().next())
            .unwrap_or("")
            .trim()
            .chars()
            .take(240)
            .collect::<String>();

        matches.push(format!("{} :: {}", path.to_string_lossy(), preview));
        if matches.len() >= 50 {
            break;
        }
    }

    Ok(matches)
}
