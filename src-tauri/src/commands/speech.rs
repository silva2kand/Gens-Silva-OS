use std::process::Command;

fn ps_escape(value: &str) -> String {
    value.replace('`', "``").replace('\'', "''")
}

#[tauri::command]
pub fn speak_text_native(text: String, language: String, rate: Option<f32>) -> Result<serde_json::Value, String> {
    if !cfg!(target_os = "windows") {
        return Err("Native speech fallback is currently available on Windows only.".to_string());
    }

    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Nothing to speak.".to_string());
    }

    let escaped_text = ps_escape(trimmed);
    let escaped_language = ps_escape(&language);
    let sapi_rate = rate
        .unwrap_or(1.0)
        .clamp(0.5, 1.5);
    let sapi_rate = ((sapi_rate - 1.0) * 8.0).round().clamp(-5.0, 5.0) as i32;

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$text = '{escaped_text}'
$language = '{escaped_language}'
$voice = New-Object -ComObject SAPI.SpVoice
$voices = @($voice.GetVoices())
$selected = $null
foreach ($candidate in $voices) {{
  $description = [string]$candidate.GetDescription()
  $lang = ''
  try {{ $lang = [string]$candidate.GetAttribute('Language') }} catch {{ }}
  if ($language -like 'ta-*' -and ($description -match 'Tamil|Valluvar|ta-IN|ta-LK' -or $lang -match '0449|0849')) {{
    $selected = $candidate
    break
  }}
  if ($language -eq 'en-GB' -and ($description -match 'United Kingdom|English.*UK|Hazel|George|Susan')) {{
    $selected = $candidate
  }}
  if ($language -eq 'en-US' -and ($description -match 'United States|English.*US|David|Zira|Mark')) {{
    $selected = $candidate
  }}
}}
if ($null -ne $selected) {{
  $voice.Voice = $selected
}}
$voice.Rate = {sapi_rate}
$spoken = $voice.Speak($text, 0)
[PSCustomObject]@{{
  ok = $true
  language = $language
  selectedVoice = if ($null -ne $selected) {{ [string]$selected.GetDescription() }} else {{ '' }}
  spoken = $spoken
}} | ConvertTo-Json -Compress
"#
    );

    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-STA")
        .arg("-Command")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "Native Windows speech failed without an error message.".to_string()
        } else {
            stderr
        });
    }

    if stdout.is_empty() {
        return Ok(serde_json::json!({ "ok": true, "language": language, "selectedVoice": "" }));
    }
    serde_json::from_str(&stdout).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_native_voices() -> Result<Vec<serde_json::Value>, String> {
    if !cfg!(target_os = "windows") {
        return Ok(vec![]);
    }

    let script = r#"
$ErrorActionPreference = 'Stop'
$voice = New-Object -ComObject SAPI.SpVoice
@($voice.GetVoices()) | ForEach-Object {
  [PSCustomObject]@{
    description = [string]$_.GetDescription()
    language = [string]$_.GetAttribute('Language')
  }
} | ConvertTo-Json -Compress
"#;

    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-STA")
        .arg("-Command")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "Could not list native Windows voices.".to_string()
        } else {
            stderr
        });
    }
    if stdout.is_empty() {
        return Ok(vec![]);
    }
    let value: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;
    if let Some(items) = value.as_array() {
        Ok(items.clone())
    } else if value.is_object() {
        Ok(vec![value])
    } else {
        Ok(vec![])
    }
}
