use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::DetectedGame;
use crate::system::{get_logical_drives, read_reg_string, read_reg_subkeys};

pub fn scan_rockstar_games() -> Vec<DetectedGame> {
    let mut games = Vec::new();
    let mut seen_dirs = HashSet::new();

    // 1. Scan from Windows Registry
    // HKLM\SOFTWARE\WOW6432Node\Rockstar Games and HKLM\SOFTWARE\Rockstar Games
    let reg_roots = [
        (1, r"SOFTWARE\WOW6432Node\Rockstar Games"),
        (1, r"SOFTWARE\Rockstar Games"),
        (0, r"SOFTWARE\Rockstar Games"),
    ];

    for (hkey, root_key) in reg_roots {
        let subkeys = read_reg_subkeys(hkey, root_key);
        for sub in subkeys {
            let sub_lower = sub.to_lowercase();
            if sub_lower == "launcher"
                || sub_lower.contains("social club")
                || sub_lower == "uninstall"
                || sub_lower == "settings"
            {
                continue;
            }

            let full_subkey = format!(r"{}\{}", root_key, sub);
            let mut install_folder = read_reg_string(hkey, &full_subkey, "InstallFolder");
            if install_folder.is_none() {
                install_folder = read_reg_string(hkey, &full_subkey, "InstallFolderEpic");
            }
            if install_folder.is_none() {
                install_folder = read_reg_string(hkey, &full_subkey, "InstallFolderSteam");
            }

            if let Some(folder) = install_folder {
                let folder_path = PathBuf::from(&folder);
                if folder_path.is_dir() {
                    let norm = folder.replace('\\', "/").trim_end_matches('/').to_lowercase();
                    if seen_dirs.insert(norm) {
                        if let Some(game) = build_rockstar_game(&sub, &folder_path) {
                            games.push(game);
                        }
                    }
                }
            }
        }
    }

    // 2. Scan standard filesystem paths for Rockstar Games
    let mut candidate_parents = vec![
        PathBuf::from(r"C:\Program Files\Rockstar Games"),
        PathBuf::from(r"C:\Program Files (x86)\Rockstar Games"),
    ];

    for drive in get_logical_drives() {
        let d_path = PathBuf::from(&drive).join("Rockstar Games");
        if d_path.is_dir() && !candidate_parents.contains(&d_path) {
            candidate_parents.push(d_path);
        }
        let d_games = PathBuf::from(&drive).join("Games").join("Rockstar Games");
        if d_games.is_dir() && !candidate_parents.contains(&d_games) {
            candidate_parents.push(d_games);
        }
    }

    for parent in candidate_parents {
        if let Ok(entries) = fs::read_dir(&parent) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let dir_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    let dir_lower = dir_name.to_lowercase();
                    if dir_lower == "launcher"
                        || dir_lower.contains("social club")
                        || dir_lower == "uninstall"
                        || dir_lower.starts_with('.')
                        || dir_lower.starts_with('$')
                    {
                        continue;
                    }

                    let norm = p.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_lowercase();
                    if seen_dirs.insert(norm) {
                        if let Some(game) = build_rockstar_game(dir_name, &p) {
                            games.push(game);
                        }
                    }
                }
            }
        }
    }

    games
}

fn build_rockstar_game(raw_title: &str, folder: &Path) -> Option<DetectedGame> {
    // Find primary game executable
    let mut exe_path = None;

    if let Ok(entries) = fs::read_dir(folder) {
        let mut exes: Vec<PathBuf> = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.eq_ignore_ascii_case("exe") {
                        let name_lower = path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        // Ignore uninstaller or crash helpers
                        if !name_lower.starts_with("unins")
                            && !name_lower.contains("crash")
                            && !name_lower.contains("helper")
                            && !name_lower.contains("updater")
                        {
                            exes.push(path);
                        }
                    }
                }
            }
        }

        // Prioritize well-known executables
        for known in &["rdr2.exe", "gta5.exe", "playrdr2.exe", "playgtav.exe", "lanoire.exe", "maxpayne3.exe"] {
            if let Some(found) = exes.iter().find(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.to_lowercase() == *known)
                    .unwrap_or(false)
            }) {
                exe_path = Some(found.to_string_lossy().into_owned());
                break;
            }
        }

        // If not found in known, pick the largest executable (main game bin)
        if exe_path.is_none() && !exes.is_empty() {
            let mut largest = &exes[0];
            let mut max_size = 0u64;
            for exe in &exes {
                if let Ok(meta) = fs::metadata(exe) {
                    if meta.len() > max_size {
                        max_size = meta.len();
                        largest = exe;
                    }
                }
            }
            exe_path = Some(largest.to_string_lossy().into_owned());
        }
    }

    let clean_id_part = raw_title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>();
    let id = format!("rockstar-{}", clean_id_part.trim_matches('_'));

    Some(DetectedGame {
        id,
        name: raw_title.to_string(),
        store: "Rockstar Games".to_string(),
        store_id: raw_title.to_string(),
        install_dir: folder.to_string_lossy().into_owned(),
        exe_path,
        cover_url: None,
        last_played: None,
        size_bytes: None,
        save_info: None,
    })
}
