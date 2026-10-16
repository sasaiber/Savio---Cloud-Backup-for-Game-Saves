use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};

use crate::settings::AppPaths;
use crate::snapshots;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameProcessStatus {
    pub is_running: bool,
    pub pid: Option<u32>,
    pub exe_name: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameProcessQuery {
    pub game_id: String,
    pub game_name: String,
    pub exe_path: Option<String>,
    pub install_dir: Option<String>,
    pub custom_exe_name: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WatchedGame {
    pub game_id: String,
    pub game_name: String,
    #[serde(default)]
    pub store: Option<String>,
    pub save_path: String,
    pub install_dir: Option<String>,
    pub exe_path: Option<String>,
    pub custom_exe_name: Option<String>,
    pub sync_on_exit: bool,
    pub sync_interval_minutes: u32,
    pub auto_cloud_upload: bool,
    pub notify_on_sync: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameSyncEvent {
    pub game_id: String,
    pub game_name: String,
    pub trigger: String, // "exit" | "interval" | "manual"
    pub success: bool,
    pub cloud_target: Option<String>,
    pub message: String,
    pub timestamp: u64,
}

pub struct WatcherState {
    pub watched_games: Arc<Mutex<Vec<WatchedGame>>>,
    pub last_seen_running: Arc<Mutex<HashMap<String, (u32, String)>>>, // game_id -> (pid, exe_name)
    pub last_sync_times: Arc<Mutex<HashMap<String, u64>>>,             // game_id -> epoch seconds
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watched_games: Arc::new(Mutex::new(Vec::new())),
            last_seen_running: Arc::new(Mutex::new(HashMap::new())),
            last_sync_times: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Enumerates all currently running processes in Windows and returns a map of lowercased exe name -> PID.
pub fn get_running_processes() -> HashMap<String, u32> {
    let mut map = HashMap::new();

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return map;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let exe_name = String::from_utf16_lossy(&entry.szExeFile[..len])
                    .trim()
                    .to_lowercase();

                if !exe_name.is_empty() {
                    map.insert(exe_name, entry.th32ProcessID);
                }

                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snapshot);
    }

    map
}

/// Helper: detects common helper/launcher/uninstaller/system process names that must never be treated as the game process
pub fn is_generic_or_launcher_exe(name: &str) -> bool {
    let lower = name.to_lowercase();
    let base = lower.trim_end_matches(".exe");
    matches!(
        base,
        "launcher"
            | "launcherpatcher"
            | "epicgameslauncher"
            | "epicwebhelper"
            | "epiconlineservicesuserhelper"
            | "steam"
            | "steamservice"
            | "steamwebhelper"
            | "upc"
            | "ubisoftgamelauncher"
            | "gog galaxy"
            | "galaxyclient"
            | "eadesktop"
            | "origin"
            | "playgtav"
            | "rockstarservice"
            | "rockstarerrorhandler"
            | "socialclubhelper"
            | "crashreporter"
            | "unitycrashhandler64"
            | "unitycrashhandler32"
            | "unins000"
            | "unins001"
            | "uninstall"
            | "setup"
            | "installer"
            | "update"
            | "updater"
            | "patcher"
            | "eac_server"
            | "easyanticheat"
            | "easyanticheat_eos"
            | "battleye"
            | "cmd"
            | "conhost"
            | "powershell"
            | "explorer"
            | "gameinputredistservice"
            | "gameinputsvc"
            | "gamingservices"
            | "gamingservicesnet"
            | "start_protected_game"
    )
}

/// Checks if a game is running based on its configured exePath, customExeName, or installDir.
pub fn match_game_process(
    query: &GameProcessQuery,
    running: &HashMap<String, u32>,
) -> GameProcessStatus {
    // 1. Explicit custom exe name
    if let Some(custom) = &query.custom_exe_name {
        let clean = custom.trim().to_lowercase();
        if !clean.is_empty() {
            let target = if clean.ends_with(".exe") {
                clean
            } else {
                format!("{}.exe", clean)
            };
            if let Some(&pid) = running.get(&target) {
                return GameProcessStatus {
                    is_running: true,
                    pid: Some(pid),
                    exe_name: Some(target),
                };
            }
            return GameProcessStatus {
                is_running: false,
                pid: None,
                exe_name: None,
            };
        }
    }

    // 2. From configured exe_path
    if let Some(path_str) = &query.exe_path {
        let clean_path = path_str.trim();
        if !clean_path.is_empty() {
            let p = Path::new(clean_path);
            if let Some(file_name) = p.file_name() {
                let target = file_name.to_string_lossy().to_lowercase();
                if target.ends_with(".exe") && !is_generic_or_launcher_exe(&target) {
                    if let Some(&pid) = running.get(&target) {
                        return GameProcessStatus {
                            is_running: true,
                            pid: Some(pid),
                            exe_name: Some(target),
                        };
                    }
                    // Explicitly configured exe_path is not running: DO NOT GUESS!
                    return GameProcessStatus {
                        is_running: false,
                        pid: None,
                        exe_name: None,
                    };
                }
            }
        }
    }

    // 3. From install_dir: check candidate .exe names
    if let Some(install_str) = &query.install_dir {
        let p = Path::new(install_str);
        if p.is_dir() {
            let candidates = find_executables_in_dir(p, 2);
            for cand in candidates {
                let lower = cand.to_lowercase();
                if !is_generic_or_launcher_exe(&lower) {
                    if let Some(&pid) = running.get(&lower) {
                        return GameProcessStatus {
                            is_running: true,
                            pid: Some(pid),
                            exe_name: Some(lower),
                        };
                    }
                }
            }
        }
    }

    // 4. Fallback: try sanitized game name — STRICT EXACT MATCH ONLY
    let sanitized_name = query
        .game_name
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase();

    if sanitized_name.len() >= 4
        && sanitized_name != "game"
        && sanitized_name != "games"
        && sanitized_name != "launcher"
        && sanitized_name != "service"
        && sanitized_name != "system"
        && sanitized_name != "client"
    {
        for (proc_name, &pid) in running {
            let lower_proc = proc_name.to_lowercase();
            if is_generic_or_launcher_exe(&lower_proc) {
                continue;
            }
            let proc_clean = lower_proc
                .trim_end_matches(".exe")
                .chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>();
            if proc_clean == sanitized_name {
                return GameProcessStatus {
                    is_running: true,
                    pid: Some(pid),
                    exe_name: Some(proc_name.clone()),
                };
            }
        }
    }

    GameProcessStatus {
        is_running: false,
        pid: None,
        exe_name: None,
    }
}

/// Recursively discovers .exe files in a game directory up to max_depth.
pub fn find_executables_in_dir(dir: &Path, max_depth: usize) -> Vec<String> {
    let mut results = Vec::new();
    let mut dirs_to_visit = vec![(dir.to_path_buf(), 0)];

    while let Some((current_dir, depth)) = dirs_to_visit.pop() {
        if depth > max_depth {
            continue;
        }

        if let Ok(entries) = std::fs::read_dir(&current_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if ext.to_string_lossy().eq_ignore_ascii_case("exe") {
                            if let Some(name) = path.file_name() {
                                let name_str = name.to_string_lossy().to_string();
                                let lower = name_str.to_lowercase();
                                if !is_generic_or_launcher_exe(&lower)
                                    && !lower.contains("unins")
                                    && !lower.contains("crashreport")
                                    && !lower.contains("unitycrashhandler")
                                    && !lower.contains("dxsetup")
                                    && !lower.contains("vcredist")
                                {
                                    if !results.contains(&name_str) {
                                        results.push(name_str);
                                    }
                                }
                            }
                        }
                    }
                } else if path.is_dir() && depth < max_depth {
                    dirs_to_visit.push((path, depth + 1));
                }
            }
        }
    }

    results
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Starts the background game process watcher thread.
pub fn start_watcher_thread(app: AppHandle, watcher_state: Arc<WatcherState>) {
    std::thread::Builder::new()
        .name("savio-process-watcher".to_string())
        .spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_millis(4000));

                let watched_games_copy: Vec<WatchedGame> = {
                    if let Ok(guard) = watcher_state.watched_games.lock() {
                        guard.clone()
                    } else {
                        Vec::new()
                    }
                };

                if watched_games_copy.is_empty() {
                    continue;
                }

                let running_procs = get_running_processes();
                let now = now_epoch_secs();

                let paths_state = app.try_state::<AppPaths>();
                let paths_opt = paths_state.as_deref();

                for game in &watched_games_copy {
                    let query = GameProcessQuery {
                        game_id: game.game_id.clone(),
                        game_name: game.game_name.clone(),
                        exe_path: game.exe_path.clone(),
                        install_dir: game.install_dir.clone(),
                        custom_exe_name: game.custom_exe_name.clone(),
                    };

                    let status = match_game_process(&query, &running_procs);

                    let was_running = {
                        if let Ok(guard) = watcher_state.last_seen_running.lock() {
                            guard.get(&game.game_id).cloned()
                        } else {
                            None
                        }
                    };

                    // Transition 1: Game just started
                    if was_running.is_none() && status.is_running {
                        if let Ok(mut guard) = watcher_state.last_seen_running.lock() {
                            guard.insert(
                                game.game_id.clone(),
                                (status.pid.unwrap_or(0), status.exe_name.clone().unwrap_or_default()),
                            );
                        }
                        let _ = app.emit(
                            "savio://game-started",
                            serde_json::json!({
                                "gameId": game.game_id,
                                "gameName": game.game_name,
                                "pid": status.pid,
                                "exeName": status.exe_name,
                            }),
                        );
                    }

                    // Transition 2: Game just closed!
                    if was_running.is_some() && !status.is_running {
                        if let Ok(mut guard) = watcher_state.last_seen_running.lock() {
                            guard.remove(&game.game_id);
                        }

                        let _ = app.emit(
                            "savio://game-exited",
                            serde_json::json!({
                                "gameId": game.game_id,
                                "gameName": game.game_name,
                            }),
                        );

                        if game.sync_on_exit && !game.save_path.trim().is_empty() {
                            if let Some(paths) = paths_opt {
                                let skip_unchanged = paths.load_settings()
                                    .and_then(|s| s.get("skipUnchangedSaves").and_then(|v| v.as_bool()))
                                    .unwrap_or(true);

                                if skip_unchanged && !snapshots::has_save_changed(&paths.data_dir, &game.game_id, &game.save_path) {
                                    let _ = app.emit(
                                        "savio://sync-progress",
                                        serde_json::json!({
                                            "gameId": game.game_id,
                                            "gameName": game.game_name,
                                            "status": "skipped",
                                            "stage": "done",
                                            "cloudTarget": null,
                                            "message": "Сохранения не изменились (актуально, как в Steam Cloud)",
                                            "timestamp": now,
                                        }),
                                    );
                                    let _ = app.emit(
                                        "savio://game-synced",
                                        GameSyncEvent {
                                            game_id: game.game_id.clone(),
                                            game_name: game.game_name.clone(),
                                            trigger: "exit".to_string(),
                                            success: true,
                                            cloud_target: None,
                                            message: "Сохранения не изменились (актуально, как в Steam Cloud)".to_string(),
                                            timestamp: now,
                                        },
                                    );
                                } else {
                                    let _ = app.emit(
                                        "savio://sync-progress",
                                        serde_json::json!({
                                            "gameId": game.game_id,
                                            "gameName": game.game_name,
                                            "status": "syncing",
                                            "stage": "creating",
                                            "cloudTarget": null,
                                            "message": format!("Создание автосохранения «{}»...", game.game_name),
                                            "timestamp": now,
                                        }),
                                    );

                                    let time_label = chrono_like_now();
                                    let snap_title = format!("Автоснимок после закрытия игры ({})", time_label);
                                    let snap_res = snapshots::create_snapshot(
                                        &paths.data_dir,
                                        &game.game_id,
                                        &game.game_name,
                                        game.store.as_deref(),
                                        &game.save_path,
                                        &snap_title,
                                        "Автоматическое сохранение при закрытии игры",
                                        "autobackup",
                                    );

                                match snap_res {
                                    Ok(snap) => {
                                        let mut cloud_msg = String::new();
                                        let mut cloud_target_name = None;

                                        if game.auto_cloud_upload {
                                            if let Some(settings_val) = paths.load_settings() {
                                                let target_type = settings_val
                                                    .get("backupTargetType")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("gdrive")
                                                    .to_string();
                                                cloud_target_name = Some(target_type.clone());

                                                let _ = app.emit(
                                                    "savio://sync-progress",
                                                    serde_json::json!({
                                                        "gameId": game.game_id,
                                                        "gameName": game.game_name,
                                                        "status": "syncing",
                                                        "stage": "uploading",
                                                        "cloudTarget": target_type,
                                                        "message": format!("Выгрузка автоснимка ({} файлов) в {}...", snap.file_count, target_type.to_uppercase()),
                                                        "sizeBytes": snap.total_size_bytes,
                                                        "timestamp": now,
                                                    }),
                                                );

                                                match snapshots::sync_snapshot_to_target(
                                                    &paths.data_dir,
                                                    &game.game_id,
                                                    &game.game_name,
                                                    game.store.as_deref(),
                                                    &snap.id,
                                                    &target_type,
                                                    &settings_val,
                                                ) {
                                                    Ok(msg) => cloud_msg = msg,
                                                    Err(e) => cloud_msg = format!("Ошибка облака: {}", e),
                                                }
                                            }
                                        }

                                        if let Ok(mut sync_guard) = watcher_state.last_sync_times.lock() {
                                            sync_guard.insert(game.game_id.clone(), now);
                                        }

                                        let full_msg = if cloud_msg.is_empty() {
                                            format!("Локальный снимок «{}» создан", snap.title)
                                        } else {
                                            format!("Снимок создан и выгружен: {}", cloud_msg)
                                        };

                                        let is_err = cloud_msg.starts_with("Ошибка");
                                        let _ = app.emit(
                                            "savio://sync-progress",
                                            serde_json::json!({
                                                "gameId": game.game_id,
                                                "gameName": game.game_name,
                                                "status": if is_err { "error" } else { "success" },
                                                "stage": "done",
                                                "cloudTarget": cloud_target_name,
                                                "message": full_msg,
                                                "sizeBytes": snap.total_size_bytes,
                                                "timestamp": now,
                                            }),
                                        );

                                        let _ = app.emit(
                                            "savio://game-synced",
                                            GameSyncEvent {
                                                game_id: game.game_id.clone(),
                                                game_name: game.game_name.clone(),
                                                trigger: "exit".to_string(),
                                                success: !is_err,
                                                cloud_target: cloud_target_name,
                                                message: full_msg,
                                                timestamp: now,
                                            },
                                        );
                                    }
                                    Err(e) => {
                                        let _ = app.emit(
                                            "savio://sync-progress",
                                            serde_json::json!({
                                                "gameId": game.game_id,
                                                "gameName": game.game_name,
                                                "status": "error",
                                                "stage": "done",
                                                "cloudTarget": null,
                                                "message": format!("Ошибка автобэкапа: {}", e),
                                                "timestamp": now,
                                            }),
                                        );

                                        let _ = app.emit(
                                            "savio://game-synced",
                                            GameSyncEvent {
                                                game_id: game.game_id.clone(),
                                                game_name: game.game_name.clone(),
                                                trigger: "exit".to_string(),
                                                success: false,
                                                cloud_target: None,
                                                message: format!("Ошибка автобэкапа: {}", e),
                                                timestamp: now,
                                            },
                                        );
                                    }
                                }
                                }
                            }
                        }
                    }

                    // Condition 3: Interval periodic sync while playing or running
                    if status.is_running && game.sync_interval_minutes > 0 && !game.save_path.trim().is_empty() {
                        let last_sync = {
                            if let Ok(guard) = watcher_state.last_sync_times.lock() {
                                guard.get(&game.game_id).copied().unwrap_or(0)
                            } else {
                                0
                            }
                        };

                        let interval_secs = (game.sync_interval_minutes as u64) * 60;
                        if now.saturating_sub(last_sync) >= interval_secs {
                            if let Some(paths) = paths_opt {
                                let skip_unchanged = paths.load_settings()
                                    .and_then(|s| s.get("skipUnchangedSaves").and_then(|v| v.as_bool()))
                                    .unwrap_or(true);

                                if skip_unchanged && !snapshots::has_save_changed(&paths.data_dir, &game.game_id, &game.save_path) {
                                    if let Ok(mut sync_guard) = watcher_state.last_sync_times.lock() {
                                        sync_guard.insert(game.game_id.clone(), now);
                                    }
                                } else {
                                    let time_label = chrono_like_now();
                                    let snap_title = format!("Периодический снимок ({})", time_label);
                                    let snap_res = snapshots::create_snapshot(
                                        &paths.data_dir,
                                        &game.game_id,
                                        &game.game_name,
                                        game.store.as_deref(),
                                        &game.save_path,
                                        &snap_title,
                                        &format!("Синхронизация по расписанию (каждые {} мин.)", game.sync_interval_minutes),
                                        "autobackup",
                                    );

                                if let Ok(snap) = snap_res {
                                    let mut cloud_msg = String::new();
                                    let mut cloud_target_name = None;

                                    if game.auto_cloud_upload {
                                        if let Some(settings_val) = paths.load_settings() {
                                            let target_type = settings_val
                                                .get("backupTargetType")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("gdrive")
                                                .to_string();
                                            cloud_target_name = Some(target_type.clone());

                                            match snapshots::sync_snapshot_to_target(
                                                &paths.data_dir,
                                                &game.game_id,
                                                &game.game_name,
                                                game.store.as_deref(),
                                                &snap.id,
                                                &target_type,
                                                &settings_val,
                                            ) {
                                                Ok(msg) => cloud_msg = msg,
                                                Err(e) => cloud_msg = format!("Ошибка облака: {}", e),
                                            }
                                        }
                                    }

                                    if let Ok(mut sync_guard) = watcher_state.last_sync_times.lock() {
                                        sync_guard.insert(game.game_id.clone(), now);
                                    }

                                    let full_msg = if cloud_msg.is_empty() {
                                        format!("Периодический снимок сохранён")
                                    } else {
                                        format!("Периодический снимок выгружен: {}", cloud_msg)
                                    };

                                    let _ = app.emit(
                                        "savio://game-synced",
                                        GameSyncEvent {
                                            game_id: game.game_id.clone(),
                                            game_name: game.game_name.clone(),
                                            trigger: "interval".to_string(),
                                            success: true,
                                            cloud_target: cloud_target_name,
                                            message: full_msg,
                                            timestamp: now,
                                        },
                                    );
                                }
                                }
                            }
                        }
                    }
                }
            }
        })
        .expect("failed to spawn savio-process-watcher thread");
}

fn chrono_like_now() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Rough local hour/min or timestamp
    let secs = now % 86400;
    let hours = (secs / 3600 + 3) % 24; // approx UTC+3
    let minutes = (secs % 3600) / 60;
    format!("{:02}:{:02}", hours, minutes)
}
