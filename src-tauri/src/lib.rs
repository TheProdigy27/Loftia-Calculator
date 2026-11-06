// Côté Rust de Loftia Planner.
// Fenêtre, ouverture des liens du Codex dans le navigateur et mise à jour automatique
// depuis GitHub Releases (plugin updater, déclenché par le front : src/app/state/updater.store.ts).
// V1 (voir le plan d'application) : synchro Codex (reqwest + scraper), cache des icônes, minuteurs,
// notifications, raccourci global et icône de zone de notification.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Loftia Planner");
}
