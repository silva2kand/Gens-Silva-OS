use std::process::Command;

fn run_outlook_script(script: &str, query: Option<&str>) -> Result<String, String> {
    if !cfg!(target_os = "windows") {
        return Err("Classic Outlook desktop bridge is only available on Windows.".to_string());
    }

    let mut command = Command::new("powershell");
    command
        .arg("-NoProfile")
        .arg("-STA")
        .arg("-Command")
        .arg(script);

    if let Some(query) = query {
        command.env("GSOS_OUTLOOK_QUERY", query);
    }

    let output = command.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "Classic Outlook bridge failed without an error message.".to_string()
        } else {
            stderr
        });
    }

    Ok(stdout)
}

#[tauri::command]
pub fn classic_outlook_status() -> Result<serde_json::Value, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$running = [bool](Get-Process OUTLOOK -ErrorAction SilentlyContinue)
$installed = Test-Path 'C:\Program Files\Microsoft Office\root\Office16\OUTLOOK.EXE'
try {
  $outlook = New-Object -ComObject Outlook.Application
  $namespace = $outlook.Session
  $accounts = @()
  foreach ($account in $namespace.Accounts) {
    $accounts += [PSCustomObject]@{
      displayName = [string]$account.DisplayName
      smtpAddress = [string]$account.SmtpAddress
    }
  }
  [PSCustomObject]@{
    installed = $true
    running = $running
    profileConnected = $true
    accounts = $accounts
    message = 'Classic Outlook desktop profile is available. Hermes can use the local desktop bridge for read/search.'
  } | ConvertTo-Json -Depth 4 -Compress
} catch {
  [PSCustomObject]@{
    installed = $installed
    running = $running
    profileConnected = $false
    accounts = @()
    message = $_.Exception.Message
  } | ConvertTo-Json -Depth 4 -Compress
}
"#;

    let output = run_outlook_script(script, None)?;
    serde_json::from_str(&output).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_classic_outlook(query: String, limit: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let limit = limit.unwrap_or(25).clamp(1, 50).to_string();
    let script = format!(r#"
$ErrorActionPreference = 'Stop'
$query = ($env:GSOS_OUTLOOK_QUERY + '').ToLowerInvariant()
$limit = {limit}
$outlook = New-Object -ComObject Outlook.Application
$namespace = $outlook.Session
$folderSpecs = @(
  @{{ name = 'Inbox'; id = 6; time = 'ReceivedTime' }},
  @{{ name = 'Sent Items'; id = 5; time = 'SentOn' }},
  @{{ name = 'Drafts'; id = 16; time = 'CreationTime' }}
)
$results = New-Object System.Collections.Generic.List[object]
foreach ($spec in $folderSpecs) {{
  if ($results.Count -ge $limit) {{ break }}
  try {{
    $folder = $namespace.GetDefaultFolder($spec.id)
    $items = $folder.Items
    try {{ $items.Sort('[' + $spec.time + ']', $true) }} catch {{ }}
    $max = [Math]::Min($items.Count, 250)
    for ($i = 1; $i -le $max -and $results.Count -lt $limit; $i++) {{
      $item = $items.Item($i)
      if ($null -eq $item) {{ continue }}
      $messageClass = [string]$item.MessageClass
      if ($messageClass -and -not $messageClass.StartsWith('IPM.Note')) {{ continue }}
      $subject = [string]$item.Subject
      $sender = [string]$item.SenderName
      $senderEmail = [string]$item.SenderEmailAddress
      $to = [string]$item.To
      $body = [string]$item.Body
      $haystack = ($subject + ' ' + $sender + ' ' + $senderEmail + ' ' + $to + ' ' + $body).ToLowerInvariant()
      if ($query.Length -gt 0 -and -not $haystack.Contains($query)) {{ continue }}
      $timeValue = $null
      try {{ $timeValue = [string]$item.ReceivedTime }} catch {{ }}
      if (-not $timeValue) {{ try {{ $timeValue = [string]$item.SentOn }} catch {{ }} }}
      if (-not $timeValue) {{ try {{ $timeValue = [string]$item.CreationTime }} catch {{ }} }}
      $preview = $body -replace '\s+', ' '
      if ($preview.Length -gt 360) {{ $preview = $preview.Substring(0, 360) }}
      $results.Add([PSCustomObject]@{{
        folder = $spec.name
        subject = $subject
        sender = $sender
        senderEmail = $senderEmail
        to = $to
        time = $timeValue
        preview = $preview
        entryId = [string]$item.EntryID
      }})
    }}
  }} catch {{
    $results.Add([PSCustomObject]@{{
      folder = $spec.name
      subject = 'Folder read failed'
      sender = ''
      senderEmail = ''
      to = ''
      time = ''
      preview = $_.Exception.Message
      entryId = ''
    }})
  }}
}}
$results | ConvertTo-Json -Depth 4 -Compress
"#);

    let output = run_outlook_script(&script, Some(&query))?;
    if output.is_empty() {
        return Ok(vec![]);
    }

    let value: serde_json::Value = serde_json::from_str(&output).map_err(|e| e.to_string())?;
    if let Some(items) = value.as_array() {
        Ok(items.clone())
    } else if value.is_object() {
        Ok(vec![value])
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn list_classic_outlook_latest(per_folder: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let per_folder = per_folder.unwrap_or(10).clamp(1, 25).to_string();
    let script = format!(r#"
$ErrorActionPreference = 'Stop'
$perFolder = {per_folder}
$outlook = New-Object -ComObject Outlook.Application
$namespace = $outlook.Session
$folderSpecs = @(
  @{{ name = 'Inbox'; id = 6; time = 'ReceivedTime' }},
  @{{ name = 'Sent Items'; id = 5; time = 'SentOn' }},
  @{{ name = 'Drafts'; id = 16; time = 'CreationTime' }}
)
$results = New-Object System.Collections.Generic.List[object]
foreach ($spec in $folderSpecs) {{
  try {{
    $folder = $namespace.GetDefaultFolder($spec.id)
    $items = $folder.Items
    try {{ $items.Sort('[' + $spec.time + ']', $true) }} catch {{ }}
    $max = [Math]::Min($items.Count, $perFolder)
    for ($i = 1; $i -le $max; $i++) {{
      $item = $items.Item($i)
      if ($null -eq $item) {{ continue }}
      $messageClass = [string]$item.MessageClass
      if ($messageClass -and -not $messageClass.StartsWith('IPM.Note')) {{ continue }}
      $subject = [string]$item.Subject
      $sender = [string]$item.SenderName
      $senderEmail = [string]$item.SenderEmailAddress
      $to = [string]$item.To
      $cc = [string]$item.CC
      $body = [string]$item.Body
      $timeValue = $null
      try {{ $timeValue = [string]$item.ReceivedTime }} catch {{ }}
      if (-not $timeValue) {{ try {{ $timeValue = [string]$item.SentOn }} catch {{ }} }}
      if (-not $timeValue) {{ try {{ $timeValue = [string]$item.CreationTime }} catch {{ }} }}
      $preview = $body -replace '\s+', ' '
      if ($preview.Length -gt 900) {{ $preview = $preview.Substring(0, 900) }}
      $importance = ''
      $unread = $false
      $hasAttachments = $false
      $categories = ''
      try {{ $importance = [string]$item.Importance }} catch {{ }}
      try {{ $unread = [bool]$item.UnRead }} catch {{ }}
      try {{ $hasAttachments = ([int]$item.Attachments.Count) -gt 0 }} catch {{ }}
      try {{ $categories = [string]$item.Categories }} catch {{ }}
      $results.Add([PSCustomObject]@{{
        folder = $spec.name
        subject = $subject
        sender = $sender
        senderEmail = $senderEmail
        to = $to
        cc = $cc
        time = $timeValue
        preview = $preview
        importance = $importance
        unread = $unread
        hasAttachments = $hasAttachments
        categories = $categories
        entryId = [string]$item.EntryID
      }})
    }}
  }} catch {{
    $results.Add([PSCustomObject]@{{
      folder = $spec.name
      subject = 'Folder read failed'
      sender = ''
      senderEmail = ''
      to = ''
      cc = ''
      time = ''
      preview = $_.Exception.Message
      importance = ''
      unread = $false
      hasAttachments = $false
      categories = ''
      entryId = ''
    }})
  }}
}}
$results | ConvertTo-Json -Depth 4 -Compress
"#);

    let output = run_outlook_script(&script, None)?;
    if output.is_empty() {
        return Ok(vec![]);
    }

    let value: serde_json::Value = serde_json::from_str(&output).map_err(|e| e.to_string())?;
    if let Some(items) = value.as_array() {
        Ok(items.clone())
    } else if value.is_object() {
        Ok(vec![value])
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn list_classic_outlook_all(per_folder: Option<usize>, total_limit: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let per_folder = per_folder.unwrap_or(75).clamp(1, 250).to_string();
    let total_limit = total_limit.unwrap_or(600).clamp(50, 2000).to_string();
    let script = format!(r#"
$ErrorActionPreference = 'Stop'
$perFolder = {per_folder}
$totalLimit = {total_limit}
$outlook = New-Object -ComObject Outlook.Application
$namespace = $outlook.Session
$results = New-Object System.Collections.Generic.List[object]
$visited = New-Object 'System.Collections.Generic.HashSet[string]'

function Add-MailItem($item, $folderPath) {{
  if ($results.Count -ge $totalLimit) {{ return }}
  if ($null -eq $item) {{ return }}
  $messageClass = [string]$item.MessageClass
  if ($messageClass -and -not $messageClass.StartsWith('IPM.Note')) {{ return }}
  $body = [string]$item.Body
  $preview = $body -replace '\s+', ' '
  if ($preview.Length -gt 900) {{ $preview = $preview.Substring(0, 900) }}
  $timeValue = ''
  try {{ $timeValue = [string]$item.ReceivedTime }} catch {{ }}
  if (-not $timeValue) {{ try {{ $timeValue = [string]$item.SentOn }} catch {{ }} }}
  if (-not $timeValue) {{ try {{ $timeValue = [string]$item.CreationTime }} catch {{ }} }}
  $importance = ''
  $unread = $false
  $hasAttachments = $false
  $categories = ''
  $flagStatus = ''
  $flagRequest = ''
  $taskDueDate = ''
  try {{ $importance = [string]$item.Importance }} catch {{ }}
  try {{ $unread = [bool]$item.UnRead }} catch {{ }}
  try {{ $hasAttachments = ([int]$item.Attachments.Count) -gt 0 }} catch {{ }}
  try {{ $categories = [string]$item.Categories }} catch {{ }}
  try {{ $flagStatus = [string]$item.FlagStatus }} catch {{ }}
  try {{ $flagRequest = [string]$item.FlagRequest }} catch {{ }}
  try {{ $taskDueDate = [string]$item.TaskDueDate }} catch {{ }}
  $isFlagged = $false
  try {{ $isFlagged = ([int]$item.FlagStatus) -ne 0 }} catch {{ $isFlagged = -not [string]::IsNullOrWhiteSpace($flagRequest) }}
  $results.Add([PSCustomObject]@{{
    folder = $folderPath
    subject = [string]$item.Subject
    sender = [string]$item.SenderName
    senderEmail = [string]$item.SenderEmailAddress
    to = [string]$item.To
    cc = [string]$item.CC
    time = $timeValue
    preview = $preview
    importance = $importance
    unread = $unread
    hasAttachments = $hasAttachments
    categories = $categories
    flagStatus = $flagStatus
    flagRequest = $flagRequest
    taskDueDate = $taskDueDate
    flagged = $isFlagged
    entryId = [string]$item.EntryID
  }})
}}

function Walk-Folder($folder, $path) {{
  if ($results.Count -ge $totalLimit -or $null -eq $folder) {{ return }}
  $entryId = ''
  try {{ $entryId = [string]$folder.EntryID }} catch {{ $entryId = $path }}
  if ($visited.Contains($entryId)) {{ return }}
  [void]$visited.Add($entryId)

  $folderPath = $path
  try {{
    if ([string]::IsNullOrWhiteSpace($folderPath)) {{ $folderPath = [string]$folder.Name }}
  }} catch {{ }}

  try {{
    $items = $folder.Items
    try {{ $items.Sort('[ReceivedTime]', $true) }} catch {{
      try {{ $items.Sort('[SentOn]', $true) }} catch {{
        try {{ $items.Sort('[CreationTime]', $true) }} catch {{ }}
      }}
    }}
    $max = [Math]::Min($items.Count, $perFolder)
    for ($i = 1; $i -le $max -and $results.Count -lt $totalLimit; $i++) {{
      Add-MailItem $items.Item($i) $folderPath
    }}
  }} catch {{ }}

  try {{
    foreach ($child in $folder.Folders) {{
      $childPath = $folderPath + '\' + [string]$child.Name
      Walk-Folder $child $childPath
    }}
  }} catch {{ }}
}}

$defaultIds = @(6, 5, 16, 4, 3, 23)
foreach ($id in $defaultIds) {{
  try {{
    $folder = $namespace.GetDefaultFolder($id)
    Walk-Folder $folder ([string]$folder.Name)
  }} catch {{ }}
}}

foreach ($store in $namespace.Stores) {{
  if ($results.Count -ge $totalLimit) {{ break }}
  try {{
    $root = $store.GetRootFolder()
    Walk-Folder $root ([string]$root.Name)
  }} catch {{ }}
}}

$results | ConvertTo-Json -Depth 4 -Compress
"#);

    let output = run_outlook_script(&script, None)?;
    if output.is_empty() {
        return Ok(vec![]);
    }

    let value: serde_json::Value = serde_json::from_str(&output).map_err(|e| e.to_string())?;
    if let Some(items) = value.as_array() {
        Ok(items.clone())
    } else if value.is_object() {
        Ok(vec![value])
    } else {
        Ok(vec![])
    }
}
