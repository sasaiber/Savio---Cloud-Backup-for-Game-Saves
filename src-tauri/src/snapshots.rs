use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn silent_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub id: String,
    pub game_id: String,
    pub game_name: String,
    pub title: String,
    pub note: String,
    pub created_at: u64,
    pub total_size_bytes: u64,
    pub file_count: usize,
    pub is_active: bool,
    pub source: String, // "local" | "imported" | "autobackup"
    pub snapshot_dir: String,
    #[serde(default)]
    pub store: Option<String>,
    #[serde(default)]
    pub save_folder_name: Option<String>,
    #[serde(default)]
    pub is_locked: bool,
    #[serde(default)]
    pub dir_hash: Option<String>,
    #[serde(default)]
    pub safety_backup_id: Option<String>,
    #[serde(default)]
    pub original_save_path: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct SimpleHasher(u64);

impl SimpleHasher {
    pub fn new() -> Self {
        SimpleHasher(0xcbf29ce484222325)
    }
    pub fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 ^= b as u64;
            self.0 = self.0.wrapping_mul(0x100000001b3);
        }
    }
    pub fn finish(&self) -> u64 {
        self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirSignature {
    pub file_count: usize,
    pub total_bytes: u64,
    pub latest_mtime: u64,
    pub hash_str: String,
}

pub fn compute_dir_signature(dir: &Path) -> Option<DirSignature> {
    if !dir.is_dir() {
        return None;
    }
    let mut file_count = 0;
    let mut total_bytes = 0;
    let mut latest_mtime = 0;
    let mut hasher = SimpleHasher::new();

    fn walk_dir(
        root: &Path,
        current: &Path,
        file_count: &mut usize,
        total_bytes: &mut u64,
        latest_mtime: &mut u64,
        hasher: &mut SimpleHasher,
    ) {
        if let Ok(entries) = fs::read_dir(current) {
            let mut sorted = Vec::new();
            for entry in entries.flatten() {
                sorted.push(entry);
            }
            sorted.sort_by_key(|e| e.file_name());

            for entry in sorted {
                let p = entry.path();
                if p.is_dir() {
                    walk_dir(root, &p, file_count, total_bytes, latest_mtime, hasher);
                } else if p.is_file() {
                    if let Ok(meta) = p.metadata() {
                        let len = meta.len();
                        *file_count += 1;
                        *total_bytes += len;

                        let mtime = meta
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        if mtime > *latest_mtime {
                            *latest_mtime = mtime;
                        }

                        let rel = p.strip_prefix(root).unwrap_or(&p).to_string_lossy();
                        hasher.write(rel.as_bytes());
                        hasher.write(&len.to_le_bytes());
                        hasher.write(&mtime.to_le_bytes());

                        if len > 0 {
                            if let Ok(mut f) = fs::File::open(&p) {
                                let mut buf = [0u8; 4096];
                                if let Ok(n) = f.read(&mut buf) {
                                    hasher.write(&buf[..n]);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    walk_dir(dir, dir, &mut file_count, &mut total_bytes, &mut latest_mtime, &mut hasher);

    Some(DirSignature {
        file_count,
        total_bytes,
        latest_mtime,
        hash_str: format!("{:016x}", hasher.finish()),
    })
}

pub fn has_save_changed(data_dir: &Path, game_id: &str, save_path: &str) -> bool {
    let current_dir = Path::new(save_path);
    let current_sig = match compute_dir_signature(current_dir) {
        Some(s) => s,
        None => return true,
    };

    let snaps = list_snapshots(data_dir, game_id, Some(save_path));
    let latest_snap = match snaps.first() {
        Some(s) => s,
        None => return true,
    };

    if let Some(ref h) = latest_snap.dir_hash {
        if h == &current_sig.hash_str
            && latest_snap.file_count == current_sig.file_count
            && latest_snap.total_size_bytes == current_sig.total_bytes
        {
            return false;
        }
    } else {
        let snap_files = Path::new(&latest_snap.snapshot_dir).join("files");
        if let Some(snap_sig) = compute_dir_signature(&snap_files) {
            if snap_sig.hash_str == current_sig.hash_str
                || (snap_sig.file_count == current_sig.file_count
                    && snap_sig.total_bytes == current_sig.total_bytes)
            {
                return false;
            }
        }
    }

    true
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn get_desktop_dir() -> PathBuf {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let onedrive_desktop = PathBuf::from(&userprofile).join("OneDrive").join("Рабочий стол");
        if onedrive_desktop.is_dir() {
            return onedrive_desktop;
        }
        let onedrive_en = PathBuf::from(&userprofile).join("OneDrive").join("Desktop");
        if onedrive_en.is_dir() {
            return onedrive_en;
        }
        let local_desktop = PathBuf::from(&userprofile).join("Desktop");
        if local_desktop.is_dir() {
            return local_desktop;
        }
        let local_ru = PathBuf::from(&userprofile).join("Рабочий стол");
        if local_ru.is_dir() {
            return local_ru;
        }
    }
    PathBuf::from(r"C:\Users\Default\Desktop")
}

pub fn copy_dir_recursive(src: &Path, dst: &Path, total_size: &mut u64, file_count: &mut usize) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let entry_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if entry_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path, total_size, file_count)?;
        } else if entry_type.is_file() {
            let meta = entry.metadata()?;
            *total_size += meta.len();
            *file_count += 1;
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

pub fn sanitize_filename(name: &str) -> String {
    name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-' && c != '_', "_")
        .trim()
        .to_string()
}

pub fn resolve_service_name(store: Option<&str>, game_id: &str) -> String {
    let s = store.unwrap_or("").trim();
    if s.is_empty() || s.eq_ignore_ascii_case("custom") || game_id.starts_with("custom_") {
        "MyGames".to_string()
    } else {
        match s.to_lowercase().as_str() {
            "steam" => "Steam".to_string(),
            "epic" | "epic games" => "Epic Games".to_string(),
            "gog" | "gog galaxy" => "GOG".to_string(),
            "ubisoft" | "uplay" | "ubisoft connect" => "Ubisoft".to_string(),
            "xbox" | "xbox app" | "microsoft store" => "Xbox".to_string(),
            _ => sanitize_filename(s),
        }
    }
}

pub fn get_short_datetime_string() -> String {
    #[cfg(windows)]
    unsafe {
        let mut st = std::mem::zeroed();
        windows_sys::Win32::System::SystemInformation::GetLocalTime(&mut st);
        format!(
            "{:04}-{:02}-{:02}_{:02}-{:02}",
            st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute
        )
    }
    #[cfg(not(windows))]
    {
        let ts = now_secs();
        format!("{}", ts)
    }
}

pub fn determine_save_folder_name(source_dir: &str, fallback_name: &str) -> String {
    let p = Path::new(source_dir);
    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
        let clean = name.trim();
        if !clean.is_empty() {
            return sanitize_filename(clean);
        }
    }
    sanitize_filename(fallback_name)
}

pub fn pack_snapshot_to_zip(
    snap_folder: &Path,
    folder_name: &str,
    target_zip: &Path,
) -> Result<(), String> {
    let files_parent = snap_folder.join("files");
    let nested_folder = files_parent.join(folder_name);

    if target_zip.exists() {
        let _ = fs::remove_file(target_zip);
    }

    // Embed savio_meta.json in files_parent during archive creation
    let meta_src = snap_folder.join("snapshot.json");
    let stage_meta = files_parent.join("savio_meta.json");
    if meta_src.is_file() {
        let _ = fs::copy(&meta_src, &stage_meta);
    }

    let result = if nested_folder.is_dir() {
        let mut cmd = silent_command("tar.exe");
        cmd.args(&[
            "-acf",
            &target_zip.to_string_lossy(),
            "-C",
            &files_parent.to_string_lossy(),
            folder_name,
        ]);
        if stage_meta.is_file() {
            cmd.arg("savio_meta.json");
        }
        let output = cmd.output().map_err(|e| format!("Не удалось запустить tar.exe: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            Err(format!("Ошибка сжатия zip: {}", err))
        } else {
            Ok(())
        }
    } else {
        // Fallback: stage flat files under folder_name
        let temp_stage = snap_folder.join("temp_stage");
        let stage_inner = temp_stage.join(folder_name);
        let _ = fs::remove_dir_all(&temp_stage);
        let mut sz = 0;
        let mut ct = 0;
        copy_dir_recursive(&files_parent, &stage_inner, &mut sz, &mut ct)
            .map_err(|e| format!("Ошибка создания временной структуры архива: {}", e))?;

        let stage_temp_meta = temp_stage.join("savio_meta.json");
        if meta_src.is_file() {
            let _ = fs::copy(&meta_src, &stage_temp_meta);
        }

        let mut cmd = silent_command("tar.exe");
        cmd.args(&[
            "-acf",
            &target_zip.to_string_lossy(),
            "-C",
            &temp_stage.to_string_lossy(),
            folder_name,
        ]);
        if stage_temp_meta.is_file() {
            cmd.arg("savio_meta.json");
        }
        let output = cmd.output().map_err(|e| format!("Не удалось запустить tar.exe: {}", e))?;
        let _ = fs::remove_dir_all(&temp_stage);

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            Err(format!("Ошибка сжатия zip: {}", err))
        } else {
            Ok(())
        }
    };

    let _ = fs::remove_file(&stage_meta);
    result
}

pub fn verify_archive_integrity(zip_path: &Path) -> Result<(), String> {
    if !zip_path.is_file() {
        return Err("Файл резервной копии не найден на диске".to_string());
    }
    let meta = fs::metadata(zip_path).map_err(|e| format!("Не удалось прочитать файл: {}", e))?;
    let len = meta.len();
    if len < 22 {
        return Err(format!("Защита от повреждений (Corruption Guard): файл повреждён (размер всего {} байт)", len));
    }

    let mut file = fs::File::open(zip_path).map_err(|e| format!("Не удалось открыть файл архива: {}", e))?;
    let mut header = [0u8; 4];
    if file.read_exact(&mut header).is_err() || header[0] != b'P' || header[1] != b'K' {
        return Err("Защита от повреждений (Corruption Guard): файл не является корректным ZIP-архивом (отсутствует заголовок PK)".to_string());
    }

    // Test whole archive structure with tar.exe -tf
    let out = silent_command("tar.exe")
        .args(&["-tf", &zip_path.to_string_lossy()])
        .output();
    if let Ok(o) = out {
        if !o.status.success() {
            let err = String::from_utf8_lossy(&o.stderr);
            let first_err = err.lines().next().unwrap_or("повреждённый zip");
            return Err(format!("Защита от повреждений (Corruption Guard): архив повреждён (сбой целостности): {}", first_err));
        }
    }

    Ok(())
}


pub fn list_snapshots(data_dir: &Path, game_id: &str, save_path: Option<&str>) -> Vec<SnapshotMeta> {
    let mut snapshots = Vec::new();
    let game_snaps_dir = data_dir.join("snapshots").join(game_id);

    if !game_snaps_dir.is_dir() {
        return snapshots;
    }

    let entries = match fs::read_dir(&game_snaps_dir) {
        Ok(e) => e,
        Err(_) => return snapshots,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let meta_file = path.join("snapshot.json");
            if let Ok(content) = fs::read_to_string(&meta_file) {
                if let Ok(meta) = serde_json::from_str::<SnapshotMeta>(&content) {
                    snapshots.push(meta);
                }
            }
        }
    }

    // Sort by created_at descending (latest first)
    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    // Dynamic verification of active status:
    // A snapshot is active in the game IF AND ONLY IF:
    // 1. The save folder actually exists on disk.
    // 2. The save folder is non-empty.
    // 3. The save folder's files match this snapshot.
    let active_snap_id: Option<String> = if let Some(sp) = save_path {
        let clean_sp = sp.trim();
        if clean_sp.is_empty() {
            None
        } else {
            let p = Path::new(clean_sp);
            if p.is_dir() {
                if let Some(current_sig) = compute_dir_signature(p) {
                    if current_sig.file_count > 0 && current_sig.total_bytes > 0 {
                        let mut found_id = None;
                        for snap in &snapshots {
                            if let Some(ref h) = snap.dir_hash {
                                if h == &current_sig.hash_str
                                    && snap.file_count == current_sig.file_count
                                    && snap.total_size_bytes == current_sig.total_bytes
                                {
                                    found_id = Some(snap.id.clone());
                                    break;
                                }
                            } else {
                                // Fallback for legacy snapshots created before dir_hash was introduced:
                                let snap_files = Path::new(&snap.snapshot_dir).join("files");
                                if let Some(snap_sig) = compute_dir_signature(&snap_files) {
                                    if snap_sig.hash_str == current_sig.hash_str
                                        || (snap_sig.file_count == current_sig.file_count
                                            && snap_sig.total_bytes == current_sig.total_bytes)
                                    {
                                        found_id = Some(snap.id.clone());
                                        break;
                                    }
                                } else if snap.file_count == current_sig.file_count
                                    && snap.total_size_bytes == current_sig.total_bytes
                                {
                                    found_id = Some(snap.id.clone());
                                    break;
                                }
                            }
                        }
                        found_id
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        }
    } else {
        None
    };

    for snap in &mut snapshots {
        snap.is_active = active_snap_id.as_ref() == Some(&snap.id);
    }

    snapshots
}

pub fn create_snapshot(
    data_dir: &Path,
    game_id: &str,
    game_name: &str,
    store: Option<&str>,
    source_dir: &str,
    title: &str,
    note: &str,
    source: &str,
) -> Result<SnapshotMeta, String> {
    let src = Path::new(source_dir);
    if !src.is_dir() {
        return Err(format!("Папка сохранений не существует на диске: {}", source_dir));
    }

    let timestamp = now_secs();
    let snap_id = format!("snap_{}_{:x}", timestamp, rand_suffix());
    let snap_folder = data_dir.join("snapshots").join(game_id).join(&snap_id);
    let files_parent = snap_folder.join("files");

    let folder_name = determine_save_folder_name(source_dir, game_name);
    let files_folder = files_parent.join(&folder_name);

    fs::create_dir_all(&files_folder)
        .map_err(|e| format!("Не удалось создать директорию снимка: {}", e))?;

    let mut total_size: u64 = 0;
    let mut file_count: usize = 0;

    copy_dir_recursive(src, &files_folder, &mut total_size, &mut file_count)
        .map_err(|e| format!("Ошибка копирования файлов сохранения: {}", e))?;

    if total_size == 0 || file_count == 0 {
        if source == "watcher" {
            let _ = fs::remove_dir_all(&snap_folder);
            return Err("Защита от повреждений (Corruption Guard): файлы сохранения пусты (0 байт). Игра могла аварийно завершиться. Автосохранение отменено для защиты данных.".to_string());
        }
    }

    let sig = compute_dir_signature(src);
    let dir_hash = sig.map(|s| s.hash_str);

    let meta = SnapshotMeta {
        id: snap_id,
        game_id: game_id.to_string(),
        game_name: game_name.to_string(),
        title: if title.trim().is_empty() {
            format!("Снимок от {}", format_timestamp(timestamp))
        } else {
            title.trim().to_string()
        },
        note: note.trim().to_string(),
        created_at: timestamp,
        total_size_bytes: total_size,
        file_count,
        is_active: source != "imported",
        source: source.to_string(),
        snapshot_dir: snap_folder.to_string_lossy().into_owned(),
        store: store.map(|s| s.to_string()),
        save_folder_name: Some(folder_name),
        is_locked: false,
        dir_hash,
        safety_backup_id: None,
        original_save_path: Some(source_dir.to_string()),
    };

    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Ошибка сериализации метаданных: {}", e))?;

    fs::write(snap_folder.join("snapshot.json"), meta_json)
        .map_err(|e| format!("Не удалось сохранить snapshot.json: {}", e))?;

    let limit = read_local_retention_limit(data_dir);
    if limit > 0 {
        prune_local_snapshots(data_dir, game_id, limit);
    }

    Ok(meta)
}

pub fn restore_snapshot(
    data_dir: &Path,
    game_id: &str,
    game_name: &str,
    snapshot_id: &str,
    target_dir: &str,
) -> Result<SnapshotMeta, String> {
    let target_path = Path::new(target_dir);
    let snap_folder = data_dir.join("snapshots").join(game_id).join(snapshot_id);
    let files_parent = snap_folder.join("files");

    if !files_parent.is_dir() {
        return Err(format!("Файлы снимка не найдены: {}", files_parent.display()));
    }

    let mut safety_snap_id = None;
    // Safety First: take an automatic safety backup of current save files before replacing!
    if target_path.is_dir() {
        if let Ok(safety) = create_snapshot(
            data_dir,
            game_id,
            game_name,
            None,
            target_dir,
            &format!("Автосохранение перед переключением ({})", format_timestamp(now_secs())),
            "Автоматический снимок безопасности, созданный перед активацией другого сохранения",
            "autobackup",
        ) {
            safety_snap_id = Some(safety.id);
        }

        // Remove old files in target_dir
        if let Ok(entries) = fs::read_dir(target_path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let _ = fs::remove_dir_all(p);
                } else if p.is_file() {
                    let _ = fs::remove_file(p);
                }
            }
        }
    } else {
        fs::create_dir_all(target_path)
            .map_err(|e| format!("Не удалось создать целевую папку сохранения: {}", e))?;
    }

    // Determine the source directory to copy files from:
    let mut source_to_copy = files_parent.clone();

    // Check meta for save_folder_name
    let meta_path = snap_folder.join("snapshot.json");
    let mut meta_opt: Option<SnapshotMeta> = None;
    if let Ok(content) = fs::read_to_string(&meta_path) {
        if let Ok(m) = serde_json::from_str::<SnapshotMeta>(&content) {
            if let Some(ref sfn) = m.save_folder_name {
                let candidate = files_parent.join(sfn);
                if candidate.is_dir() {
                    source_to_copy = candidate;
                }
            }
            meta_opt = Some(m);
        }
    }

    if source_to_copy == files_parent {
        // Fallback: check target_dir leaf name or if files_parent has only 1 directory
        let target_leaf = Path::new(target_dir).file_name().and_then(|n| n.to_str()).unwrap_or("");
        let leaf_candidate = files_parent.join(target_leaf);
        if !target_leaf.is_empty() && leaf_candidate.is_dir() {
            source_to_copy = leaf_candidate;
        } else {
            let mut sub_dirs = Vec::new();
            let mut file_entries = 0;
            if let Ok(entries) = fs::read_dir(&files_parent) {
                for e in entries.flatten() {
                    if e.path().is_dir() {
                        sub_dirs.push(e.path());
                    } else if e.path().is_file() {
                        file_entries += 1;
                    }
                }
            }
            if sub_dirs.len() == 1 && file_entries == 0 {
                source_to_copy = sub_dirs.remove(0);
            }
        }
    }

    // Smart target path resolution: if original path ended with save_folder_name (e.g. user ID / profile)
    // but target_path does not, append save_folder_name so nested user ID structure is preserved!
    let mut final_target = target_path.to_path_buf();
    if let Some(ref m) = meta_opt {
        if let Some(ref sfn) = m.save_folder_name {
            let target_leaf = target_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !target_leaf.eq_ignore_ascii_case(sfn) {
                if let Some(ref orig) = m.original_save_path {
                    let orig_leaf = Path::new(orig).file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if orig_leaf.eq_ignore_ascii_case(sfn) {
                        final_target = target_path.join(sfn);
                        if !final_target.is_dir() {
                            let _ = fs::create_dir_all(&final_target);
                        }
                    }
                }
            }
        }
    }

    // Copy snapshot files into final_target
    let mut total_size: u64 = 0;
    let mut file_count: usize = 0;
    copy_dir_recursive(&source_to_copy, &final_target, &mut total_size, &mut file_count)
        .map_err(|e| format!("Ошибка восстановления файлов: {}", e))?;

    // Read meta and mark active
    if let Some(mut meta) = meta_opt {
        meta.is_active = true;
        meta.safety_backup_id = safety_snap_id;
        let _ = fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap_or_default());
        return Ok(meta);
    }

    Err("Снимок восстановлен, но не удалось обновить статус".to_string())
}

pub fn delete_snapshot(data_dir: &Path, game_id: &str, snapshot_id: &str) -> Result<(), String> {
    let snap_folder = data_dir.join("snapshots").join(game_id).join(snapshot_id);
    if snap_folder.is_dir() {
        fs::remove_dir_all(&snap_folder)
            .map_err(|e| format!("Не удалось удалить снимок: {}", e))?;
    }
    Ok(())
}

pub fn read_local_retention_limit(data_dir: &Path) -> usize {
    let settings_file = data_dir.join("settings.json");
    if let Ok(c) = fs::read_to_string(&settings_file) {
        if let Ok(val) = serde_json::from_str::<Value>(&c) {
            if let Some(lim) = val.get("localRetentionLimit").and_then(|v| v.as_u64()) {
                return lim as usize;
            }
        }
    }
    10
}

pub fn prune_local_snapshots(data_dir: &Path, game_id: &str, limit: usize) {
    if limit == 0 {
        return;
    }
    let snaps = list_snapshots(data_dir, game_id, None);
    let unlocked: Vec<SnapshotMeta> = snaps.into_iter().filter(|s| !s.is_locked).collect();
    if unlocked.len() > limit {
        for excess in &unlocked[limit..] {
            let _ = delete_snapshot(data_dir, game_id, &excess.id);
        }
    }
}

pub fn toggle_snapshot_lock(
    data_dir: &Path,
    game_id: &str,
    snapshot_id: &str,
) -> Result<bool, String> {
    let meta_path = data_dir
        .join("snapshots")
        .join(game_id)
        .join(snapshot_id)
        .join("snapshot.json");
    if !meta_path.is_file() {
        return Err("Метаданные снимка не найдены".to_string());
    }
    let content = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Ошибка чтения snapshot.json: {}", e))?;
    let mut meta: SnapshotMeta = serde_json::from_str(&content)
        .map_err(|e| format!("Ошибка парсинга snapshot.json: {}", e))?;

    meta.is_locked = !meta.is_locked;
    let new_val = meta.is_locked;

    let updated_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Ошибка сериализации: {}", e))?;
    fs::write(&meta_path, updated_json)
        .map_err(|e| format!("Ошибка сохранения: {}", e))?;

    Ok(new_val)
}

pub fn export_snapshot_to_zip(
    data_dir: &Path,
    game_id: &str,
    snapshot_id: &str,
    dest_path: Option<String>,
) -> Result<String, String> {
    let snap_folder = data_dir.join("snapshots").join(game_id).join(snapshot_id);
    let files_parent = snap_folder.join("files");

    if !files_parent.is_dir() {
        return Err("Файлы снимка не найдены".to_string());
    }

    let meta_path = snap_folder.join("snapshot.json");
    let (game_name, folder_name) = if let Ok(content) = fs::read_to_string(&meta_path) {
        if let Ok(m) = serde_json::from_str::<SnapshotMeta>(&content) {
            let fn_str = m.save_folder_name.clone().unwrap_or_else(|| sanitize_filename(&m.game_name));
            (m.game_name, fn_str)
        } else {
            (game_id.to_string(), sanitize_filename(game_id))
        }
    } else {
        (game_id.to_string(), sanitize_filename(game_id))
    };

    let dt_str = get_short_datetime_string();
    let zip_filename = format!("{}_{}.zip", sanitize_filename(&game_name), dt_str);

    let target_zip = if let Some(p) = dest_path {
        PathBuf::from(p)
    } else {
        get_desktop_dir().join(&zip_filename)
    };

    pack_snapshot_to_zip(&snap_folder, &folder_name, &target_zip)?;

    Ok(target_zip.to_string_lossy().into_owned())
}

pub fn import_snapshot_from_path(
    data_dir: &Path,
    game_id: &str,
    game_name: &str,
    src_path: &str,
    title: &str,
    note: &str,
) -> Result<SnapshotMeta, String> {
    let source = Path::new(src_path);
    if !source.exists() {
        return Err(format!("Файл или папка не существует: {}", src_path));
    }

    let timestamp = now_secs();
    let snap_id = format!("snap_{}_{:x}", timestamp, rand_suffix());
    let snap_folder = data_dir.join("snapshots").join(game_id).join(&snap_id);
    let files_folder = snap_folder.join("files");

    fs::create_dir_all(&files_folder)
        .map_err(|e| format!("Не удалось создать папку снимка: {}", e))?;

    let is_zip = src_path.to_lowercase().ends_with(".zip");

    if is_zip {
        // Unpack zip using tar.exe
        let output = silent_command("tar.exe")
            .args(&[
                "-xf",
                src_path,
                "-C",
                &files_folder.to_string_lossy(),
            ])
            .output()
            .map_err(|e| format!("Не удалось запустить tar.exe для распаковки: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Ошибка распаковки архива: {}", err));
        }
    } else if source.is_dir() {
        let folder_name = determine_save_folder_name(src_path, game_name);
        let dest_inner = files_folder.join(&folder_name);
        let mut sz = 0;
        let mut ct = 0;
        copy_dir_recursive(source, &dest_inner, &mut sz, &mut ct)
            .map_err(|e| format!("Ошибка копирования файлов: {}", e))?;
    } else {
        return Err("Поддерживаются только архивы .zip или папки с сохранениями".to_string());
    }

    // Check for embedded Savio Passport (savio_meta.json)
    let mut passport_meta: Option<Value> = None;
    let passport_file = files_folder.join("savio_meta.json");
    if passport_file.is_file() {
        if let Ok(c) = fs::read_to_string(&passport_file) {
            if let Ok(v) = serde_json::from_str::<Value>(&c) {
                passport_meta = Some(v);
            }
        }
        let _ = fs::remove_file(&passport_file);
    }

    // Detect save_folder_name if files_folder has a single subdirectory
    let mut detected_folder_name = None;
    if let Ok(entries) = fs::read_dir(&files_folder) {
        let sub_dirs: Vec<String> = entries.flatten()
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().into_string().ok())
            .collect();
        if sub_dirs.len() == 1 {
            detected_folder_name = Some(sub_dirs[0].clone());
        }
    }

    // Calculate stats
    let mut total_size: u64 = 0;
    let mut file_count: usize = 0;
    calc_stats(&files_folder, &mut total_size, &mut file_count);

    let sig = compute_dir_signature(&files_folder);
    let dir_hash = sig.map(|s| s.hash_str);

    let final_title = if !title.trim().is_empty() {
        title.trim().to_string()
    } else if let Some(p_title) = passport_meta.as_ref().and_then(|p| p.get("title")).and_then(|t| t.as_str()) {
        if !p_title.trim().is_empty() {
            p_title.trim().to_string()
        } else {
            format!("Импортированное сохранение ({})", format_timestamp(timestamp))
        }
    } else {
        // Try to parse tag from file name like "..._[Tag].zip"
        let file_stem = Path::new(src_path).file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if let Some(tag_start) = file_stem.find("_[").and_then(|i| file_stem[i..].find(']').map(|j| &file_stem[i+2..i+j])) {
            if !tag_start.trim().is_empty() {
                tag_start.trim().to_string()
            } else {
                format!("Импортированное сохранение ({})", format_timestamp(timestamp))
            }
        } else {
            format!("Импортированное сохранение ({})", format_timestamp(timestamp))
        }
    };

    let final_note = if !note.trim().is_empty() {
        note.trim().to_string()
    } else if let Some(p_note) = passport_meta.as_ref().and_then(|p| p.get("note")).and_then(|n| n.as_str()) {
        p_note.trim().to_string()
    } else {
        format!("Импортировано из: {}", Path::new(src_path).file_name().and_then(|n| n.to_str()).unwrap_or(src_path))
    };

    let passport_folder = passport_meta.as_ref().and_then(|p| p.get("save_folder_name")).and_then(|f| f.as_str()).map(|s| s.to_string());
    let passport_store = passport_meta.as_ref().and_then(|p| p.get("store")).and_then(|s| s.as_str()).map(|s| s.to_string());
    let passport_orig_path = passport_meta.as_ref()
        .and_then(|p| p.get("originalSavePath").or_else(|| p.get("original_save_path")))
        .and_then(|p| p.as_str())
        .map(|s| s.to_string());

    let meta = SnapshotMeta {
        id: snap_id,
        game_id: game_id.to_string(),
        game_name: game_name.to_string(),
        title: final_title,
        note: final_note,
        created_at: timestamp,
        total_size_bytes: total_size,
        file_count,
        is_active: false,
        source: "imported".to_string(),
        snapshot_dir: snap_folder.to_string_lossy().into_owned(),
        store: passport_store,
        save_folder_name: detected_folder_name.or(passport_folder),
        is_locked: false,
        dir_hash,
        safety_backup_id: None,
        original_save_path: passport_orig_path,
    };

    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Ошибка сериализации: {}", e))?;
    fs::write(snap_folder.join("snapshot.json"), meta_json)
        .map_err(|e| format!("Не удалось сохранить snapshot.json: {}", e))?;

    Ok(meta)
}

pub fn clone_to_desktop(game_name: &str, source_dir: &str) -> Result<String, String> {
    let src = Path::new(source_dir);
    if !src.is_dir() {
        return Err(format!("Папка сохранений не существует: {}", source_dir));
    }

    let desktop = get_desktop_dir();
    let safe_name = sanitize_filename(game_name);
    let dest_name = format!("[Savio] {} Saves ({})", safe_name, format_timestamp(now_secs()).replace(':', "-"));
    let dest_folder = desktop.join(dest_name);

    let mut sz = 0;
    let mut count = 0;
    copy_dir_recursive(src, &dest_folder, &mut sz, &mut count)
        .map_err(|e| format!("Ошибка клонирования файлов: {}", e))?;

    // Open in Explorer
    let _ = crate::system::open_in_explorer(&dest_folder.to_string_lossy());

    Ok(dest_folder.to_string_lossy().into_owned())
}

pub fn test_webdav_connection(url: &str, user: &str, pass: &str) -> Result<String, String> {
    let clean_url = url.trim().trim_end_matches('/');
    if clean_url.is_empty() {
        return Err("URL сервера не может быть пустым".to_string());
    }

    let auth = format!("{}:{}", user.trim(), pass.trim());
    let output = silent_command("curl.exe")
        .args(&[
            "-s",
            "-S",
            "-X", "PROPFIND",
            "-H", "Depth: 0",
            "-u", &auth,
            "--max-time", "10",
            clean_url,
        ])
        .output()
        .map_err(|e| format!("Не удалось выполнить curl: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout);
    if output.status.success() || text.contains("207") || text.contains("multistatus") || text.contains("response") {
        Ok("Подключение к WebDAV успешно! Сервер ответил корректно.".to_string())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        if text.contains("401") || text.contains("Unauthorized") {
            Err("Ошибка 401: Неверный логин или пароль приложения".to_string())
        } else if !err.is_empty() {
            Err(format!("Ошибка сети: {}", err.trim()))
        } else {
            Err(format!("Ошибка ответа сервера: {}", text.chars().take(180).collect::<String>()))
        }
    }
}

pub fn gdrive_test_token(access_token: &str) -> Result<Value, String> {
    let clean = access_token.trim();
    if clean.is_empty() {
        return Err("Введите токен доступа Google".to_string());
    }

    let output = silent_command("curl.exe")
        .args(&[
            "-s",
            "-H", &format!("Authorization: Bearer {}", clean),
            "https://www.googleapis.com/oauth2/v2/userinfo",
        ])
        .output()
        .map_err(|e| format!("Не удалось проверить токен Google: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout);
    if let Ok(val) = serde_json::from_str::<Value>(&text) {
        if let Some(email) = val.get("email").and_then(|v| v.as_str()) {
            return Ok(serde_json::json!({
                "status": "success",
                "email": email,
                "name": val.get("name").and_then(|v| v.as_str()).unwrap_or(email)
            }));
        }
        if let Some(err) = val.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
            return Err(format!("Google API: {}", err));
        }
    }
    Err(format!("Недействительный ответ Google: {}", text.chars().take(150).collect::<String>()))
}

fn capture_oauth_code(port: u16, service_name: &str, timeout_secs: u64) -> Result<String, String> {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr)
        .map_err(|e| format!("Не удалось открыть порт {}: {}", port, e))?;

    listener.set_nonblocking(true)
        .map_err(|e| format!("Ошибка сокета: {}", e))?;

    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    loop {
        if start.elapsed() > timeout {
            return Err("Время ожидания входа в браузере истекло (2 минуты)".to_string());
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buffer = [0u8; 4096];
                let n = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..n]);

                let mut auth_code = None;
                if let Some(first_line) = request.lines().next() {
                    if let Some(path) = first_line.split_whitespace().nth(1) {
                        if let Some(query) = path.split('?').nth(1) {
                            for part in query.split('&') {
                                if let Some(code) = part.strip_prefix("code=") {
                                    auth_code = Some(code.split('#').next().unwrap_or(code).to_string());
                                    break;
                                }
                            }
                        }
                    }
                }

                let response_body = format!(
                    r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Savio — {service_name}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:80vh;background:#0d1117;color:#e6edf3;text-align:center;margin:0;">
  <div style="background:#161b22;padding:40px 48px;border-radius:24px;border:1px solid #30363d;box-shadow:0 12px 36px rgba(0,0,0,0.4);max-width:440px;">
    <div style="width:56px;height:56px;border-radius:50%;background:#238636;color:#ffffff;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px;">✓</div>
    <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;font-weight:700;">Вход в {service_name} выполнен!</h2>
    <p style="font-size:14px;color:#8b949e;line-height:1.5;margin:0;">Аккаунт успешно авторизован. Вы можете закрыть эту вкладку и вернуться в приложение Savio.</p>
  </div>
</body>
</html>"#
                );

                let http_response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    response_body.len(),
                    response_body
                );

                let _ = stream.write_all(http_response.as_bytes());
                let _ = stream.flush();

                if let Some(code) = auth_code {
                    return Ok(code);
                } else if request.contains("error=") {
                    return Err("Вход был отменён в браузере".to_string());
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => {
                return Err(format!("Ошибка соединения: {}", e));
            }
        }
    }
}


pub fn gdrive_login_oauth() -> Result<Value, String> {
    let port = 18246;
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=202264815644.apps.googleusercontent.com&response_type=code&redirect_uri=http://127.0.0.1:{}&scope=https://www.googleapis.com/auth/drive.file%20email%20profile",
        port
    );

    let _ = crate::system::open_in_explorer(&auth_url);

    let code = capture_oauth_code(port, "Google Drive", 120)?;

    let redirect_uri = format!("http://127.0.0.1:{}", port);
    let output = silent_command("curl.exe")
        .args(&[
            "-s",
            "-X", "POST",
            "https://oauth2.googleapis.com/token",
            "-d", "client_id=202264815644.apps.googleusercontent.com",
            "-d", "client_secret=X4Z3ca8xfWDb1Voo-F9a7ZxJ",
            "-d", "grant_type=authorization_code",
            "-d", &format!("code={}", code),
            "-d", &format!("redirect_uri={}", redirect_uri),
        ])
        .output()
        .map_err(|e| format!("Не удалось выполнить запрос токена Google: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout);
    let json: Value = serde_json::from_str(&text)
        .map_err(|e| format!("Ошибка ответа Google: {}, текст: {}", e, text))?;

    if let Some(err) = json.get("error_description").or_else(|| json.get("error")).and_then(|e| e.as_str()) {
        return Err(format!("Google: {}", err));
    }

    let access_token = json.get("access_token").and_then(|t| t.as_str())
        .ok_or_else(|| "Не получен токен доступа Google".to_string())?;
    let refresh_token = json.get("refresh_token").and_then(|r| r.as_str()).unwrap_or("");

    let me_out = silent_command("curl.exe")
        .args(&[
            "-s",
            "-H", &format!("Authorization: Bearer {}", access_token),
            "https://www.googleapis.com/oauth2/v2/userinfo",
        ])
        .output();

    let mut user_email = "Google Аккаунт".to_string();
    if let Ok(m) = me_out {
        if let Ok(me_val) = serde_json::from_str::<Value>(&String::from_utf8_lossy(&m.stdout)) {
            if let Some(mail) = me_val.get("email").and_then(|v| v.as_str()) {
                user_email = mail.to_string();
            }
        }
    }

    Ok(serde_json::json!({
        "status": "success",
        "email": user_email,
        "accessToken": access_token,
        "refreshToken": refresh_token
    }))
}


pub fn ensure_valid_gdrive_token(settings: &Value) -> Result<(String, String), String> {
    let auth = settings.get("gdriveAuth").ok_or_else(|| "Google Drive не подключен".to_string())?;
    let access_token = auth.get("accessToken").and_then(|t| t.as_str()).unwrap_or("");
    let refresh_token = auth.get("refreshToken").and_then(|r| r.as_str()).unwrap_or("");

    if access_token.is_empty() && refresh_token.is_empty() {
        return Err("Для Google Drive подключите аккаунт на вкладке «Облака»".to_string());
    }

    let mut current_at = access_token.to_string();

    let mut valid = false;
    if !current_at.is_empty() {
        let test_out = silent_command("curl.exe")
            .args(&[
                "-s",
                "-H", &format!("Authorization: Bearer {}", current_at),
                "https://www.googleapis.com/oauth2/v2/userinfo",
            ])
            .output();
        if let Ok(out) = test_out {
            if let Ok(val) = serde_json::from_slice::<Value>(&out.stdout) {
                if val.get("email").is_some() {
                    valid = true;
                }
            }
        }
    }

    if !valid && !refresh_token.is_empty() {
        let refresh_out = silent_command("curl.exe")
            .args(&[
                "-s",
                "-X", "POST",
                "https://oauth2.googleapis.com/token",
                "-d", "client_id=202264815644.apps.googleusercontent.com",
                "-d", "client_secret=X4Z3ca8xfWDb1Voo-F9a7ZxJ",
                "-d", "grant_type=refresh_token",
                "-d", &format!("refresh_token={}", refresh_token),
            ])
            .output()
            .map_err(|e| format!("Не удалось связаться с сервером Google: {}", e))?;

        if let Ok(json) = serde_json::from_slice::<Value>(&refresh_out.stdout) {
            if let Some(new_at) = json.get("access_token").and_then(|t| t.as_str()) {
                current_at = new_at.to_string();
                valid = true;
            }
        }
    }

    if !valid {
        return Err("Срок действия авторизации Google Drive истёк. Пожалуйста, выполните повторный вход на вкладке «Облака».".to_string());
    }

    Ok((current_at, refresh_token.to_string()))
}


pub fn upload_to_gdrive_cloud(
    access_token: &str,
    refresh_token: &str,
    service_name: &str,
    game_name: &str,
    zip_name: &str,
    zip_path: &Path,
) -> Result<String, String> {
    let rclone = get_rclone_path().ok_or_else(|| "Компонент облачной синхронизации (rclone.exe) не найден".to_string())?;
    let safe_service = sanitize_filename(service_name);
    let safe_game = sanitize_filename(game_name);
    let remote_path = format!(":drive:SavioSaves/{}/{}/{}", safe_service, safe_game, zip_name);

    let token_json = serde_json::json!({
        "access_token": access_token,
        "token_type": "Bearer",
        "refresh_token": refresh_token,
    }).to_string();

    let out = silent_command(&rclone.to_string_lossy())
        .args(&[
            "copyto",
            &zip_path.to_string_lossy(),
            &remote_path,
            "--drive-token", &token_json,
            "--drive-scope", "drive.file",
            "--contimeout", "20s",
            "--timeout", "180s",
        ])
        .output()
        .map_err(|e| format!("Ошибка выгрузки в Google Drive: {}", e))?;

    if out.status.success() {
        Ok(format!("Снимок успешно сохранён в Google Диск (папка SavioSaves/{}/{}/{})!", safe_service, safe_game, zip_name))
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        Err(format!("Ошибка Google Диска: {}", err.lines().last().unwrap_or("Сбой передачи файла").trim()))
    }
}

pub fn get_rclone_path() -> Option<PathBuf> {
    // 1. Next to current executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("rclone.exe");
            if p.is_file() {
                return Some(p);
            }
        }
    }
    // 2. Working directory / project root
    let p = PathBuf::from("rclone.exe");
    if p.is_file() {
        return Some(p.canonicalize().unwrap_or(p));
    }
    let bin_p = PathBuf::from("src-tauri").join("bin").join("rclone.exe");
    if bin_p.is_file() {
        return Some(bin_p.canonicalize().unwrap_or(bin_p));
    }
    // 3. LocalAppData/io.savio.desktop/bin/rclone.exe
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local).join("io.savio.desktop").join("bin").join("rclone.exe");
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

pub fn obscure_password(pass: &str) -> Result<String, String> {
    let rclone = get_rclone_path().ok_or_else(|| "Компонент облачной синхронизации (rclone.exe) не найден".to_string())?;
    let out = silent_command(&rclone.to_string_lossy())
        .args(&["obscure", pass])
        .output()
        .map_err(|e| format!("Не удалось зашифровать пароль: {}", e))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

pub fn test_mega_credentials(email: &str, pass: &str) -> Result<Value, String> {
    let clean_email = email.trim();
    if clean_email.is_empty() {
        return Err("Введите Email аккаунта MEGA".to_string());
    }
    let clean_pass = pass.trim();
    if clean_pass.is_empty() {
        return Err("Введите пароль аккаунта MEGA".to_string());
    }

    let rclone = get_rclone_path().ok_or_else(|| "Компонент облачной синхронизации (rclone.exe) не найден".to_string())?;

    // Obscure the password if needed
    let obscured = if clean_pass.starts_with("obscured:") {
        clean_pass.trim_start_matches("obscured:").to_string()
    } else {
        obscure_password(clean_pass)?
    };

    let out = silent_command(&rclone.to_string_lossy())
        .args(&[
            "lsd",
            ":mega:",
            "--mega-user", clean_email,
            "--mega-pass", &obscured,
            "--contimeout", "15s",
            "--timeout", "25s",
        ])
        .output()
        .map_err(|e| format!("Ошибка проверки MEGA: {}", e))?;

    if out.status.success() {
        Ok(serde_json::json!({
            "status": "success",
            "email": clean_email,
            "obscuredPass": obscured,
            "message": format!("Аккаунт MEGA ({}) успешно подключен! Прямой доступ к облаку активен.", clean_email)
        }))
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        if err.contains("couldn't login") || err.contains("not found") || err.contains("Bad password") {
            Err("Неверный логин или пароль MEGA. Проверьте данные и попробуйте снова.".to_string())
        } else if err.contains("Two factor") || err.contains("2FA") {
            Err("В аккаунте MEGA включена двухфакторная аутентификация (2FA). Пожалуйста, используйте пароль приложения или отключите 2FA для прямого доступа.".to_string())
        } else {
            let last_line = err.lines().last().unwrap_or("Сервер отклонил подключение").trim();
            Err(format!("Ошибка входа в MEGA: {}", last_line))
        }
    }
}

pub fn upload_to_mega_cloud(
    email: &str,
    obscured_pass: &str,
    service_name: &str,
    game_name: &str,
    zip_name: &str,
    zip_path: &Path,
) -> Result<String, String> {
    let rclone = get_rclone_path().ok_or_else(|| "Компонент облачной синхронизации (rclone.exe) не найден".to_string())?;
    let safe_service = sanitize_filename(service_name);
    let safe_game = sanitize_filename(game_name);
    let remote_path = format!(":mega:SavioSaves/{}/{}/{}", safe_service, safe_game, zip_name);

    let out = silent_command(&rclone.to_string_lossy())
        .args(&[
            "copyto",
            &zip_path.to_string_lossy(),
            &remote_path,
            "--mega-user", email,
            "--mega-pass", obscured_pass,
            "--contimeout", "20s",
            "--timeout", "180s",
        ])
        .output()
        .map_err(|e| format!("Ошибка выгрузки в MEGA: {}", e))?;

    if out.status.success() {
        Ok(format!("Снимок успешно сохранён в облако MEGA (папка SavioSaves/{}/{}/{})!", safe_service, safe_game, zip_name))
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        Err(format!("Ошибка облака MEGA: {}", err.lines().last().unwrap_or("Сбой передачи файла").trim()))
    }
}

pub fn resolve_dest_root(target_type: &str, settings: &Value) -> Result<PathBuf, String> {
    match target_type {
        "asus" => {
            let ip = settings.get("asusRouterIp").and_then(|v| v.as_str()).unwrap_or("192.168.50.1");
            let share = settings.get("asusShareName").and_then(|v| v.as_str()).unwrap_or("SaveVault");
            let user = settings.get("asusUsername").and_then(|v| v.as_str());
            let pass = settings.get("asusPassword").and_then(|v| v.as_str());
            let unc = format!(r"\\{}\{}", ip, share);
            crate::system::connect_network_share(&unc, user, pass)?;
            Ok(PathBuf::from(unc))
        }
        "nas" => {
            let p = settings.get("nasPath").and_then(|v| v.as_str()).unwrap_or(r"\\NAS\SaveVault");
            let user = settings.get("asusUsername").and_then(|v| v.as_str());
            let pass = settings.get("asusPassword").and_then(|v| v.as_str());
            crate::system::connect_network_share(p, user, pass)?;
            Ok(PathBuf::from(p))
        }
        "local" => {
            let p = settings.get("localBackupPath").and_then(|v| v.as_str()).unwrap_or(r"D:\SavioBackups");
            Ok(PathBuf::from(p))
        }
        _ => Err(format!("Неподдерживаемый локальный тип хранилища: {}", target_type)),
    }
}

pub fn sync_snapshot_to_target(
    data_dir: &Path,
    game_id: &str,
    game_name: &str,
    store: Option<&str>,
    snapshot_id: &str,
    target_type: &str,
    settings: &Value,
) -> Result<String, String> {
    let snap_folder = data_dir.join("snapshots").join(game_id).join(snapshot_id);
    let files_parent = snap_folder.join("files");

    if !files_parent.is_dir() {
        return Err("Файлы снимка не найдены".to_string());
    }

    let meta_path = snap_folder.join("snapshot.json");
    let (stored_store, folder_name) = if let Ok(content) = fs::read_to_string(&meta_path) {
        if let Ok(m) = serde_json::from_str::<SnapshotMeta>(&content) {
            let fn_str = m.save_folder_name.clone().unwrap_or_else(|| sanitize_filename(&m.game_name));
            (m.store, fn_str)
        } else {
            (None, sanitize_filename(game_name))
        }
    } else {
        (None, sanitize_filename(game_name))
    };

    let effective_store = store.or(stored_store.as_deref());
    let service_name = resolve_service_name(effective_store, game_id);
    let safe_service = sanitize_filename(&service_name);
    let safe_game = sanitize_filename(game_name);

    let is_corruption_guard_enabled = settings.get("corruptionGuardEnabled").and_then(|v| v.as_bool()).unwrap_or(true);
    if is_corruption_guard_enabled {
        if let Ok(content) = fs::read_to_string(&meta_path) {
            if let Ok(m) = serde_json::from_str::<SnapshotMeta>(&content) {
                if m.total_size_bytes == 0 || m.file_count == 0 {
                    return Err("Защита от повреждений (Corruption Guard): размер снимка 0 байт (возможен сбой игры). Выгрузка в облако заблокирована для защиты данных.".to_string());
                }
            }
        }
    }

    let dt_str = get_short_datetime_string();
    let mut snap_tag = String::new();
    let mut snap_is_locked = false;
    if let Ok(content) = fs::read_to_string(&meta_path) {
        if let Ok(m) = serde_json::from_str::<SnapshotMeta>(&content) {
            snap_is_locked = m.is_locked;
            if m.source == "watcher" {
                snap_tag = "Автовыход".to_string();
            } else if m.source == "pre_launch" {
                snap_tag = "Перед запуском".to_string();
            } else if !m.title.is_empty() && !m.title.starts_with("Снимок от") {
                snap_tag = sanitize_filename(&m.title);
            }
        }
    }

    let lock_suffix = if snap_is_locked { "_LOCKED" } else { "" };
    let zip_name = if !snap_tag.is_empty() {
        format!("{}_{}_[{}]{}.zip", safe_game, dt_str, snap_tag, lock_suffix)
    } else {
        format!("{}_{}{}.zip", safe_game, dt_str, lock_suffix)
    };

    // Create temporary zip with actual folder_name as archive root
    let temp_zip = data_dir.join(format!("upload_{}_{}", now_secs(), zip_name));
    pack_snapshot_to_zip(&snap_folder, &folder_name, &temp_zip)?;

    if is_corruption_guard_enabled {
        if let Err(e) = verify_archive_integrity(&temp_zip) {
            let _ = fs::remove_file(&temp_zip);
            return Err(e);
        }
    }

    let upload_res = match target_type {
        "webdav" => {
            let url = settings.get("webdavUrl").and_then(|v| v.as_str()).unwrap_or("").trim().trim_end_matches('/');
            let user = settings.get("webdavUser").and_then(|v| v.as_str()).unwrap_or("");
            let pass = settings.get("webdavPass").and_then(|v| v.as_str()).unwrap_or("");
            let remote_dir = settings.get("webdavRemotePath").and_then(|v| v.as_str()).unwrap_or("SavioSaves").trim_matches('/');

            if url.is_empty() {
                let _ = fs::remove_file(&temp_zip);
                Err("WebDAV URL не указан в настройках".to_string())
            } else {
                let auth = format!("{}:{}", user, pass);
                // Create remote directories SavioSaves/Service/Game
                let _ = silent_command("curl.exe")
                    .args(&["-s", "-X", "MKCOL", "-u", &auth, &format!("{}/{}", url, remote_dir)])
                    .output();
                let _ = silent_command("curl.exe")
                    .args(&["-s", "-X", "MKCOL", "-u", &auth, &format!("{}/{}/{}", url, remote_dir, safe_service)])
                    .output();
                let target_url = format!("{}/{}/{}/{}", url, remote_dir, safe_service, safe_game);
                let _ = silent_command("curl.exe")
                    .args(&["-s", "-X", "MKCOL", "-u", &auth, &target_url])
                    .output();

                let upload_url = format!("{}/{}", target_url, zip_name);
                let out = silent_command("curl.exe")
                    .args(&[
                        "-s",
                        "-S",
                        "-T",
                        &temp_zip.to_string_lossy(),
                        "-u",
                        &auth,
                        &upload_url,
                    ])
                    .output()
                    .map_err(|e| format!("Ошибка загрузки в WebDAV: {}", e));

                let _ = fs::remove_file(&temp_zip);

                match out {
                    Ok(o) => {
                        if o.status.success() {
                            Ok(format!("Снимок успешно загружен в WebDAV облако: {}", upload_url))
                        } else {
                            Err(format!("Ошибка передачи: {}", String::from_utf8_lossy(&o.stderr)))
                        }
                    }
                    Err(e) => Err(e),
                }
            }
        }

        "gdrive" => {
            let mut direct_res = None;
            if let Some(auth) = settings.get("gdriveAuth") {
                if auth.get("connected").and_then(|c| c.as_bool()).unwrap_or(false) {
                    match ensure_valid_gdrive_token(settings) {
                        Ok((token, refresh_token)) => {
                            let res = upload_to_gdrive_cloud(&token, &refresh_token, &safe_service, game_name, &zip_name, &temp_zip);
                            let _ = fs::remove_file(&temp_zip);
                            direct_res = Some(res);
                        }
                        Err(e) => {
                            let _ = fs::remove_file(&temp_zip);
                            direct_res = Some(Err(e));
                        }
                    }
                }
            }

            if let Some(res) = direct_res {
                res
            } else {
                // Fallback to local Google Drive folder if available
                let user_path = settings.get("gdrivePath").and_then(|v| v.as_str()).unwrap_or("");
                let dest_root = if !user_path.is_empty() {
                    PathBuf::from(user_path)
                } else {
                    let g_my = PathBuf::from(r"G:\My Drive\SavioSaves");
                    let g_ru = PathBuf::from(r"G:\Мой диск\SavioSaves");
                    if g_my.parent().map(|p| p.exists()).unwrap_or(false) {
                        g_my
                    } else if g_ru.parent().map(|p| p.exists()).unwrap_or(false) {
                        g_ru
                    } else {
                        let _ = fs::remove_file(&temp_zip);
                        return Err("Для сохранения в Google Drive подключите аккаунт на вкладке «Облака»".to_string());
                    }
                };

                let dest_game_dir = dest_root.join(&safe_service).join(&safe_game);
                if let Err(e) = fs::create_dir_all(&dest_game_dir) {
                    let _ = fs::remove_file(&temp_zip);
                    return Err(format!("Не удалось создать папку на хранилище: {}", e));
                }
                let dest_file = dest_game_dir.join(&zip_name);
                let copy_res = fs::copy(&temp_zip, &dest_file)
                    .map_err(|e| format!("Не удалось скопировать снимок: {}", e));
                let _ = fs::remove_file(&temp_zip);
                copy_res.map(|_| format!("Снимок сохранён в Google Drive: {}", dest_file.display()))
            }
        }
        "mega" => {
            let mut direct_res = None;
            if let Some(auth) = settings.get("megaAuth") {
                let email = auth.get("email").and_then(|e| e.as_str()).unwrap_or("");
                let pass = auth.get("obscuredPass").and_then(|p| p.as_str()).unwrap_or("");
                if auth.get("connected").and_then(|c| c.as_bool()).unwrap_or(false) {
                    if email.is_empty() || pass.is_empty() {
                        let _ = fs::remove_file(&temp_zip);
                        return Err("В аккаунте MEGA не сохранён пароль. Перейдите на вкладку «Облака» и введите пароль для входа в MEGA.".to_string());
                    }
                    let res = upload_to_mega_cloud(email, pass, &safe_service, game_name, &zip_name, &temp_zip);
                    let _ = fs::remove_file(&temp_zip);
                    direct_res = Some(res);
                }
            }

            if let Some(res) = direct_res {
                res
            } else {
                let user_path = settings.get("megaPath").and_then(|v| v.as_str()).unwrap_or("");
                let dest_root = if !user_path.is_empty() {
                    PathBuf::from(user_path)
                } else if let Ok(up) = std::env::var("USERPROFILE") {
                    let mega_sync = PathBuf::from(&up).join("MEGAsync").join("SavioSaves");
                    let mega_dir = PathBuf::from(&up).join("MEGA").join("SavioSaves");
                    if mega_sync.parent().map(|p| p.exists()).unwrap_or(false) {
                        mega_sync
                    } else if mega_dir.parent().map(|p| p.exists()).unwrap_or(false) {
                        mega_dir
                    } else {
                        let _ = fs::remove_file(&temp_zip);
                        return Err("Для сохранения в облако MEGA введите Email и пароль на вкладке «Облака»".to_string());
                    }
                } else {
                    let _ = fs::remove_file(&temp_zip);
                    return Err("Для сохранения в облако MEGA введите Email и пароль на вкладке «Облака»".to_string());
                };

                let dest_game_dir = dest_root.join(&safe_service).join(&safe_game);
                if let Err(e) = fs::create_dir_all(&dest_game_dir) {
                    let _ = fs::remove_file(&temp_zip);
                    return Err(format!("Не удалось создать папку на хранилище: {}", e));
                }
                let dest_file = dest_game_dir.join(&zip_name);
                let copy_res = fs::copy(&temp_zip, &dest_file)
                    .map_err(|e| format!("Не удалось скопировать снимок: {}", e));
                let _ = fs::remove_file(&temp_zip);
                copy_res.map(|_| format!("Снимок сохранён в папку MEGA: {}", dest_file.display()))
            }
        }

        "asus" | "nas" | "local" => {
            let dest_root = resolve_dest_root(target_type, settings)
                .map_err(|e| {
                    let _ = fs::remove_file(&temp_zip);
                    e
                })?;

            let dest_game_dir = dest_root.join(&safe_service).join(&safe_game);
            if let Err(e) = fs::create_dir_all(&dest_game_dir) {
                let _ = fs::remove_file(&temp_zip);
                return Err(format!("Не удалось создать папку на хранилище: {}", e));
            }

            let dest_file = dest_game_dir.join(&zip_name);
            let copy_res = fs::copy(&temp_zip, &dest_file)
                .map_err(|e| format!("Не удалось скопировать снимок на хранилище: {}", e));

            let _ = fs::remove_file(&temp_zip);

            copy_res.map(|_| format!("Снимок сохранён в хранилище: {}", dest_file.display()))
        }
        _ => {
            let _ = fs::remove_file(&temp_zip);
            Err("Неподдерживаемый тип хранилища".to_string())
        }
    };

    if upload_res.is_ok() {
        update_cloud_game_manifest(data_dir, game_id, game_name, effective_store, snapshot_id, &zip_name, target_type, settings);
        let cloud_limit = settings.get("cloudRetentionLimit").and_then(|v| v.as_u64()).unwrap_or(5) as usize;
        if cloud_limit > 0 {
            prune_cloud_backups(game_id, game_name, effective_store, target_type, settings, cloud_limit);
        }
    }

    upload_res
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudBackupMeta {
    pub file_name: String,
    pub size_bytes: u64,
    pub modified: Option<u64>,
    pub target_type: String,
    pub download_ref: String,
    #[serde(default)]
    pub is_locked: bool,
}

impl CloudBackupMeta {
    pub fn new(
        file_name: String,
        size_bytes: u64,
        modified: Option<u64>,
        target_type: String,
        download_ref: String,
    ) -> Self {
        let is_locked = file_name.contains("_LOCKED") || file_name.contains("_STAR");
        Self {
            file_name,
            size_bytes,
            modified,
            target_type,
            download_ref,
            is_locked,
        }
    }
}

pub fn list_cloud_backups(
    game_id: &str,
    game_name: &str,
    store: Option<&str>,
    target_type: &str,
    settings: &Value,
) -> Result<Vec<CloudBackupMeta>, String> {
    let service_name = resolve_service_name(store, game_id);
    let safe_service = sanitize_filename(&service_name);
    let safe_game = sanitize_filename(game_name);
    let mut results = Vec::new();

    match target_type {
        "mega" => {
            let email = settings.get("megaAuth")
                .and_then(|a| a.get("email"))
                .and_then(|e| e.as_str())
                .unwrap_or("");
            let pass = settings.get("megaAuth")
                .and_then(|a| a.get("obscuredPass"))
                .and_then(|p| p.as_str())
                .unwrap_or("");

            if email.is_empty() || pass.is_empty() {
                let user_path = settings.get("megaPath").and_then(|v| v.as_str()).unwrap_or("");
                let local_root = if !user_path.is_empty() {
                    PathBuf::from(user_path)
                } else if let Ok(up) = std::env::var("USERPROFILE") {
                    PathBuf::from(up).join("MEGAsync").join("SavioSaves")
                } else {
                    return Err("Подключите аккаунт MEGA на вкладке «Облака» (Email и пароль)".to_string());
                };
                let local_dir = local_root.join(&safe_service).join(&safe_game);
                let mut list = list_local_backups(&local_dir, "mega")?;
                if list.is_empty() {
                    let legacy_dir = local_root.join(&safe_game);
                    list = list_local_backups(&legacy_dir, "mega")?;
                }
                return Ok(list);
            }

            let rclone = get_rclone_path().ok_or_else(|| "Компонент облачной синхронизации (rclone.exe) не найден".to_string())?;
            let remote_dir = format!(":mega:SavioSaves/{}/{}", safe_service, safe_game);

            let out = silent_command(&rclone.to_string_lossy())
                .args(&[
                    "lsjson",
                    &remote_dir,
                    "--mega-user", email,
                    "--mega-pass", pass,
                    "--contimeout", "15s",
                    "--timeout", "30s",
                ])
                .output()
                .map_err(|e| format!("Не удалось запросить список файлов MEGA: {}", e))?;

            if out.status.success() {
                if let Ok(items) = serde_json::from_slice::<Vec<Value>>(&out.stdout) {
                    for item in items {
                        let is_dir = item.get("IsDir").and_then(|v| v.as_bool()).unwrap_or(false);
                        let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("");
                        let size = item.get("Size").and_then(|v| v.as_u64()).unwrap_or(0);
                        if !is_dir && name.ends_with(".zip") {
                            let mod_str = item.get("ModTime").and_then(|v| v.as_str()).unwrap_or("");
                            let mod_ts = chrono_or_fallback_ts(mod_str);
                            results.push(CloudBackupMeta::new(
                                name.to_string(),
                                size,
                                mod_ts,
                                "mega".to_string(),
                                name.to_string(),
                            ));
                        }
                    }
                }
            }

            // Fallback to legacy path if new path is empty
            if results.is_empty() {
                let legacy_dir = format!(":mega:SavioSaves/{}", safe_game);
                let out_legacy = silent_command(&rclone.to_string_lossy())
                    .args(&[
                        "lsjson",
                        &legacy_dir,
                        "--mega-user", email,
                        "--mega-pass", pass,
                        "--contimeout", "15s",
                        "--timeout", "30s",
                    ])
                    .output();
                if let Ok(ol) = out_legacy {
                    if ol.status.success() {
                        if let Ok(items) = serde_json::from_slice::<Vec<Value>>(&ol.stdout) {
                            for item in items {
                                let is_dir = item.get("IsDir").and_then(|v| v.as_bool()).unwrap_or(false);
                                let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("");
                                let size = item.get("Size").and_then(|v| v.as_u64()).unwrap_or(0);
                                if !is_dir && name.ends_with(".zip") {
                                    let mod_str = item.get("ModTime").and_then(|v| v.as_str()).unwrap_or("");
                                    let mod_ts = chrono_or_fallback_ts(mod_str);
                                    results.push(CloudBackupMeta::new(
                                        name.to_string(),
                                        size,
                                        mod_ts,
                                        "mega".to_string(),
                                        name.to_string(),
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }
        "asus" | "nas" | "local" => {
            let dest_root = resolve_dest_root(target_type, settings)?;
            let game_dir = dest_root.join(&safe_service).join(&safe_game);
            let mut list = list_local_backups(&game_dir, target_type)?;
            if list.is_empty() {
                let legacy_dir = dest_root.join(&safe_game);
                list = list_local_backups(&legacy_dir, target_type)?;
            }
            return Ok(list);
        }

        "gdrive" => {
            if let Some(auth) = settings.get("gdriveAuth") {
                if auth.get("connected").and_then(|c| c.as_bool()).unwrap_or(false) {
                    if let Ok((token, refresh_token)) = ensure_valid_gdrive_token(settings) {
                        if let Some(rclone) = get_rclone_path() {
                            let remote_dir = format!(":drive:SavioSaves/{}/{}", safe_service, safe_game);
                            let token_json = serde_json::json!({
                                "access_token": token,
                                "token_type": "Bearer",
                                "refresh_token": refresh_token,
                            }).to_string();

                            let out = silent_command(&rclone.to_string_lossy())
                                .args(&[
                                    "lsjson",
                                    &remote_dir,
                                    "--drive-token", &token_json,
                                    "--drive-scope", "drive.file",
                                    "--contimeout", "15s",
                                    "--timeout", "30s",
                                ])
                                .output();

                            if let Ok(o) = out {
                                if o.status.success() {
                                    if let Ok(items) = serde_json::from_slice::<Vec<Value>>(&o.stdout) {
                                        for item in items {
                                            let is_dir = item.get("IsDir").and_then(|v| v.as_bool()).unwrap_or(false);
                                            let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("");
                                            let size = item.get("Size").and_then(|v| v.as_u64()).unwrap_or(0);
                                            if !is_dir && name.ends_with(".zip") {
                                                let mod_str = item.get("ModTime").and_then(|v| v.as_str()).unwrap_or("");
                                                let mod_ts = chrono_or_fallback_ts(mod_str);
                                                results.push(CloudBackupMeta::new(
                                                    name.to_string(),
                                                    size,
                                                    mod_ts,
                                                    "gdrive".to_string(),
                                                    name.to_string(),
                                                ));
                                            }
                                        }
                                    }
                                }
                            }

                            // Fallback to legacy path if new path empty
                            if results.is_empty() {
                                let legacy_dir = format!(":drive:SavioSaves/{}", safe_game);
                                let out_legacy = silent_command(&rclone.to_string_lossy())
                                    .args(&[
                                        "lsjson",
                                        &legacy_dir,
                                        "--drive-token", &token_json,
                                        "--drive-scope", "drive.file",
                                        "--contimeout", "15s",
                                        "--timeout", "30s",
                                    ])
                                    .output();
                                if let Ok(ol) = out_legacy {
                                    if ol.status.success() {
                                        if let Ok(items) = serde_json::from_slice::<Vec<Value>>(&ol.stdout) {
                                            for item in items {
                                                let is_dir = item.get("IsDir").and_then(|v| v.as_bool()).unwrap_or(false);
                                                let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("");
                                                let size = item.get("Size").and_then(|v| v.as_u64()).unwrap_or(0);
                                                if !is_dir && name.ends_with(".zip") {
                                                    let mod_str = item.get("ModTime").and_then(|v| v.as_str()).unwrap_or("");
                                                    let mod_ts = chrono_or_fallback_ts(mod_str);
                                                    results.push(CloudBackupMeta::new(
                                                        name.to_string(),
                                                        size,
                                                        mod_ts,
                                                        "gdrive".to_string(),
                                                        name.to_string(),
                                                    ));
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            results.sort_by(|a, b| b.modified.unwrap_or(0).cmp(&a.modified.unwrap_or(0)));
                            return Ok(results);
                        }
                    }
                }
            }
            let user_path = settings.get("gdrivePath").and_then(|v| v.as_str()).unwrap_or("");
            let dest_root = if !user_path.is_empty() {
                PathBuf::from(user_path)
            } else {
                let g_my = PathBuf::from(r"G:\My Drive\SavioSaves");
                let g_ru = PathBuf::from(r"G:\Мой диск\SavioSaves");
                if g_my.exists() {
                    g_my
                } else {
                    g_ru
                }
            };
            let game_dir = dest_root.join(&safe_service).join(&safe_game);
            let mut list = list_local_backups(&game_dir, "gdrive")?;
            if list.is_empty() {
                let legacy_dir = dest_root.join(&safe_game);
                list = list_local_backups(&legacy_dir, "gdrive")?;
            }
            return Ok(list);
        }
        _ => {}
    }

    results.sort_by(|a, b| b.modified.unwrap_or(0).cmp(&a.modified.unwrap_or(0)));
    Ok(results)
}

fn list_local_backups(dir: &Path, target_type: &str) -> Result<Vec<CloudBackupMeta>, String> {
    let mut list = Vec::new();
    if !dir.is_dir() {
        return Ok(list);
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().map(|e| e == "zip").unwrap_or(false) {
                let name = entry.file_name().to_string_lossy().into_owned();
                let meta = entry.metadata().ok();
                let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                let modified = meta.as_ref().and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());
                list.push(CloudBackupMeta::new(
                    name.clone(),
                    size,
                    modified,
                    target_type.to_string(),
                    p.to_string_lossy().into_owned(),
                ));
            }
        }
    }
    list.sort_by(|a, b| b.modified.unwrap_or(0).cmp(&a.modified.unwrap_or(0)));
    Ok(list)
}

pub fn restore_cloud_backup(
    data_dir: &Path,
    game_id: &str,
    game_name: &str,
    store: Option<&str>,
    file_name: &str,
    target_dir: &str,
    target_type: &str,
    settings: &Value,
) -> Result<SnapshotMeta, String> {
    let service_name = resolve_service_name(store, game_id);
    let safe_service = sanitize_filename(&service_name);
    let safe_game = sanitize_filename(game_name);
    let temp_dl = data_dir.join(format!("cloud_dl_{}_{}", now_secs(), file_name));

    match target_type {
        "mega" => {
            let email = settings.get("megaAuth")
                .and_then(|a| a.get("email"))
                .and_then(|e| e.as_str())
                .unwrap_or("");
            let pass = settings.get("megaAuth")
                .and_then(|a| a.get("obscuredPass"))
                .and_then(|p| p.as_str())
                .unwrap_or("");

            if email.is_empty() || pass.is_empty() {
                return Err("Аккаунт MEGA не подключен (введите пароль на вкладке «Облака»)".to_string());
            }

            let rclone = get_rclone_path().ok_or_else(|| "Компонент облачной синхронизации (rclone.exe) не найден".to_string())?;
            let remote_file = format!(":mega:SavioSaves/{}/{}/{}", safe_service, safe_game, file_name);

            let out = silent_command(&rclone.to_string_lossy())
                .args(&[
                    "copyto",
                    &remote_file,
                    &temp_dl.to_string_lossy(),
                    "--mega-user", email,
                    "--mega-pass", pass,
                    "--contimeout", "20s",
                    "--timeout", "180s",
                ])
                .output()
                .map_err(|e| format!("Ошибка загрузки из MEGA: {}", e))?;

            if !out.status.success() {
                // Try legacy path
                let legacy_file = format!(":mega:SavioSaves/{}/{}", safe_game, file_name);
                let out_legacy = silent_command(&rclone.to_string_lossy())
                    .args(&[
                        "copyto",
                        &legacy_file,
                        &temp_dl.to_string_lossy(),
                        "--mega-user", email,
                        "--mega-pass", pass,
                        "--contimeout", "20s",
                        "--timeout", "180s",
                    ])
                    .output();
                if out_legacy.as_ref().map(|o| !o.status.success()).unwrap_or(true) {
                    let err = String::from_utf8_lossy(&out.stderr);
                    let _ = fs::remove_file(&temp_dl);
                    return Err(format!("Не удалось скачать файл из MEGA: {}", err.lines().last().unwrap_or("Сбой передачи").trim()));
                }
            }
        }
        "asus" | "nas" | "local" => {
            let dest_root = resolve_dest_root(target_type, settings)?;
            let mut source_file = dest_root.join(&safe_service).join(&safe_game).join(file_name);
            if !source_file.is_file() {
                let legacy_file = dest_root.join(&safe_game).join(file_name);
                if legacy_file.is_file() {
                    source_file = legacy_file;
                } else {
                    return Err(format!("Файл резервной копии не найден: {}", source_file.display()));
                }
            }
            fs::copy(&source_file, &temp_dl)
                .map_err(|e| format!("Ошибка копирования: {}", e))?;
        }

        "gdrive" => {
            let mut downloaded = false;
            if let Some(auth) = settings.get("gdriveAuth") {
                if auth.get("connected").and_then(|c| c.as_bool()).unwrap_or(false) {
                    if let Ok((token, refresh_token)) = ensure_valid_gdrive_token(settings) {
                        if let Some(rclone) = get_rclone_path() {
                            let remote_file = format!(":drive:SavioSaves/{}/{}/{}", safe_service, safe_game, file_name);
                            let token_json = serde_json::json!({
                                "access_token": token,
                                "token_type": "Bearer",
                                "refresh_token": refresh_token,
                            }).to_string();

                            let out = silent_command(&rclone.to_string_lossy())
                                .args(&[
                                    "copyto",
                                    &remote_file,
                                    &temp_dl.to_string_lossy(),
                                    "--drive-token", &token_json,
                                    "--drive-scope", "drive.file",
                                    "--contimeout", "20s",
                                    "--timeout", "180s",
                                ])
                                .output();
                            if let Ok(o) = out {
                                if o.status.success() && temp_dl.is_file() {
                                    downloaded = true;
                                }
                            }
                            if !downloaded {
                                let legacy_file = format!(":drive:SavioSaves/{}/{}", safe_game, file_name);
                                let out_legacy = silent_command(&rclone.to_string_lossy())
                                    .args(&[
                                        "copyto",
                                        &legacy_file,
                                        &temp_dl.to_string_lossy(),
                                        "--drive-token", &token_json,
                                        "--drive-scope", "drive.file",
                                        "--contimeout", "20s",
                                        "--timeout", "180s",
                                    ])
                                    .output();
                                if let Ok(ol) = out_legacy {
                                    if ol.status.success() && temp_dl.is_file() {
                                        downloaded = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if !downloaded {
                let user_path = settings.get("gdrivePath").and_then(|v| v.as_str()).unwrap_or("");
                let dest_root = if !user_path.is_empty() {
                    PathBuf::from(user_path)
                } else {
                    let g_my = PathBuf::from(r"G:\My Drive\SavioSaves");
                    let g_ru = PathBuf::from(r"G:\Мой диск\SavioSaves");
                    if g_my.exists() {
                        g_my
                    } else {
                        g_ru
                    }
                };
                let mut source_file = dest_root.join(&safe_service).join(&safe_game).join(file_name);
                if !source_file.is_file() {
                    let legacy_file = dest_root.join(&safe_game).join(file_name);
                    if legacy_file.is_file() {
                        source_file = legacy_file;
                    } else {
                        return Err(format!("Файл не найден в Google Drive: {}", source_file.display()));
                    }
                }
                fs::copy(&source_file, &temp_dl)
                    .map_err(|e| format!("Ошибка копирования: {}", e))?;
            }
        }
        _ => {
            return Err("Неподдерживаемый тип хранилища".to_string());
        }
    }

    if !temp_dl.is_file() {
        return Err("Файл не был загружен на диск".to_string());
    }

    // Corruption Guard: verify downloaded archive integrity before restoring
    let is_corruption_guard_enabled = settings.get("corruptionGuardEnabled").and_then(|v| v.as_bool()).unwrap_or(true);
    if is_corruption_guard_enabled {
        if let Err(e) = verify_archive_integrity(&temp_dl) {
            let _ = fs::remove_file(&temp_dl);
            return Err(e);
        }
    }

    // 1. Safety pre-backup of current saves before overwriting
    let target_path = Path::new(target_dir);
    let mut safety_snap_id = None;
    if target_path.is_dir() {
        if let Ok(s) = create_snapshot(
            data_dir,
            game_id,
            game_name,
            store,
            target_dir,
            "Автобэкап перед восстановлением из облака",
            &format!("Создан перед загрузкой копии «{}»", file_name),
            "autobackup",
        ) {
            safety_snap_id = Some(s.id);
        }
    }

    // 2. Import into local snapshots
    let snap = import_snapshot_from_path(
        data_dir,
        game_id,
        game_name,
        &temp_dl.to_string_lossy(),
        &format!("Облако: {}", file_name),
        &format!("Восстановлено из хранилища {}", target_type.to_uppercase()),
    )?;

    // 3. Restore to target directory
    let mut restored = restore_snapshot(data_dir, game_id, game_name, &snap.id, target_dir)?;
    if safety_snap_id.is_some() {
        restored.safety_backup_id = safety_snap_id;
    }

    // 4. Clean up downloaded temp file
    let _ = fs::remove_file(&temp_dl);

    Ok(restored)
}

pub fn delete_cloud_backup(
    game_name: &str,
    store: Option<&str>,
    file_name: &str,
    target_type: &str,
    settings: &Value,
) -> Result<(), String> {
    let service_name = resolve_service_name(store, "");
    let safe_service = sanitize_filename(&service_name);
    let safe_game = sanitize_filename(game_name);

    match target_type {
        "mega" => {
            if let Some(rclone) = get_rclone_path() {
                if let Some(auth) = settings.get("megaAuth") {
                    let email = auth.get("email").and_then(|e| e.as_str()).unwrap_or("");
                    let pass = auth.get("obscuredPass").and_then(|p| p.as_str()).unwrap_or("");
                    if !email.is_empty() && !pass.is_empty() {
                        let remote_file = format!(":mega:SavioSaves/{}/{}/{}", safe_service, safe_game, file_name);
                        let _ = silent_command(&rclone.to_string_lossy())
                            .args(&[
                                "deletefile",
                                &remote_file,
                                "--mega-user", email,
                                "--mega-pass", pass,
                            ])
                            .output();
                    }
                }
            }
        }

        "gdrive" => {
            if let Some(rclone) = get_rclone_path() {
                if let Ok((token, refresh_token)) = ensure_valid_gdrive_token(settings) {
                    let remote_file = format!(":drive:SavioSaves/{}/{}/{}", safe_service, safe_game, file_name);
                    let token_json = serde_json::json!({
                        "access_token": token,
                        "token_type": "Bearer",
                        "refresh_token": refresh_token,
                    }).to_string();
                    let _ = silent_command(&rclone.to_string_lossy())
                        .args(&[
                            "deletefile",
                            &remote_file,
                            "--drive-token", &token_json,
                            "--drive-scope", "drive.file",
                        ])
                        .output();
                }
            }
            let user_path = settings.get("gdrivePath").and_then(|v| v.as_str()).unwrap_or("");
            let dest_root = if !user_path.is_empty() {
                PathBuf::from(user_path)
            } else {
                let g_my = PathBuf::from(r"G:\My Drive\SavioSaves");
                let g_ru = PathBuf::from(r"G:\Мой диск\SavioSaves");
                if g_my.exists() { g_my } else { g_ru }
            };
            let p = dest_root.join(&safe_service).join(&safe_game).join(file_name);
            let _ = fs::remove_file(p);
        }
        "webdav" => {
            let url = settings.get("webdavUrl").and_then(|v| v.as_str()).unwrap_or("").trim().trim_end_matches('/');
            let user = settings.get("webdavUser").and_then(|v| v.as_str()).unwrap_or("");
            let pass = settings.get("webdavPass").and_then(|v| v.as_str()).unwrap_or("");
            let remote_dir = settings.get("webdavRemotePath").and_then(|v| v.as_str()).unwrap_or("SavioSaves").trim_matches('/');
            if !url.is_empty() {
                let auth = format!("{}:{}", user, pass);
                let target_url = format!("{}/{}/{}/{}/{}", url, remote_dir, safe_service, safe_game, file_name);
                let _ = silent_command("curl.exe")
                    .args(&["-s", "-X", "DELETE", "-u", &auth, &target_url])
                    .output();
            }
        }
        "asus" | "nas" | "local" => {
            if let Ok(dest_root) = resolve_dest_root(target_type, settings) {
                let p = dest_root.join(&safe_service).join(&safe_game).join(file_name);
                let _ = fs::remove_file(p);
            }
        }
        _ => {}
    }
    Ok(())
}

pub fn prune_cloud_backups(
    game_id: &str,
    game_name: &str,
    store: Option<&str>,
    target_type: &str,
    settings: &Value,
    limit: usize,
) {
    if limit == 0 {
        return;
    }
    if let Ok(backups) = list_cloud_backups(game_id, game_name, store, target_type, settings) {
        let unlocked: Vec<CloudBackupMeta> = backups.into_iter().filter(|b| !b.is_locked).collect();
        if unlocked.len() > limit {
            for excess in &unlocked[limit..] {
                let _ = delete_cloud_backup(game_name, store, &excess.file_name, target_type, settings);
            }
        }
    }
}

pub fn update_cloud_game_manifest(
    data_dir: &Path,
    game_id: &str,
    game_name: &str,
    store: Option<&str>,
    snapshot_id: &str,
    zip_name: &str,
    target_type: &str,
    settings: &Value,
) {
    let snap_meta_path = data_dir.join("snapshots").join(game_id).join(snapshot_id).join("snapshot.json");
    let orig_save_path = if let Ok(c) = fs::read_to_string(&snap_meta_path) {
        if let Ok(m) = serde_json::from_str::<SnapshotMeta>(&c) {
            m.original_save_path
        } else {
            None
        }
    } else {
        None
    };

    let manifest = serde_json::json!({
        "gameId": game_id,
        "gameName": game_name,
        "store": store.unwrap_or("Custom"),
        "originalSavePath": orig_save_path,
        "lastBackupFile": zip_name,
        "updatedAt": now_secs(),
        "version": "2026.1"
    });

    let manifest_bytes = serde_json::to_vec_pretty(&manifest).unwrap_or_default();
    let service_name = resolve_service_name(store, game_id);
    let safe_service = sanitize_filename(&service_name);
    let safe_game = sanitize_filename(game_name);

    match target_type {
        "local" | "nas" | "asus" => {
            if let Ok(dest_root) = resolve_dest_root(target_type, settings) {
                let dir = dest_root.join(&safe_service).join(&safe_game);
                let _ = fs::write(dir.join("savio_manifest.json"), manifest_bytes);
            }
        }
        "gdrive" => {
            let user_path = settings.get("gdrivePath").and_then(|v| v.as_str()).unwrap_or("");
            let dest_root = if !user_path.is_empty() {
                PathBuf::from(user_path)
            } else {
                let g_my = PathBuf::from(r"G:\My Drive\SavioSaves");
                let g_ru = PathBuf::from(r"G:\Мой диск\SavioSaves");
                if g_my.exists() { g_my } else { g_ru }
            };
            if dest_root.exists() {
                let dir = dest_root.join(&safe_service).join(&safe_game);
                let _ = fs::write(dir.join("savio_manifest.json"), manifest_bytes);
            }
        }
        "mega" => {
            let user_path = settings.get("megaPath").and_then(|v| v.as_str()).unwrap_or("");
            let local_root = if !user_path.is_empty() {
                PathBuf::from(user_path)
            } else if let Ok(up) = std::env::var("USERPROFILE") {
                PathBuf::from(up).join("MEGAsync").join("SavioSaves")
            } else {
                PathBuf::new()
            };
            if local_root.exists() {
                let dir = local_root.join(&safe_service).join(&safe_game);
                let _ = fs::write(dir.join("savio_manifest.json"), manifest_bytes);
            }
        }
        _ => {}
    }
}

pub fn get_cloud_game_manifest(
    game_id: &str,
    game_name: &str,
    store: Option<&str>,
    target_type: &str,
    settings: &Value,
) -> Option<Value> {
    let service_name = resolve_service_name(store, game_id);
    let safe_service = sanitize_filename(&service_name);
    let safe_game = sanitize_filename(game_name);

    match target_type {
        "local" | "nas" | "asus" => {
            if let Ok(dest_root) = resolve_dest_root(target_type, settings) {
                let p = dest_root.join(&safe_service).join(&safe_game).join("savio_manifest.json");
                if let Ok(c) = fs::read_to_string(p) {
                    return serde_json::from_str(&c).ok();
                }
            }
        }
        "gdrive" => {
            let user_path = settings.get("gdrivePath").and_then(|v| v.as_str()).unwrap_or("");
            let dest_root = if !user_path.is_empty() {
                PathBuf::from(user_path)
            } else {
                let g_my = PathBuf::from(r"G:\My Drive\SavioSaves");
                let g_ru = PathBuf::from(r"G:\Мой диск\SavioSaves");
                if g_my.exists() { g_my } else { g_ru }
            };
            let p = dest_root.join(&safe_service).join(&safe_game).join("savio_manifest.json");
            if let Ok(c) = fs::read_to_string(p) {
                return serde_json::from_str(&c).ok();
            }
        }
        "mega" => {
            let user_path = settings.get("megaPath").and_then(|v| v.as_str()).unwrap_or("");
            let local_root = if !user_path.is_empty() {
                PathBuf::from(user_path)
            } else if let Ok(up) = std::env::var("USERPROFILE") {
                PathBuf::from(up).join("MEGAsync").join("SavioSaves")
            } else {
                PathBuf::new()
            };
            let p = local_root.join(&safe_service).join(&safe_game).join("savio_manifest.json");
            if let Ok(c) = fs::read_to_string(p) {
                return serde_json::from_str(&c).ok();
            }
        }
        _ => {}
    }
    None
}

pub fn toggle_cloud_backup_lock(
    game_name: &str,
    store: Option<&str>,
    file_name: &str,
    target_type: &str,
    settings: &Value,
) -> Result<String, String> {
    let service_name = resolve_service_name(store, "");
    let safe_service = sanitize_filename(&service_name);
    let safe_game = sanitize_filename(game_name);

    let new_file_name = if file_name.contains("_LOCKED.zip") {
        file_name.replace("_LOCKED.zip", ".zip")
    } else if file_name.ends_with(".zip") {
        file_name.replace(".zip", "_LOCKED.zip")
    } else {
        format!("{}_LOCKED", file_name)
    };

    match target_type {
        "mega" => {
            let rclone = get_rclone_path().ok_or_else(|| "rclone не найден".to_string())?;
            let email = settings.get("megaAuth").and_then(|a| a.get("email")).and_then(|e| e.as_str()).unwrap_or("");
            let pass = settings.get("megaAuth").and_then(|a| a.get("obscuredPass")).and_then(|p| p.as_str()).unwrap_or("");
            let remote_old = format!(":mega:SavioSaves/{}/{}/{}", safe_service, safe_game, file_name);
            let remote_new = format!(":mega:SavioSaves/{}/{}/{}", safe_service, safe_game, new_file_name);
            let out = silent_command(&rclone.to_string_lossy())
                .args(&[
                    "moveto",
                    &remote_old,
                    &remote_new,
                    "--mega-user", email,
                    "--mega-pass", pass,
                ])
                .output()
                .map_err(|e| format!("Ошибка переименования в MEGA: {}", e))?;
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr);
                return Err(format!("Не удалось переименовать файл в MEGA: {}", err.lines().last().unwrap_or("Ошибка")));
            }
        }

        "gdrive" => {
            let mut renamed = false;
            if let Some(rclone) = get_rclone_path() {
                if let Ok((token, refresh_token)) = ensure_valid_gdrive_token(settings) {
                    let remote_old = format!(":drive:SavioSaves/{}/{}/{}", safe_service, safe_game, file_name);
                    let remote_new = format!(":drive:SavioSaves/{}/{}/{}", safe_service, safe_game, new_file_name);
                    let token_json = serde_json::json!({
                        "access_token": token,
                        "token_type": "Bearer",
                        "refresh_token": refresh_token,
                    }).to_string();
                    let out = silent_command(&rclone.to_string_lossy())
                        .args(&[
                            "moveto",
                            &remote_old,
                            &remote_new,
                            "--drive-token", &token_json,
                            "--drive-scope", "drive.file",
                        ])
                        .output();
                    if let Ok(o) = out {
                        if o.status.success() {
                            renamed = true;
                        }
                    }
                }
            }
            if !renamed {
                let user_path = settings.get("gdrivePath").and_then(|v| v.as_str()).unwrap_or("");
                let dest_root = if !user_path.is_empty() {
                    PathBuf::from(user_path)
                } else {
                    let g_my = PathBuf::from(r"G:\My Drive\SavioSaves");
                    let g_ru = PathBuf::from(r"G:\Мой диск\SavioSaves");
                    if g_my.exists() { g_my } else { g_ru }
                };
                let old_path = dest_root.join(&safe_service).join(&safe_game).join(file_name);
                let new_path = dest_root.join(&safe_service).join(&safe_game).join(&new_file_name);
                fs::rename(&old_path, &new_path)
                    .map_err(|e| format!("Ошибка переименования в Google Drive: {}", e))?;
            }
        }
        "asus" | "nas" | "local" => {
            let dest_root = resolve_dest_root(target_type, settings)?;
            let old_path = dest_root.join(&safe_service).join(&safe_game).join(file_name);
            let new_path = dest_root.join(&safe_service).join(&safe_game).join(&new_file_name);
            fs::rename(&old_path, &new_path)
                .map_err(|e| format!("Ошибка переименования: {}", e))?;
        }
        _ => return Err("Неподдерживаемый тип хранилища".to_string()),
    }

    Ok(new_file_name)
}

fn chrono_or_fallback_ts(s: &str) -> Option<u64> {
    if s.len() < 19 {
        return None;
    }
    let year: u64 = s[0..4].parse().ok()?;
    let month: u64 = s[5..7].parse().ok()?;
    let day: u64 = s[8..10].parse().ok()?;
    let hour: u64 = s[11..13].parse().ok()?;
    let min: u64 = s[14..16].parse().ok()?;
    let sec: u64 = s[17..19].parse().ok()?;

    let mut days = (year - 1970) * 365 + (year - 1969) / 4;
    let days_in_months = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    if month >= 1 && month <= 12 {
        days += days_in_months[(month - 1) as usize];
    }
    days += day.saturating_sub(1);
    Some(days * 86400 + hour * 3600 + min * 60 + sec)
}

fn calc_stats(dir: &Path, total_size: &mut u64, file_count: &mut usize) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                calc_stats(&p, total_size, file_count);
            } else if p.is_file() {
                if let Ok(meta) = entry.metadata() {
                    *total_size += meta.len();
                    *file_count += 1;
                }
            }
        }
    }
}

fn format_timestamp(ts: u64) -> String {
    // Basic human-readable format: DD.MM.YYYY HH:MM
    let seconds_in_day = 86400;
    let days_since_epoch = ts / seconds_in_day;
    let time_of_day = ts % seconds_in_day;
    let hours = (time_of_day / 3600 + 3) % 24; // approx UTC+3
    let minutes = (time_of_day % 3600) / 60;

    // Approximate date
    let year = 1970 + days_since_epoch / 365;
    let day_of_year = days_since_epoch % 365;
    let month = (day_of_year / 30).min(11) + 1;
    let day = (day_of_year % 30) + 1;

    format!("{:02}.{:02}.{} {:02}:{:02}", day, month, year, hours, minutes)
}

fn rand_suffix() -> u32 {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    (now & 0xFFFFFF) as u32
}

/// Adapts a save path recorded in a backup archive or manifest to the current PC.
/// For example, if the backup was created on a machine where Windows user was "Alex" (C:\Users\Alex\AppData\Local\Game\Saves\12345),
/// and the current user is "roslo", it replaces the user profile root with C:\Users\roslo\AppData\Local\Game\Saves\12345.
pub fn adapt_save_path_to_current_pc(orig_path: &str) -> String {
    let current_profile = std::env::var("USERPROFILE").unwrap_or_default();
    if current_profile.is_empty() || orig_path.is_empty() {
        return orig_path.to_string();
    }
    let norm_orig = orig_path.replace('/', "\\");
    let lower_orig = norm_orig.to_lowercase();

    if let Some(idx) = lower_orig.find(r"\users\") {
        let after_users = &norm_orig[idx + 7..];
        if let Some(slash_idx) = after_users.find('\\') {
            let relative_from_profile = &after_users[slash_idx..];
            return format!("{}{}", current_profile.trim_end_matches('\\'), relative_from_profile);
        }
    }

    norm_orig
}

/// Peeks into a cloud backup or local archive metadata to retrieve the original save path
/// and user ID folder structure, allowing clean restoration even if the local folder was deleted.
pub fn inspect_archive_metadata(
    _data_dir: &Path,
    target_type: &str,
    settings: &Value,
    game_name: &str,
    file_name: &str,
    store: Option<&str>,
    game_id: Option<&str>,
) -> Result<Value, String> {
    // 1. Try reading savio_manifest.json from cloud/local storage
    if let Some(manifest) = get_cloud_game_manifest(game_id.unwrap_or(""), game_name, store, target_type, settings) {
        if let Some(orig) = manifest.get("originalSavePath").and_then(|v| v.as_str()) {
            if !orig.is_empty() {
                let adapted = adapt_save_path_to_current_pc(orig);
                let exists = Path::new(&adapted).exists();
                return Ok(serde_json::json!({
                    "originalSavePath": orig,
                    "adaptedSavePath": adapted,
                    "folderExists": exists,
                    "store": manifest.get("store").and_then(|v| v.as_str()).unwrap_or(store.unwrap_or("Custom")),
                    "lastBackupFile": manifest.get("lastBackupFile").and_then(|v| v.as_str()).unwrap_or(file_name)
                }));
            }
        }
    }

    // 2. If it's a locally accessible file (local, nas, asus, or downloaded temp file)
    let candidate_path = match target_type {
        "local" | "nas" | "asus" => {
            if let Ok(dest_root) = resolve_dest_root(target_type, settings) {
                let service_name = resolve_service_name(store, game_id.unwrap_or(""));
                let safe_service = sanitize_filename(&service_name);
                let safe_game = sanitize_filename(game_name);
                let f = dest_root.join(&safe_service).join(&safe_game).join(file_name);
                if f.is_file() {
                    Some(f)
                } else {
                    let legacy = dest_root.join(&safe_game).join(file_name);
                    if legacy.is_file() { Some(legacy) } else { None }
                }
            } else {
                None
            }
        }
        _ => {
            let direct = PathBuf::from(file_name);
            if direct.is_file() {
                Some(direct)
            } else {
                None
            }
        }
    };

    if let Some(zip_file) = candidate_path {
        let output = silent_command("tar.exe")
            .args(&["-xf", &zip_file.to_string_lossy(), "savio_meta.json", "-O"])
            .output();

        if let Ok(out) = output {
            if out.status.success() && !out.stdout.is_empty() {
                if let Ok(meta) = serde_json::from_slice::<Value>(&out.stdout) {
                    if let Some(orig) = meta.get("originalSavePath").or_else(|| meta.get("original_save_path")).and_then(|v| v.as_str()) {
                        let adapted = adapt_save_path_to_current_pc(orig);
                        let exists = Path::new(&adapted).exists();
                        return Ok(serde_json::json!({
                            "originalSavePath": orig,
                            "adaptedSavePath": adapted,
                            "folderExists": exists,
                            "store": meta.get("store").and_then(|v| v.as_str()).unwrap_or("Custom"),
                            "saveFolderName": meta.get("save_folder_name").and_then(|v| v.as_str())
                        }));
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "originalSavePath": Value::Null,
        "adaptedSavePath": Value::Null,
        "folderExists": false
    }))
}

