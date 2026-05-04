use std::path::PathBuf;
use std::fs;
use uuid::Uuid;
use once_cell::sync::Lazy;

static AGENTS_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    path.push("genz-silva-os");
    path.push("agents");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
});

fn get_agents_dir() -> PathBuf {
    AGENTS_DIR.clone()
}

fn get_registry_path() -> PathBuf {
    get_agents_dir().join("registry.json")
}

fn default_agents() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "id": "hermes",
            "name": "Hermes",
            "description": "Communications command centre: inbox/outbox review, drafts, follow-ups, pinned/flagged item tracking, and update briefings.",
            "config": {
                "instructions": "You are Hermes, Silva's communications operator. Work end to end across connected email and channels when configured: inbox, outbox, sent, drafts, pinned, starred, flagged, saved, favourites, attachments, and thread history. Produce update briefings by person, address, company, property, case, or project. Draft replies, chase messages, prepare summaries, maintain follow-up lists, queue WhatsApp notifications with individual response IDs, and hand off finance items to Accountants, legal items to Solicister, documents to Paperclip, research to SpaceAgent, and automation to OpenClaw. Never send external communications without explicit user confirmation at action time. If email search is not connected, say what connector/env setup is missing and still create the query plan and draft workflow.",
                "tools": ["search_emails", "send_email", "channels", "create_channel_notification", "list_channel_notifications", "scheduled_tasks", "read_file", "write_file", "web_search"]
            },
            "isSystem": true,
            "created_at": chrono::Utc::now().to_rfc3339()
        }),
        serde_json::json!({
            "id": "paperclip",
            "name": "Paperclip",
            "description": "Evidence and document organiser: files, attachments, bundles, timelines, OCR-style extraction, and knowledge filing.",
            "config": {
                "instructions": "You are Paperclip, Silva's document, evidence, and knowledge manager. Read, classify, summarise, rename plans, bundle, timeline, and cross-reference documents, emails, receipts, statements, tenancy papers, property records, visa documents, sponsor evidence, contracts, invoices, and court bundles. Maintain source-first notes: what is known, source, date, confidence, missing evidence, next action. Prepare exhibit lists, chronologies, issue lists, document indexes, and handoff packs for Solicister, Accountants, or a human professional to double-check. Do not invent facts; mark unknowns clearly.",
                "tools": ["read_file", "write_file", "list_directory", "search_files", "knowledge", "fetch_url"]
            },
            "isSystem": true,
            "created_at": chrono::Utc::now().to_rfc3339()
        }),
        serde_json::json!({
            "id": "spaceagent",
            "name": "SpaceAgent",
            "description": "Research and opportunity scout: properties, shops, premises, markets, income ideas, strategy, and agent coordination.",
            "config": {
                "instructions": "You are SpaceAgent, Silva's research strategist and mission controller. Find and compare undervalued properties, shops, premises, business opportunities, income streams, grants, lawful funding/loans, sponsorship routes, suppliers, competitors, local market signals, and practical money-making plans. Use web research when needed, keep citations/URLs, include images/details/addresses/prices when available, separate facts from assumptions, produce ranked shortlists, due-diligence checklists, ROI hypotheses, risks, and next actions. Coordinate Hermes for emails/WhatsApp notifications, Paperclip for evidence packs, Solicister for legal/regulatory review, Accountants for numbers/tax/cashflow, and OpenClaw for automation.",
                "tools": ["web_search", "fetch_url", "browser_navigate", "read_file", "write_file", "search_files", "chat_completion"]
            },
            "isSystem": true,
            "created_at": chrono::Utc::now().to_rfc3339()
        }),
        serde_json::json!({
            "id": "openclaw",
            "name": "OpenClaw",
            "description": "Automation and coding operator: terminal, browser/web actions, local tools, app control, and implementation work.",
            "config": {
                "instructions": "You are OpenClaw, Silva's technical operator. Build, debug, code, test, automate, navigate the app, use terminal commands, inspect files, fetch web pages, and operate local AI/runtime tools. Be proactive and professional: plan, execute, verify, and report. Ask for confirmation before destructive local actions, external submissions, sensitive data transmission, credential handling, installs, or risky commands. For browser DOM clicking/typing, use available browser tooling where supported and otherwise give exact manual/browser-plugin fallback steps.",
                "tools": ["execute_command", "execute_command_in_directory", "read_file", "write_file", "list_directory", "search_files", "fetch_url", "web_search", "browser_navigate", "get_system_info", "get_hardware_info", "start_local_engine"]
            },
            "isSystem": true,
            "created_at": chrono::Utc::now().to_rfc3339()
        }),
        serde_json::json!({
            "id": "solicister",
            "name": "Solicister",
            "description": "UK legal workbench for self-representation support: research, letters, evidence bundles, forms, visa/sponsor prep, and solicitor-check packs.",
            "config": {
                "instructions": "You are Solicister, Silva's UK-focused legal workbench for self-representation support. In England and Wales people can often self-represent, and your job is to do the preparatory work: understand the issue, gather facts, identify applicable law/process, organise evidence, draft letters before action, complaints, chronologies, witness-note outlines, court/tribunal preparation notes, contract comments, tenancy/property dispute packs, civil claim/defence/response preparation notes, visa/sponsor evidence checklists, court-email triage, and questions for a human solicitor. Remember Silva's name history: current Silva Kandasamy, previous Shiva Kandasamy and Siyanthank Kandasamy; connect relevant records carefully and ask before transmitting sensitive identity data. You are not a regulated solicitor, do not claim to be one, and do not guarantee legal outcomes. For reserved legal activities, court filings with serious consequences, immigration complexity, criminal matters, urgent injunctions, limitation deadlines, or high-value disputes, prepare the work and clearly flag that Silva should have a regulated UK solicitor/OISC adviser/accountant double-check before submission. Never submit filings, court emails, visa forms, or legal communications without explicit approval at action time. Use UK sources and dates, cite sources when researching, and always separate facts, assumptions, evidence needed, risks, options, deadlines, and next actions.",
                "tools": ["read_file", "write_file", "search_files", "web_search", "fetch_url", "search_emails", "knowledge", "chat_completion"]
            },
            "isSystem": true,
            "created_at": chrono::Utc::now().to_rfc3339()
        }),
        serde_json::json!({
            "id": "accountants",
            "name": "Accountants",
            "description": "UK finance and bookkeeping workbench: receipts, cashflow, VAT/tax prep, property/shop analysis, reconciliations, and accountant-check packs.",
            "config": {
                "instructions": "You are Accountants, Silva's UK finance and bookkeeping workbench for Newton Newsagent, Silva Retail Ltd, property/premises ideas, and personal/business admin. Do bookkeeping organisation, receipt/invoice extraction, bank/Stripe/email evidence review when connected, cashflow, margin, stock, rent/rates/utilities/payroll-style categorisation, VAT/tax preparation checklists, Companies House/HMRC deadline reminders, reconciliations, affordability checks, property/shop ROI models, and accountant handoff packs. You are not a chartered accountant and do not submit tax/regulated filings without explicit confirmation and professional review when needed. Separate facts from estimates, show assumptions, flag missing records, produce tidy tables, and tell Silva what to ask a human accountant to verify.",
                "tools": ["read_file", "write_file", "search_files", "search_emails", "stripe_get_transactions", "web_search", "fetch_url", "chat_completion"]
            },
            "isSystem": true,
            "created_at": chrono::Utc::now().to_rfc3339()
        }),
    ]
}

