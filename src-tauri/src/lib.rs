// Côté Rust de Loftia Planner.
// MVP : la fenêtre et l'ouverture des liens du Codex dans le navigateur.
// V1 (voir le plan d'application) : synchro Codex (reqwest + scraper), cache des icônes, minuteurs,
// notifications, raccourci global, icône de zone de notification et mise à jour automatique.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
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
