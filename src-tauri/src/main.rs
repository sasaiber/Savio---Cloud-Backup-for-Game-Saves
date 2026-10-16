// Hides the black console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod saves;
mod scanner;
mod settings;
mod snapshots;
mod system;
mod watcher;

use std::sync::Arc;
use serde::Serialize;
use serde_json::Value;
use settings::AppPaths;
use snapshots::SnapshotMeta;
use tauri::{AppHandle, Manager, State, WebviewWindow};

/// Everything the interface needs right at startup, in one call.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapInfo {
    settings: Option<Value>,
    system_locale: String,
    accent_color: Option<String>,
    is_system_dark: bool,
    portable: bool,
    data_dir: String,
    version: String,
}

#[tauri::command]
fn bootstrap(app: AppHandle, paths: State<'_, AppPaths>) -> BootstrapInfo {
    BootstrapInfo {
        settings: paths.load_settings(),
        system_locale: system::system_locale(),
        accent_color: system::accent_color(),
        is_system_dark: system::is_system_dark(),
        portable: paths.portable,
        data_dir: paths.data_dir.to_string_lossy().into_owned(),
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
fn save_settings(paths: State<'_, AppPaths>, settings: Value) -> Result<(), String> {
    paths.save_settings(&settings)
}

#[tauri::command]
fn get_accent_color() -> Option<String> {
    system::accent_color()
}

#[tauri::command]
fn set_titlebar_colors(window: WebviewWindow, caption: String, text: String, dark: bool) -> Result<(), String> {
    if let Ok(hwnd) = window.hwnd() {
        if !hwnd.0.is_null() {
            let _ = system::set_titlebar_colors(hwnd.0, &caption, &text, dark);
        }
    }
    Ok(())
}

#[tauri::command]
fn open_data_folder(paths: State<'_, AppPaths>) -> Result<(), String> {
    system::open_in_explorer(&paths.data_dir.to_string_lossy())
}

#[tauri::command]
fn scan_games() -> Vec<scanner::DetectedGame> {
    scanner::scan_all_games()
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    system::open_in_explorer(&path)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageTestResult {
    accessible: bool,
    writable: bool,
    message: String,
}

#[tauri::command]
fn test_storage_target(path: String, username: Option<String>, password: Option<String>) -> StorageTestResult {
    let trimmed = path.trim();
    if trimmed.starts_with(r"\\") {
        if let Err(e) = system::connect_network_share(trimmed, username.as_deref(), password.as_deref()) {
            return StorageTestResult {
                accessible: false,
                writable: false,
                message: e,
            };
        }
    }

    let p = std::path::Path::new(trimmed);
    if !p.exists() {
        match std::fs::create_dir_all(p) {
            Ok(_) => {
                return StorageTestResult {
                    accessible: true,
                    writable: true,
                    message: "Папка успешно создана и доступна для сохранения".to_string(),
                };
            }
            Err(e) => {
                return StorageTestResult {
                    accessible: false,
                    writable: false,
                    message: format!("Путь недоступен: {}", e),
                };
            }
        }
    }

    let test_file = p.join(".savio_test_write");
    match std::fs::write(&test_file, b"savio_ok") {
        Ok(_) => {
            let _ = std::fs::remove_file(&test_file);
            StorageTestResult {
                accessible: true,
                writable: true,
                message: "Хранилище доступно и готово к резервному копированию".to_string(),
            }
        }
        Err(e) => StorageTestResult {
            accessible: true,
            writable: false,
            message: format!("Папка доступна только для чтения: {}", e),
        },
    }
}

#[tauri::command]
fn discover_router_shares(ip: String, username: Option<String>, password: Option<String>) -> Result<Vec<String>, String> {
    system::discover_smb_shares(&ip, username.as_deref(), password.as_deref())
}

#[tauri::command]
fn pick_folder(window: WebviewWindow) -> Option<String> {
    let hwnd = window.hwnd().ok().map(|h| h.0).unwrap_or(std::ptr::null_mut());
    system::native_pick_folder(hwnd)
}

#[tauri::command]
fn inspect_folder(path: String) -> Option<saves::SaveInfo> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }
    let p = std::path::Path::new(trimmed);
    if p.is_dir() {
        saves::calculate_folder_stats(p)
    } else {
        None
    }
}

#[tauri::command]
fn list_snapshots(paths: State<'_, AppPaths>, game_id: String, save_path: Option<String>) -> Vec<SnapshotMeta> {
    snapshots::list_snapshots(&paths.data_dir, &game_id, save_path.as_deref())
}

#[tauri::command]
fn create_snapshot(
    paths: State<'_, AppPaths>,
    game_id: String,
    game_name: String,
    store: Option<String>,
    source_dir: String,
    title: String,
    note: String,
) -> Result<SnapshotMeta, String> {
    snapshots::create_snapshot(
        &paths.data_dir,
        &game_id,
        &game_name,
        store.as_deref(),
        &source_dir,
        &title,
        &note,
        "local",
    )
}

#[tauri::command]
fn restore_snapshot(
    paths: State<'_, AppPaths>,
    game_id: String,
    game_name: String,
    snapshot_id: String,
    target_dir: String,
) -> Result<SnapshotMeta, String> {
    snapshots::restore_snapshot(&paths.data_dir, &game_id, &game_name, &snapshot_id, &target_dir)
}

#[tauri::command]
fn delete_snapshot(
    paths: State<'_, AppPaths>,
    game_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    snapshots::delete_snapshot(&paths.data_dir, &game_id, &snapshot_id)
}

#[tauri::command]
fn export_snapshot(
    paths: State<'_, AppPaths>,
    game_id: String,
    snapshot_id: String,
    dest_path: Option<String>,
) -> Result<String, String> {
    snapshots::export_snapshot_to_zip(&paths.data_dir, &game_id, &snapshot_id, dest_path)
}

#[tauri::command]
fn import_snapshot(
    paths: State<'_, AppPaths>,
    game_id: String,
    game_name: String,
    source_path: String,
    title: String,
    note: String,
) -> Result<SnapshotMeta, String> {
    snapshots::import_snapshot_from_path(&paths.data_dir, &game_id, &game_name, &source_path, &title, &note)
}

#[tauri::command]
fn clone_save_to_desktop(game_name: String, source_dir: String) -> Result<String, String> {
    snapshots::clone_to_desktop(&game_name, &source_dir)
}

#[tauri::command]
fn test_webdav(url: String, user: String, pass: String) -> Result<String, String> {
    snapshots::test_webdav_connection(&url, &user, &pass)
}

#[tauri::command]
fn sync_snapshot_to_cloud(
    paths: State<'_, AppPaths>,
    game_id: String,
    game_name: String,
    store: Option<String>,
    snapshot_id: String,
    target_type: String,
    settings: Value,
) -> Result<String, String> {
    snapshots::sync_snapshot_to_target(
        &paths.data_dir,
        &game_id,
        &game_name,
        store.as_deref(),
        &snapshot_id,
        &target_type,
        &settings,
    )
}


#[tauri::command]
fn gdrive_login_oauth() -> Result<Value, String> {
    snapshots::gdrive_login_oauth()
}

#[tauri::command]
fn gdrive_test_token(access_token: String) -> Result<Value, String> {
    snapshots::gdrive_test_token(&access_token)
}

#[tauri::command]
fn test_mega_login(email: String, pass: String) -> Result<Value, String> {
    snapshots::test_mega_credentials(&email, &pass)
}

#[tauri::command]
fn list_cloud_backups(
    game_id: Option<String>,
    game_name: String,
    store: Option<String>,
    target_type: String,
    settings: Value,
) -> Result<Vec<snapshots::CloudBackupMeta>, String> {
    snapshots::list_cloud_backups(
        game_id.as_deref().unwrap_or(""),
        &game_name,
        store.as_deref(),
        &target_type,
        &settings,
    )
}

#[tauri::command]
fn get_cloud_game_manifest(
    game_id: Option<String>,
    game_name: String,
    store: Option<String>,
    target_type: String,
    settings: Value,
) -> Option<Value> {
    snapshots::get_cloud_game_manifest(
        game_id.as_deref().unwrap_or(""),
        &game_name,
        store.as_deref(),
        &target_type,
        &settings,
    )
}

#[tauri::command]
fn restore_cloud_backup(
    paths: State<'_, AppPaths>,
    game_id: String,
    game_name: String,
    store: Option<String>,
    file_name: String,
    target_dir: String,
    target_type: String,
    settings: Value,
) -> Result<SnapshotMeta, String> {
    snapshots::restore_cloud_backup(
        &paths.data_dir,
        &game_id,
        &game_name,
        store.as_deref(),
        &file_name,
        &target_dir,
        &target_type,
        &settings,
    )
}

#[tauri::command]
fn pick_file(window: WebviewWindow, filter: Option<String>) -> Option<String> {
    let hwnd = window.hwnd().ok().map(|h| h.0).unwrap_or(std::ptr::null_mut());
    system::native_pick_file(hwnd, filter.as_deref())
}

#[tauri::command]
fn register_watched_games(
    watcher_state: State<'_, Arc<watcher::WatcherState>>,
    games: Vec<watcher::WatchedGame>,
) -> Result<(), String> {
    if let Ok(mut guard) = watcher_state.watched_games.lock() {
        *guard = games;
        Ok(())
    } else {
        Err("Mutex poisoned".to_string())
    }
}

#[tauri::command]
fn check_running_games(
    queries: Vec<watcher::GameProcessQuery>,
) -> std::collections::HashMap<String, watcher::GameProcessStatus> {
    let running = watcher::get_running_processes();
    let mut map = std::collections::HashMap::new();
    for q in queries {
        let status = watcher::match_game_process(&q, &running);
        map.insert(q.game_id, status);
    }
    map
}

#[tauri::command]
fn get_game_executables(install_dir: String) -> Vec<String> {
    let p = std::path::Path::new(&install_dir);
    if p.is_dir() {
        watcher::find_executables_in_dir(p, 2)
    } else {
        Vec::new()
    }
}

#[tauri::command]
fn toggle_snapshot_lock(
    paths: State<'_, AppPaths>,
    game_id: String,
    snapshot_id: String,
) -> Result<bool, String> {
    snapshots::toggle_snapshot_lock(&paths.data_dir, &game_id, &snapshot_id)
}

#[tauri::command]
fn toggle_cloud_backup_lock(
    game_name: String,
    store: Option<String>,
    file_name: String,
    target_type: String,
    settings: Value,
) -> Result<String, String> {
    snapshots::toggle_cloud_backup_lock(&game_name, store.as_deref(), &file_name, &target_type, &settings)
}

#[tauri::command]
fn delete_cloud_backup(
    game_name: String,
    store: Option<String>,
    file_name: String,
    target_type: String,
    settings: Value,
) -> Result<(), String> {
    snapshots::delete_cloud_backup(&game_name, store.as_deref(), &file_name, &target_type, &settings)
}

#[tauri::command]
fn has_save_changed(
    paths: State<'_, AppPaths>,
    game_id: String,
    save_path: String,
) -> bool {
    snapshots::has_save_changed(&paths.data_dir, &game_id, &save_path)
}

#[tauri::command]
fn get_autostart_status() -> system::AutostartStatus {
    system::get_autostart_status()
}

#[tauri::command]
fn set_autostart(enabled: bool, minimized: bool) -> Result<(), String> {
    system::set_autostart(enabled, minimized)
}

#[tauri::command]
fn launch_game(target: String) -> Result<(), String> {
    system::launch_game_target(&target)
}

#[tauri::command]
fn factory_reset(paths: State<'_, AppPaths>, wipe_snapshots: bool, wipe_cache: bool) -> Result<(), String> {
    let settings_file = paths.data_dir.join("settings.json");
    if settings_file.exists() {
        let _ = std::fs::remove_file(&settings_file);
    }
    let bak_file = paths.data_dir.join("settings.json.bak");
    if bak_file.exists() {
        let _ = std::fs::remove_file(&bak_file);
    }
    let tmp_file = paths.data_dir.join("settings.json.tmp");
    if tmp_file.exists() {
        let _ = std::fs::remove_file(&tmp_file);
    }

    if wipe_snapshots {
        let snapshots_dir = paths.data_dir.join("snapshots");
        if snapshots_dir.exists() {
            let _ = std::fs::remove_dir_all(&snapshots_dir);
        }
    }

    if wipe_cache {
        let webview_dir = paths.data_dir.join("EBWebView");
        if webview_dir.exists() {
            let _ = std::fs::remove_dir_all(webview_dir.join("Default").join("Cache"));
            let _ = std::fs::remove_dir_all(webview_dir.join("Default").join("Code Cache"));
            let _ = std::fs::remove_dir_all(webview_dir.join("Default").join("GPUCache"));
            let _ = std::fs::remove_dir_all(webview_dir.join("GrShaderCache"));
            let _ = std::fs::remove_dir_all(webview_dir.join("ShaderCache"));
        }
    }

    Ok(())
}

#[tauri::command]
fn get_available_drives() -> Vec<String> {
    system::get_logical_drives()
}

#[tauri::command]
fn scan_pc_games(drives: Vec<String>, custom_paths: Vec<String>) -> Vec<scanner::DetectedGame> {
    scanner::pc_scanner::scan_pc_games(&drives, &custom_paths)
}

#[tauri::command]
fn inspect_archive_metadata(
    paths: State<'_, AppPaths>,
    target_type: String,
    settings: Value,
    game_name: String,
    file_name: String,
    store: Option<String>,
    game_id: Option<String>,
) -> Result<Value, String> {
    snapshots::inspect_archive_metadata(
        &paths.data_dir,
        &target_type,
        &settings,
        &game_name,
        &file_name,
        store.as_deref(),
        game_id.as_deref(),
    )
}



fn write_crash_log(msg: &str) {
    use std::io::Write;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let entry = format!("\n[{}] {}\n", ts, msg);

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("crash.log")) {
                let _ = writeln!(f, "{}", entry);
            }
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let dir = std::path::PathBuf::from(local).join("io.savio.desktop");
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("crash.log")) {
            let _ = writeln!(f, "{}", entry);
        }
    }
}