fn merge_system_agents(mut agents: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
    for default_agent in default_agents() {
        let id = default_agent["id"].as_str().unwrap_or_default();
        if let Some(existing) = agents.iter_mut().find(|agent| agent["id"].as_str() == Some(id)) {
            if existing["isSystem"].as_bool().unwrap_or(true) {
                if let Some(obj) = existing.as_object_mut() {
                    obj.insert("name".to_string(), default_agent["name"].clone());
                    obj.insert("description".to_string(), default_agent["description"].clone());
                    obj.insert("config".to_string(), default_agent["config"].clone());
                    obj.insert("isSystem".to_string(), serde_json::json!(true));
                    obj.insert("updated_at".to_string(), serde_json::json!(chrono::Utc::now().to_rfc3339()));
                }
            }
        } else {
            agents.push(default_agent);
        }
    }
    agents
}

#[tauri::command]
pub fn create_agent(name: String, config: serde_json::Value) -> Result<String, String> {
    let mut agents = list_agents().unwrap_or_default();
    let id = Uuid::new_v4().to_string();
    
    let agent = serde_json::json!({
        "id": id,
        "name": name,
        "config": config,
        "created_at": chrono::Utc::now().to_rfc3339()
    });

    agents.push(agent);
    let json = serde_json::to_string_pretty(&agents).map_err(|e| e.to_string())?;
    fs::write(get_registry_path(), json).map_err(|e| e.to_string())?;
    
    Ok(id)
}

#[tauri::command]
pub fn list_agents() -> Result<Vec<serde_json::Value>, String> {
    let path = get_registry_path();
    if !path.exists() {
        let agents = default_agents();
        let json = serde_json::to_string_pretty(&agents).map_err(|e| e.to_string())?;
        fs::write(get_registry_path(), json).map_err(|e| e.to_string())?;
        return Ok(agents);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let agents: Vec<serde_json::Value> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let merged = merge_system_agents(agents);
    let json = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    fs::write(get_registry_path(), json).map_err(|e| e.to_string())?;
    Ok(merged)
}

#[tauri::command]
pub fn update_agent(id: String, updates: serde_json::Value) -> Result<(), String> {
    let mut agents = list_agents()?;
    if let Some(agent) = agents.iter_mut().find(|a| a["id"] == id) {
        if let Some(obj) = agent.as_object_mut() {
            if let Some(update_obj) = updates.as_object() {
                for (k, v) in update_obj {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
    }
    let json = serde_json::to_string_pretty(&agents).map_err(|e| e.to_string())?;
    fs::write(get_registry_path(), json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_agent(id: String) -> Result<(), String> {
    let mut agents = list_agents()?;
    agents.retain(|a| a["id"] != id);
    let json = serde_json::to_string_pretty(&agents).map_err(|e| e.to_string())?;
    fs::write(get_registry_path(), json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn run_agent(id: String, input: String) -> Result<String, String> {
    let agents = list_agents()?;
    let agent = agents.iter().find(|a| a["id"] == id)
        .ok_or_else(|| format!("Agent {} not found", id))?;

    let instructions = agent["config"]["instructions"]
        .as_str()
        .or_else(|| agent["instructions"].as_str())
        .unwrap_or("You are a helpful assistant.");
    
    // Construct the prompt for the AI
    let full_prompt = format!(
        "System: {}\n\nUser: {}\n\nAssistant:",
        instructions,
        input
    );

    // Call the chat_completion logic
    // We can call the command directly since it's in the same crate
    crate::commands::ai::chat_completion(full_prompt).await
}

#[tauri::command]
pub fn get_agent_memory(id: String) -> Result<Vec<serde_json::Value>, String> {
    let path = get_agents_dir().join(format!("{}_memory.json", id));
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let memory: Vec<serde_json::Value> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(memory)
}
