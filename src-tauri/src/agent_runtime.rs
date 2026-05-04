use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use sysinfo::System;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentActivity {
    pub id: String,
    pub at: String,
    pub agent_id: String,
    pub phase: String,
    pub status: String,
    pub message: String,
    pub requires_approval: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskRun {
    pub id: String,
    pub agent_id: String,
    pub goal: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: String,
    pub activities: Vec<AgentActivity>,
    pub result: String,
    pub approvals_required: Vec<String>,
}

static RUNTIME_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("agent_runtime");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
});

fn runs_path(agent_id: &str) -> PathBuf {
    RUNTIME_DIR.join(format!("{}_runs.json", agent_id))
}

fn read_runs(agent_id: &str) -> Result<Vec<AgentTaskRun>, String> {
    let path = runs_path(agent_id);
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_runs(agent_id: &str, runs: &[AgentTaskRun]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(runs).map_err(|e| e.to_string())?;
    fs::write(runs_path(agent_id), json).map_err(|e| e.to_string())
}

fn activity(agent_id: &str, phase: &str, status: &str, message: impl Into<String>, requires_approval: bool) -> AgentActivity {
    AgentActivity {
        id: Uuid::new_v4().to_string(),
        at: chrono::Utc::now().to_rfc3339(),
        agent_id: agent_id.to_string(),
        phase: phase.to_string(),
        status: status.to_string(),
        message: message.into(),
        requires_approval,
    }
}

fn classify_goal(goal: &str) -> Vec<String> {
    let lower = goal.to_lowercase();
    let mut approvals = vec![];
    for (needle, approval) in [
        ("send", "External send requires approval"),
        ("reply", "External reply requires approval before sending"),
        ("archive", "Archive/move/delete requires approval"),
        ("delete", "Delete requires approval"),
        ("label", "Mailbox label changes require approval"),
        ("file", "Court/legal/visa/tax filing requires approval"),
        ("submit", "External submission requires approval"),
        ("install", "Install requires approval"),
    ] {
        if lower.contains(needle) && !approvals.iter().any(|item| item == approval) {
            approvals.push(approval.to_string());
        }
    }
    approvals
}

fn hermes_context(goal: &str, activities: &mut Vec<AgentActivity>) -> String {
    let mut context = String::new();

    match crate::connectors::classic_outlook::classic_outlook_status() {
        Ok(status) => {
            let profile_connected = status["profileConnected"].as_bool().unwrap_or(false);
            activities.push(activity(
                "hermes",
                "classic_outlook",
                if profile_connected { "ready" } else { "needs_outlook" },
                status["message"].as_str().unwrap_or("Classic Outlook desktop status checked."),
                !profile_connected,
            ));
            context.push_str(&format!("Classic Outlook desktop status: {}\n", status));

            if profile_connected {
                match crate::connectors::classic_outlook::search_classic_outlook(goal.to_string(), Some(12)) {
                    Ok(items) => {
                        activities.push(activity(
                            "hermes",
                            "classic_outlook_search",
                            "complete",
                            format!("Searched classic Outlook desktop and found {} matching item(s).", items.len()),
                            false,
                        ));
                        context.push_str("Classic Outlook desktop matches:\n");
                        for item in items {
                            context.push_str("- ");
                            context.push_str(&item.to_string());
                            context.push('\n');
                        }
                    }
                    Err(error) => {
                        activities.push(activity("hermes", "classic_outlook_search", "error", error.clone(), false));
                        context.push_str(&format!("Classic Outlook search error: {}\n", error));
                    }
                }
            }
        }
        Err(error) => {
            activities.push(activity("hermes", "classic_outlook", "error", format!("Classic Outlook status failed: {}", error), false));
            context.push_str(&format!("Classic Outlook status error: {}\n", error));
        }
    }

    match crate::connectors::microsoft_graph::microsoft_graph_status() {
        Ok(status) => {
            let token_connected = status["tokenConnected"].as_bool().unwrap_or(false);
            activities.push(activity(
                "hermes",
                "connector",
                if token_connected { "ready" } else { "needs_sign_in" },
                status["message"].as_str().unwrap_or("Microsoft Graph status checked."),
                !token_connected,
            ));
            context.push_str(&format!("Microsoft Graph status: {}\n", status));
        }
        Err(error) => {
            activities.push(activity("hermes", "connector", "error", format!("Microsoft Graph status failed: {}", error), true));
            context.push_str(&format!("Microsoft Graph error: {}\n", error));
        }
    }

    match crate::connectors::gmail::search_emails(goal.to_string()) {
        Ok(items) => {
            activities.push(activity(
                "hermes",
                "email_archive",
                "complete",
                format!("Searched local email archive and found {} matching item(s).", items.len()),
                false,
            ));
            if items.is_empty() {
                context.push_str("Local email archive search returned no matches.\n");
            } else {
                context.push_str("Local email archive matches:\n");
                for item in items.iter().take(8) {
                    context.push_str("- ");
                    context.push_str(item);
                    context.push('\n');
                }
            }
        }
        Err(error) => {
            activities.push(activity("hermes", "email_archive", "needs_setup", error.clone(), false));
            context.push_str(&format!("Local email archive status: {}\n", error));
        }
    }

    context
}

fn fallback_email_intelligence(emails: &[serde_json::Value]) -> String {
    let mut urgent = vec![];
    let mut flagged = vec![];
    let mut needs_reply = vec![];
    let mut waiting = vec![];
    let mut finance = vec![];
    let mut legal = vec![];
    let mut property = vec![];

    for item in emails {
        let folder = item["folder"].as_str().unwrap_or("");
        let subject = item["subject"].as_str().unwrap_or("");
        let preview = item["preview"].as_str().unwrap_or("");
        let text = format!("{} {}", subject, preview).to_lowercase();
        let line = format!(
            "[{}] {} - {}",
            folder,
            item["sender"].as_str().unwrap_or(""),
            subject
        );

        if item["unread"].as_bool().unwrap_or(false)
            || text.contains("urgent")
            || text.contains("deadline")
            || text.contains("final notice")
            || text.contains("court")
            || text.contains("overdue")
        {
            urgent.push(line.clone());
        }
        if item["flagged"].as_bool().unwrap_or(false)
            || !item["categories"].as_str().unwrap_or("").trim().is_empty()
            || text.contains("pinned")
            || text.contains("saved")
            || text.contains("favourite")
            || text.contains("favorite")
        {
            flagged.push(line.clone());
        }
        if folder == "Inbox"
            && (text.contains("please")
                || text.contains("can you")
                || text.contains("could you")
                || text.contains("?")
                || text.contains("reply")
                || text.contains("respond"))
        {
            needs_reply.push(line.clone());
        }
        if folder == "Sent Items" && (text.contains("follow up") || text.contains("waiting") || text.contains("please confirm") || text.contains("?")) {
            waiting.push(line.clone());
        }
        if text.contains("invoice") || text.contains("receipt") || text.contains("payment") || text.contains("vat") || text.contains("statement") {
            finance.push(line.clone());
        }
        if text.contains("court") || text.contains("claim") || text.contains("solicitor") || text.contains("legal") || text.contains("visa") || text.contains("sponsor") {
            legal.push(line.clone());
        }
        if text.contains("property") || text.contains("rent") || text.contains("lease") || text.contains("premises") || text.contains("shop") {
            property.push(line.clone());
        }
    }

    format!(
        "Hermes Email Intelligence v1 fallback summary\n\nEmails reviewed: {}\n\nUrgent:\n{}\n\nFlagged / pinned / saved signals:\n{}\n\nNeeds reply:\n{}\n\nWaiting for response:\n{}\n\nInvoice/receipt/finance:\n{}\n\nLegal/visa/case:\n{}\n\nProperty/shop/premises:\n{}\n\nDraft replies: Local AI was unavailable, so no full reply drafts were generated. No emails were sent, deleted, archived, or labelled.",
        emails.len(),
        list_lines(&urgent),
        list_lines(&flagged),
        list_lines(&needs_reply),
        list_lines(&waiting),
        list_lines(&finance),
        list_lines(&legal),
        list_lines(&property),
    )
}

fn list_lines(items: &[String]) -> String {
    if items.is_empty() {
        return "- None detected".to_string();
    }
    items.iter().take(10).map(|item| format!("- {}", item)).collect::<Vec<_>>().join("\n")
}

#[tauri::command]
pub async fn run_hermes_email_intelligence(per_folder: Option<usize>) -> Result<AgentTaskRun, String> {
    let agent_id = "hermes".to_string();
    let goal = "Hermes Email Intelligence v1: read latest Classic Outlook Inbox/Sent/Drafts, summarise, detect urgency/replies/waiting/categories, and create draft replies only.".to_string();
    let started_at = chrono::Utc::now().to_rfc3339();
    let mut activities = vec![
        activity(&agent_id, "goal", "received", "Hermes Email Intelligence v1 started.", false),
        activity(&agent_id, "permission", "approval_gated", "Read-only analysis is allowed. Sending, deleting, archiving, moving, or labelling requires explicit approval.", true),
    ];

    let status = crate::connectors::classic_outlook::classic_outlook_status()?;
    let profile_connected = status["profileConnected"].as_bool().unwrap_or(false);
    activities.push(activity(
        &agent_id,
        "classic_outlook",
        if profile_connected { "ready" } else { "needs_outlook" },
        status["message"].as_str().unwrap_or("Classic Outlook status checked."),
        !profile_connected,
    ));
    if !profile_connected {
        let finished_at = chrono::Utc::now().to_rfc3339();
        let run = AgentTaskRun {
            id: Uuid::new_v4().to_string(),
            agent_id: agent_id.clone(),
            goal,
            status: "needs_setup".to_string(),
            started_at,
            finished_at,
            activities,
            result: "Classic Outlook is not ready. Open classic Outlook, sign in to the mailbox profile, then run Hermes Email Intelligence again.".to_string(),
            approvals_required: vec![],
        };
        let mut runs = read_runs(&agent_id)?;
        runs.insert(0, run.clone());
        runs.truncate(50);
        write_runs(&agent_id, &runs)?;
        return Ok(run);
    }

    activities.push(activity(&agent_id, "read_mail", "running", "Reading Classic Outlook end to end: Inbox, Sent, Drafts, Outbox, flagged/category metadata, and all mail folders with safety limits.", false));
    let emails = crate::connectors::classic_outlook::list_classic_outlook_all(per_folder.or(Some(75)), Some(800))?;
    activities.push(activity(
        &agent_id,
        "read_mail",
        "complete",
        format!("Read {} email item(s) across Classic Outlook folders.", emails.len()),
        false,
    ));

    let emails_json = serde_json::to_string_pretty(&emails).map_err(|e| e.to_string())?;
    let prompt = format!(
        "You are Hermes Email Intelligence v1 for Silva. Analyse the Classic Outlook email batch below. This is the free local desktop path, not Microsoft Graph.\n\nRules:\n- Read only. Do not claim anything was sent, deleted, archived, moved, labelled, or submitted.\n- Create reply drafts in text only where useful.\n- Flag every external send/delete/archive/label action as needing Silva approval.\n- Treat Outlook folder path, unread, importance, attachments, categories, flagStatus, flagRequest, and taskDueDate as important signals.\n- Detect and group: urgent, flagged/pinned/saved-style items, needs reply, waiting for response, invoice/receipt/finance, legal/visa/court, property/shop/premises, business opportunities, spam/scam risk.\n- Use Silva's name history when relevant: Silva Kandasamy, Shiva Kandasamy, Siyanthank Kandasamy.\n- Keep it practical: top priorities first, then per-folder summary, then draft replies.\n\nEmail batch JSON:\n{}\n\nReturn exactly these sections:\n1. Executive Summary\n2. Urgent / Important\n3. Flagged / Pinned / Saved Signals\n4. Needs Reply\n5. Waiting For Response\n6. Finance / Invoice / Receipt\n7. Legal / Visa / Case\n8. Property / Shop / Premises\n9. Spam / Scam / Risk\n10. Draft Replies Only\n11. Approval Needed Before Action",
        emails_json
    );

    activities.push(activity(&agent_id, "local_model", "running", "Local AI summarising and classifying the email batch.", false));
    let result = match crate::agents::run_agent(agent_id.clone(), prompt).await {
        Ok(result) => {
            activities.push(activity(&agent_id, "local_model", "complete", "Local AI produced email intelligence summary and draft replies.", false));
            result
        }
        Err(error) => {
            activities.push(activity(&agent_id, "local_model", "fallback", format!("Local AI failed: {}. Used rule-based fallback.", error), false));
            fallback_email_intelligence(&emails)
        }
    };

    let approvals_required = vec![
        "Sending any email reply requires approval".to_string(),
        "Deleting, archiving, moving, or labelling any email requires approval".to_string(),
        "Legal/court/visa/tax/finance submissions require approval and professional double-check where needed".to_string(),
    ];
    activities.push(activity(&agent_id, "drafts", "complete", "Draft replies were produced as text only inside the app. Nothing was sent.", true));

    let finished_at = chrono::Utc::now().to_rfc3339();
    let run = AgentTaskRun {
        id: Uuid::new_v4().to_string(),
        agent_id: agent_id.clone(),
        goal,
        status: "needs_approval".to_string(),
        started_at,
        finished_at,
        activities,
        result,
        approvals_required,
    };

    let mut runs = read_runs(&agent_id)?;
    runs.insert(0, run.clone());
    runs.truncate(50);
    write_runs(&agent_id, &runs)?;

    let _ = crate::notification_center::create_universal_notification_internal(
        "whatsapp".to_string(),
        agent_id.clone(),
        run.id.clone(),
        run.id.clone(),
        "email_approval".to_string(),
        "Hermes email intelligence ready".to_string(),
        format!(
            "Hermes reviewed Classic Outlook end to end and found {} email item(s). Open the app for full summary and draft replies. Nothing was sent or changed.",
            emails.len()
        ),
        None,
        Some(1440),
        Some(true),
    );

    Ok(run)
}

fn extract_first_url(text: &str) -> Option<String> {
    text.split_whitespace()
        .map(|part| part.trim_matches(|ch: char| ch == '"' || ch == '\'' || ch == ',' || ch == ')' || ch == '('))
        .find(|part| part.starts_with("http://") || part.starts_with("https://"))
        .map(ToString::to_string)
}

fn running_process_snapshot(limit: usize) -> serde_json::Value {
    let mut system = System::new_all();
    system.refresh_all();
    let mut processes = system
        .processes()
        .values()
        .map(|process| {
            serde_json::json!({
                "name": process.name().to_string_lossy(),
                "pid": process.pid().as_u32(),
                "exe": process.exe().map(|path| path.to_string_lossy().to_string()).unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();
    processes.sort_by(|a, b| {
        a["name"]
            .as_str()
            .unwrap_or_default()
            .to_lowercase()
            .cmp(&b["name"].as_str().unwrap_or_default().to_lowercase())
    });
    processes.truncate(limit);
    serde_json::json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "processCount": system.processes().len(),
        "processes": processes,
    })
}

#[tauri::command]
pub async fn run_openclaw_computer_operator(goal: String) -> Result<AgentTaskRun, String> {
    let agent_id = "openclaw".to_string();
    let started_at = chrono::Utc::now().to_rfc3339();
    let mut activities = vec![
        activity(&agent_id, "goal", "received", format!("Computer operator goal received: {}", goal), false),
        activity(&agent_id, "permission", "approval_gated", "Safe reads and opening URLs can run. Terminal commands, installs, code changes, sends, deletes, form submissions, spending, and system changes require approval.", true),
    ];

    let mut approvals_required = classify_goal(&goal);
    let lower = goal.to_lowercase();
    for (needle, approval) in [
        ("terminal", "Terminal command requires approval"),
        ("command", "Terminal command requires approval"),
        ("install", "Install requires approval"),
        ("download", "Download requires approval before saving/executing"),
        ("code", "Code changes require approval before editing"),
        ("send", "External send requires approval"),
        ("submit", "External submission requires approval"),
        ("pay", "Spending money requires approval"),
        ("buy", "Spending money requires approval"),
    ] {
        if lower.contains(needle) && !approvals_required.iter().any(|item| item == approval) {
            approvals_required.push(approval.to_string());
        }
    }

    activities.push(activity(&agent_id, "inspect", "running", "Inspecting OS, running desktop apps, and safe operator context.", false));
    let process_snapshot = running_process_snapshot(80);
    activities.push(activity(
        &agent_id,
        "inspect",
        "complete",
        format!(
            "Detected {} running process(es).",
            process_snapshot["processCount"].as_u64().unwrap_or_default()
        ),
        false,
    ));

    let mut action_result = serde_json::json!({});
    if let Some(url) = extract_first_url(&goal) {
        activities.push(activity(&agent_id, "browser", "running", format!("Opening requested URL safely: {}", url), false));
        match crate::connectors::browser::navigate(url.clone()) {
            Ok(_) => {
                activities.push(activity(&agent_id, "browser", "complete", format!("Opened URL: {}", url), false));
                action_result = serde_json::json!({ "openedUrl": url });
            }
            Err(error) => {
                activities.push(activity(&agent_id, "browser", "error", format!("Could not open URL: {}", error), false));
                action_result = serde_json::json!({ "openUrlError": error });
            }
        }
    } else {
        activities.push(activity(&agent_id, "browser", "skipped", "No URL found in the goal. Browser navigation not executed.", false));
    }

    activities.push(activity(&agent_id, "operator_plan", "running", "Local AI is preparing the safe next-step plan.", false));
    let prompt = format!(
        "You are OpenClaw Computer Operator v1 for Silva's local-first AI OS.\n\nGoal:\n{}\n\nSystem/process context:\n{}\n\nAction already attempted:\n{}\n\nCapabilities in v1:\n- Inspect running apps/processes\n- Open URLs safely\n- Use browser fetch/search through app tools\n- Explain terminal/file/code/app actions\n- Queue approval notifications\n\nNot yet full capability:\n- No visual screen OCR/click automation in this v1\n- No arbitrary desktop clicking/typing without a future UI automation bridge\n\nRules:\n- Never claim you clicked, typed, submitted, installed, paid, deleted, or changed code unless an explicit tool result proves it.\n- Produce a concrete plan with risk level and approval gates.\n- If the goal needs terminal/install/code/send/delete/spend/form submission, say approval is required first.\n\nReturn sections:\n1. What I Can Do Now\n2. What I Detected\n3. Actions Already Taken\n4. Approval Needed\n5. Next Safe Steps",
        goal,
        process_snapshot,
        action_result
    );

    let result = match crate::agents::run_agent(agent_id.clone(), prompt).await {
        Ok(result) => {
            activities.push(activity(&agent_id, "operator_plan", "complete", "OpenClaw produced a safe operator plan.", false));
            result
        }
        Err(error) => {
            activities.push(activity(&agent_id, "operator_plan", "fallback", format!("Local AI failed: {}. Used rule-based operator fallback.", error), false));
            format!(
                "OpenClaw Computer Operator v1\n\nWhat I can do now:\n- Inspect running apps/processes\n- Open URLs safely\n- Prepare terminal/browser/file/code steps\n- Route risky actions for approval\n\nDetected:\n{}\n\nActions already taken:\n{}\n\nApproval needed:\n{}\n\nNext safe steps:\n- Tell OpenClaw the exact app/site/task.\n- For terminal, install, code, send, delete, submit, or payment actions, approve the step before execution.",
                process_snapshot,
                action_result,
                if approvals_required.is_empty() { "- None for read-only planning".to_string() } else { list_lines(&approvals_required) }
            )
        }
    };

    let finished_at = chrono::Utc::now().to_rfc3339();
    let run = AgentTaskRun {
        id: Uuid::new_v4().to_string(),
        agent_id: agent_id.clone(),
        goal,
        status: if approvals_required.is_empty() { "complete".to_string() } else { "needs_approval".to_string() },
        started_at,
        finished_at,
        activities,
        result,
        approvals_required,
    };

    let mut runs = read_runs(&agent_id)?;
    runs.insert(0, run.clone());
    runs.truncate(50);
    write_runs(&agent_id, &runs)?;

    if run.status == "needs_approval" {
        let _ = crate::notification_center::create_universal_notification_internal(
            "whatsapp".to_string(),
            agent_id.clone(),
            run.id.clone(),
            run.id.clone(),
            "code_approval".to_string(),
            "OpenClaw computer operator needs approval".to_string(),
            "OpenClaw prepared a computer/operator plan. Risky actions are paused until you approve in the app or reply hub.".to_string(),
            None,
            Some(240),
            Some(true),
        );
    }

    Ok(run)
}

#[tauri::command]
pub async fn run_openclaw_vision_operator(goal: String) -> Result<AgentTaskRun, String> {
    let agent_id = "openclaw".to_string();
    let started_at = chrono::Utc::now().to_rfc3339();
    let mut approvals_required = classify_goal(&goal);
    if !approvals_required.iter().any(|item| item == "Click/type/hotkey actions require screenshot approval") {
        approvals_required.push("Click/type/hotkey actions require screenshot approval".to_string());
    }
    let mut activities = vec![
        activity(&agent_id, "goal", "received", format!("Vision operator goal received: {}", goal), false),
        activity(&agent_id, "safety", "approval_gated", "Observe freely. Click/type only inside allowlisted apps and only after approval. Send/submit/delete/pay/install/code-change always requires approval.", true),
    ];

    activities.push(activity(&agent_id, "screenshot", "running", "Capturing current Windows screen.", false));
    let snapshot = match crate::computer_operator::capture_screen_screenshot() {
        Ok(snapshot) => {
            activities.push(activity(
                &agent_id,
                "screenshot",
                "complete",
                format!("Screenshot saved: {} ({}x{}, hash {}).", snapshot.image_path, snapshot.width, snapshot.height, snapshot.hash),
                false,
            ));
            Some(snapshot)
        }
        Err(error) => {
            activities.push(activity(&agent_id, "screenshot", "error", format!("Screenshot capture failed: {}", error), false));
            None
        }
    };

    let ocr_status = if let Some(snapshot) = &snapshot {
        activities.push(activity(&agent_id, "ocr", "running", "Checking OCR/control detection layer.", false));
        match crate::computer_operator::detect_screen_text(snapshot.image_path.clone()) {
            Ok(status) => {
                let message = status["message"].as_str().unwrap_or("OCR status checked.").to_string();
                activities.push(activity(&agent_id, "ocr", status["status"].as_str().unwrap_or("pending"), message.clone(), false));
                status
            }
            Err(error) => {
                activities.push(activity(&agent_id, "ocr", "error", format!("OCR status failed: {}", error), false));
                serde_json::json!({ "ok": false, "message": error })
            }
        }
    } else {
        serde_json::json!({ "ok": false, "message": "No screenshot available for OCR." })
    };

    let allowlist = crate::computer_operator::list_operator_allowlist().unwrap_or_default();
    activities.push(activity(
        &agent_id,
        "allowlist",
        "complete",
        format!("Loaded {} app allowlist entrie(s).", allowlist.len()),
        false,
    ));

    let prompt = format!(
        "You are OpenClaw Vision + UI Automation v2 for Silva's local-first AI OS.\n\nGoal:\n{}\n\nScreenshot:\n{}\n\nOCR/control detection status:\n{}\n\nAllowlist:\n{}\n\nCurrent capabilities:\n- Screenshot capture works and is replay-logged.\n- App allowlist works.\n- Replay log works.\n- UI actions can be prepared; click/type/hotkey require approval and allowlisted target app.\n- OCR/control detection is not fully wired yet, so do not pretend text/buttons were detected unless provided.\n\nRules:\n- Observe freely.\n- Ask approval before any click/type/hotkey/scroll/drag.\n- Ask approval before send/submit/delete/pay/install/code-change.\n- Never claim an action was executed unless the replay log/tool result proves it.\n\nReturn sections:\n1. Screen Capture\n2. What I Can Infer Safely\n3. Allowed Apps\n4. Proposed UI Steps\n5. Approval Needed\n6. Replay/Audit Notes",
        goal,
        snapshot
            .as_ref()
            .map(|item| serde_json::to_string(item).unwrap_or_default())
            .unwrap_or_else(|| "none".to_string()),
        ocr_status,
        serde_json::to_string_pretty(&allowlist).unwrap_or_default()
    );

    activities.push(activity(&agent_id, "vision_plan", "running", "Local AI preparing visual operator plan.", false));
    let result = match crate::agents::run_agent(agent_id.clone(), prompt).await {
        Ok(result) => {
            activities.push(activity(&agent_id, "vision_plan", "complete", "OpenClaw produced a vision/UI operator plan.", false));
            result
        }
        Err(error) => {
            activities.push(activity(&agent_id, "vision_plan", "fallback", format!("Local AI failed: {}. Used rule-based fallback.", error), false));
            format!(
                "OpenClaw Vision + UI Automation v2\n\nScreen Capture:\n{}\n\nOCR/control detection:\n{}\n\nAllowed Apps:\n{}\n\nProposed UI Steps:\n- Review screenshot in replay log.\n- Identify target app and exact coordinate/control.\n- Request approval before click/type/hotkey.\n\nApproval Needed:\n{}\n\nReplay/Audit Notes:\n- Screenshot and OCR status were logged locally.",
                snapshot
                    .as_ref()
                    .map(|item| item.image_path.clone())
                    .unwrap_or_else(|| "Screenshot failed".to_string()),
                ocr_status,
                serde_json::to_string_pretty(&allowlist).unwrap_or_default(),
                list_lines(&approvals_required)
            )
        }
    };

    let finished_at = chrono::Utc::now().to_rfc3339();
    let run = AgentTaskRun {
        id: Uuid::new_v4().to_string(),
        agent_id: agent_id.clone(),
        goal,
        status: "needs_approval".to_string(),
        started_at,
        finished_at,
        activities,
        result,
        approvals_required,
    };

    let mut runs = read_runs(&agent_id)?;
    runs.insert(0, run.clone());
    runs.truncate(50);
    write_runs(&agent_id, &runs)?;

    let _ = crate::notification_center::create_universal_notification_internal(
        "whatsapp".to_string(),
        agent_id.clone(),
        run.id.clone(),
        run.id.clone(),
        "code_approval".to_string(),
        "OpenClaw vision action needs approval".to_string(),
        "OpenClaw captured the screen and prepared a UI automation plan. Click/type actions are paused until you approve.".to_string(),
        None,
        Some(240),
        Some(true),
    );

    Ok(run)
}

#[tauri::command]
pub fn list_agent_activity(agent_id: String) -> Result<Vec<AgentTaskRun>, String> {
    read_runs(&agent_id)
}

#[tauri::command]
pub async fn run_agent_task(agent_id: String, goal: String) -> Result<AgentTaskRun, String> {
    let started_at = chrono::Utc::now().to_rfc3339();
    let mut activities = vec![
        activity(&agent_id, "goal", "received", format!("Goal received: {}", goal), false),
        activity(&agent_id, "plan", "complete", "Built task plan: check permissions, gather connector context, run agent, return approval-gated result.", false),
    ];
    let approvals_required = classify_goal(&goal);
    for approval in &approvals_required {
        activities.push(activity(&agent_id, "permission", "approval_required", approval, true));
    }

    let context = if agent_id == "hermes" {
        hermes_context(&goal, &mut activities)
    } else {
        activities.push(activity(&agent_id, "connector", "skipped", "No specialist connector preflight exists yet for this agent.", false));
        String::new()
    };

    activities.push(activity(&agent_id, "agent", "running", "Agent reasoning started.", false));
    let prompt = format!(
        "Goal:\n{}\n\nRuntime context:\n{}\n\nReturn: concise result, important findings, drafts only, approvals needed, next actions. Do not claim external actions were sent or completed unless the runtime context proves it.",
        goal, context
    );
    let result = crate::agents::run_agent(agent_id.clone(), prompt).await?;
    activities.push(activity(&agent_id, "agent", "complete", "Agent result created.", false));

    let finished_at = chrono::Utc::now().to_rfc3339();
    let run = AgentTaskRun {
        id: Uuid::new_v4().to_string(),
        agent_id: agent_id.clone(),
        goal,
        status: if approvals_required.is_empty() { "complete".to_string() } else { "needs_approval".to_string() },
        started_at,
        finished_at,
        activities,
        result,
        approvals_required,
    };

    let mut runs = read_runs(&agent_id)?;
    runs.insert(0, run.clone());
    runs.truncate(50);
    write_runs(&agent_id, &runs)?;

    Ok(run)
}
