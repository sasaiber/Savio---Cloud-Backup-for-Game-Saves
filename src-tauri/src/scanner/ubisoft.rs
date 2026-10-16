use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::DetectedGame;
use crate::system::{get_logical_drives, read_reg_string, read_reg_subkeys};

pub fn scan_ubisoft_games() -> Vec<DetectedGame> {
    let mut games = Vec::new();
    let mut seen_dirs = HashSet::new();

    // 1. Scan from Windows Registry (Ubisoft Launcher Installs)
    let reg_roots = [
        (1, r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs"),
        (1, r"SOFTWARE\Ubisoft\Launcher\Installs"),
        (0, r"SOFTWARE\Ubisoft\Launcher\Installs"),
    ];

    for (hkey, root_key) in reg_roots {
        let subkeys = read_reg_subkeys(hkey, root_key);
        for sub in subkeys {
            let full_subkey = format!(r"{}\{}", root_key, sub);
            if let Some(install_dir) = read_reg_string(hkey, &full_subkey, "InstallDir") {
                let clean_dir = install_dir.trim().trim_end_matches('/').trim_end_matches('\\');
                let path = PathBuf::from(clean_dir);
                if path.is_dir() {
                    let norm = clean_dir.replace('\\', "/").to_lowercase();
                    if seen_dirs.insert(norm) {
                        let name = path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or(&sub)
                            .replace('_', " ");
                        
                        let exe = find_ubisoft_executable(&path);

                        games.push(DetectedGame {
                            id: format!("uplay-{}", sub.to_lowercase().replace(' ', "-")),
                            name,
                            store: "Ubisoft".to_string(),
                            store_id: sub,
                            install_dir: path.to_string_lossy().into_owned(),
                            exe_path: exe,
                            cover_url: None,
                            last_played: None,
                            size_bytes: None,
                            save_info: None,
                        });
                    }
                }
            }
        }
    }

    // 2. Scan standard and drive-based fallback directories
    let mut standard_dirs = vec![
        PathBuf::from(r"C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games"),
        PathBuf::from(r"C:\Program Files\Ubisoft\Ubisoft Game Launcher\games"),
    ];

    for drive in get_logical_drives() {
        let u_path = PathBuf::from(&drive).join("UBISOFT GAMES");
        if u_path.is_dir() && !standard_dirs.contains(&u_path) {
            standard_dirs.push(u_path);
        }
        let u_games = PathBuf::from(&drive).join("Games").join("Ubisoft");
        if u_games.is_dir() && !standard_dirs.contains(&u_games) {
            standard_dirs.push(u_games);
        }
    }

    for base_dir in standard_dirs {
        if !base_dir.is_dir() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(&base_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let path = entry.path();
                        let dir_name = entry.file_name().to_string_lossy().into_owned();
                        let norm = path.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_lowercase();
                        if seen_dirs.insert(norm) {
                            let clean_name = dir_name.replace('_', " ");
                            let exe = find_ubisoft_executable(&path);
                            games.push(DetectedGame {
                                id: format!("uplay-{}", dir_name.to_lowercase().replace(' ', "-")),
                                name: clean_name,
                                store: "Ubisoft".to_string(),
                                store_id: dir_name,
                                install_dir: path.to_string_lossy().into_owned(),
                                exe_path: exe,
                                cover_url: None,
                                last_played: None,
                                size_bytes: None,
                                save_info: None,
                            });
                        }
                    }
                }
            }
        }
    }

    games
}

fn find_ubisoft_executable(folder: &Path) -> Option<String> {
    if let Ok(entries) = fs::read_dir(folder) {
        let mut exes = Vec::new();
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension() {
                    if ext.eq_ignore_ascii_case("exe") {
                        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                        if !stem.starts_with("unins")
                            && !stem.contains("crash")
                            && !stem.contains("helper")
                            && !stem.contains("updater")
                            && !stem.contains("uplay")
                        {
                            exes.push(p);
                        }
                    }
                }
            }
        }
        if !exes.is_empty() {
            let mut largest = &exes[0];
            let mut max_len = 0u64;
            for exe in &exes {
                if let Ok(meta) = fs::metadata(exe) {
                    if meta.len() > max_len {
                        max_len = meta.len();
                        largest = exe;
                    }
                }
            }
            return Some(largest.to_string_lossy().into_owned());
        }
    }
    None
}
