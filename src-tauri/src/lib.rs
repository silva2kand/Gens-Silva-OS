// genz...Silva OS - Tauri Backend
// Main library entry point

mod commands;
mod connectors;
mod agents;
mod models;
mod skills;
mod channels;
mod scheduled_tasks;
mod tool_registry;
mod permissions;
mod agent_runtime;
mod notification_center;
mod computer_operator;
mod run_timeline;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        tracing_subscriber::EnvFilter::new("info,genz_silva=info")
    });
    
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(filter)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            tracing::info!("genz...Silva OS starting...");

            // Initialize app state
            let _app_handle = app.handle().clone();

            // Set up panic hook for better error reporting
            std::panic::set_hook(Box::new(|panic_info| {
                tracing::error!("Application panic: {}", panic_info);
            }));

            tracing::info!("genz...Silva OS initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::file_system::read_file,
            commands::file_system::write_file,
            commands::file_system::list_directory,
            commands::file_system::create_directory,
            commands::file_system::delete_path,
            commands::file_system::search_files,
            commands::terminal::execute_command,
            commands::terminal::execute_command_in_directory,
            commands::terminal::get_shell_info,
            commands::system::get_system_info,
            commands::system::get_hardware_info,
            commands::system::get_storage_info,
            commands::speech::speak_text_native,
            commands::speech::list_native_voices,
            commands::ai::check_ai_status,
            commands::ai::list_models,
            commands::ai::load_model,
            commands::ai::select_loaded_model,
            commands::ai::unload_model,
            commands::ai::chat_completion,
            commands::ai::stream_chat,
            commands::ai::start_chat_stream,
            commands::ai::list_ai_providers,
            commands::ai::list_ai_provider_models,
            commands::ai::set_active_ai_provider,
            commands::ai::set_ai_provider_model,
            commands::ai::set_ai_provider_api_key,
            commands::ai::start_local_engine,
            commands::ai::get_local_engine_diagnostics,
            connectors::github::create_issue,
            connectors::github::create_pr,
            connectors::github::get_repo_info,
            connectors::gmail::send_email,
            connectors::gmail::search_emails,
            connectors::notion::create_page,
            connectors::notion::query_database,
            connectors::stripe::create_invoice,
            connectors::stripe::get_transactions,
            connectors::browser::navigate,
            connectors::browser::fetch_url,
            connectors::browser::web_search,
            connectors::browser::take_screenshot,
            connectors::browser::click_element,
            connectors::browser::type_text,
            connectors::microsoft_graph::get_microsoft_graph_config,
            connectors::microsoft_graph::save_microsoft_graph_config,
            connectors::microsoft_graph::get_microsoft_graph_auth_url,
            connectors::microsoft_graph::microsoft_graph_status,
            connectors::classic_outlook::classic_outlook_status,
            connectors::classic_outlook::search_classic_outlook,
            connectors::classic_outlook::list_classic_outlook_latest,
            connectors::classic_outlook::list_classic_outlook_all,
            agents::create_agent,
            agents::list_agents,
            agents::update_agent,
            agents::delete_agent,
            agents::run_agent,
            agents::get_agent_memory,
            models::get_local_models,
            models::search_models,
            models::download_model,
            models::delete_model,
            models::get_download_progress,
            models::get_download_status,
            models::clear_download_progress,
            models::import_local_model,
            skills::list_skills,
            skills::create_skill,
            skills::get_skill_content,
            skills::save_skill_content,
            skills::validate_skill,
            skills::run_skill,
            skills::list_skill_logs,
            tool_registry::list_tool_registry,
            tool_registry::execute_registered_tool,
            permissions::list_permission_rules,
            permissions::evaluate_permission,
            agent_runtime::list_agent_activity,
            agent_runtime::request_agent_run_control,
            agent_runtime::run_agent_task,
            agent_runtime::run_hermes_email_intelligence,
            agent_runtime::run_openclaw_computer_operator,
            agent_runtime::run_openclaw_vision_operator,
            computer_operator::capture_screen_screenshot,
            computer_operator::detect_screen_text,
            computer_operator::list_operator_allowlist,
            computer_operator::update_operator_allowlist,
            computer_operator::perform_ui_action,
            computer_operator::list_operator_replay_log,
            notification_center::create_universal_notification,
            notification_center::list_universal_notifications,
            notification_center::route_inbound_reply,
            notification_center::dispatch_notification_action,
            run_timeline::add_run_timeline_event,
            run_timeline::list_run_timeline,
            channels::list_channels,
            channels::restore_default_channels,
            channels::check_channel_connections,
            channels::create_channel_notification,
            channels::list_channel_notifications,
            channels::respond_channel_notification,
            channels::create_channel,
            channels::update_channel,
            channels::delete_channel,
            channels::test_channel,
            scheduled_tasks::list_scheduled_tasks,
            scheduled_tasks::create_scheduled_task,
            scheduled_tasks::update_scheduled_task,
            scheduled_tasks::delete_scheduled_task,
            scheduled_tasks::run_scheduled_task_now,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                tracing::info!("Window close requested");
            }
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal: failed to start genz...Silva OS: {}", e);
            std::process::exit(1);
        });
}