#[link(name = "kernel32")]
extern "system" {
    fn CreateMutexW(
        lpMutexAttributes: *const std::ffi::c_void,
        bInitialOwner: i32,
        lpName: *const u16,
    ) -> *mut std::ffi::c_void;
    fn GetLastError() -> u32;
}

#[link(name = "user32")]
extern "system" {
    fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> *mut std::ffi::c_void;
    fn ShowWindow(hWnd: *mut std::ffi::c_void, nCmdShow: i32) -> i32;
    fn SetForegroundWindow(hWnd: *mut std::ffi::c_void) -> i32;
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic payload".to_string()
        };
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let backtrace = std::backtrace::Backtrace::capture();
        let msg = format!("PANIC: {}\nLocation: {}\nInfo: {:#?}\nBacktrace:\n{:#?}", payload, location, info, backtrace);
        write_crash_log(&msg);
    }));

    // Single-instance enforcement: prevent multiple processes colliding on EBWebView user data directory
    let mutex_name = system::wide("Global\\Savio_SingleInstance_Mutex");
    let mutex = unsafe { CreateMutexW(std::ptr::null(), 0, mutex_name.as_ptr()) };

    if !mutex.is_null() && unsafe { GetLastError() } == 183 {
        unsafe {
            let title = system::wide("Savio");
            let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
            if !hwnd.is_null() {
                ShowWindow(hwnd, 9); // SW_RESTORE
                SetForegroundWindow(hwnd);
            }
        }
        return;
    }

    let result = std::panic::catch_unwind(|| {
        let watcher_state = Arc::new(watcher::WatcherState::new());
        let watcher_state_clone = Arc::clone(&watcher_state);

        let app = tauri::Builder::default()
            .on_window_event(|window, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            })
            .setup(move |app| {
                let paths = match AppPaths::resolve(app.handle()) {
                    Ok(p) => p,
                    Err(e) => {
                        write_crash_log(&format!("AppPaths error: {:#?}", e));
                        return Err(e);
                    }
                };
                app.manage(paths);
                app.manage(Arc::clone(&watcher_state_clone));
                watcher::start_watcher_thread(app.handle().clone(), watcher_state_clone);

                // Setup system tray icon with context menu
                let open_item = tauri::menu::MenuItem::with_id(app, "open", "Открыть Savio", true, None::<&str>)?;
                let quit_item = tauri::menu::MenuItem::with_id(app, "quit", "Закрыть и остановить синхронизацию", true, None::<&str>)?;
                let menu = tauri::menu::Menu::with_items(app, &[&open_item, &quit_item])?;

                let mut tray_builder = tauri::tray::TrayIconBuilder::new()
                    .tooltip("Savio — Синхронизация сохранений активна")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        match event.id.as_ref() {
                            "open" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } = event {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }

                let _ = tray_builder.build(app)?;

                let is_minimized = std::env::args().any(|a| a == "--minimized" || a == "--tray" || a == "--autostart");
                if let Some(window) = app.get_webview_window("main") {
                    if !is_minimized {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }

                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                bootstrap,
                save_settings,
                get_accent_color,
                set_titlebar_colors,
                open_data_folder,
                scan_games,
                open_folder,
                test_storage_target,
                pick_folder,
                inspect_folder,
                pick_file,
                list_snapshots,
                create_snapshot,
                restore_snapshot,
                delete_snapshot,
                export_snapshot,
                import_snapshot,
                clone_save_to_desktop,
                test_webdav,
                sync_snapshot_to_cloud,
                gdrive_login_oauth,
                gdrive_test_token,
                test_mega_login,
                list_cloud_backups,
                get_cloud_game_manifest,
                restore_cloud_backup,
                register_watched_games,
                check_running_games,
                get_game_executables,
                toggle_snapshot_lock,
                toggle_cloud_backup_lock,
                delete_cloud_backup,
                has_save_changed,
                get_autostart_status,
                set_autostart,
                launch_game,
                factory_reset,
                get_available_drives,
                scan_pc_games,
                discover_router_shares,
                inspect_archive_metadata
            ])
            .run(tauri::generate_context!());

        if let Err(e) = app {
            write_crash_log(&format!("Tauri run error: {:#?}", e));
        }
    });

    if let Err(_) = result {
        write_crash_log(&format!("Panic caught in catch_unwind: payload was caught"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scanner_and_saves() {
        println!("Testing scanner...");
        let games = scanner::scan_all_games();
        println!("Scanned {} games", games.len());
        for g in &games {
            println!("Game: {} | Save: {:?}", g.name, g.save_info.as_ref().map(|s| &s.primary_path));
        }
    }

    #[test]
    fn test_system_functions() {
        let locale = system::system_locale();
        let is_dark = system::is_system_dark();
        let accent = system::accent_color();
        println!("Locale: {}, Dark: {}, Accent: {:?}", locale, is_dark, accent);
    }
}
