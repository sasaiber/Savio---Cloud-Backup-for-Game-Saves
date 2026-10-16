use std::fs;
use std::path::{Path, PathBuf};

use super::vdf::{parse_vdf, VdfValue};
use super::DetectedGame;
use crate::system::read_reg_string;

pub fn scan_steam_games() -> Vec<DetectedGame> {
    let mut games = Vec::new();
    let steam_path = match get_steam_path() {
        Some(p) => p,
        None => return games,
    };

    let library_vdf_path = steam_path.join("steamapps").join("libraryfolders.vdf");
    let content = match fs::read_to_string(&library_vdf_path) {
        Ok(c) => c,
        Err(_) => return games,
    };

    let vdf = parse_vdf(&content);
    let root = match vdf.get("libraryfolders") {
        Some(VdfValue::Obj(map)) => map,
        _ => return games,
    };

    let mut library_dirs: Vec<PathBuf> = Vec::new();

    for (_, folder_val) in root {
        if let VdfValue::Obj(folder_map) = folder_val {
            if let Some(VdfValue::Str(p)) = folder_map.get("path") {
                let path = PathBuf::from(p);
                if path.is_dir() {
                    let norm = path.canonicalize().unwrap_or(path);
                    if !library_dirs.iter().any(|existing| {
                        existing.canonicalize().unwrap_or_else(|_| existing.clone()) == norm
                    }) {
                        library_dirs.push(norm);
                    }
                }
            }
        }
    }

    if library_dirs.is_empty() {
        library_dirs.push(steam_path.canonicalize().unwrap_or(steam_path));
    }

    for lib_dir in library_dirs {
        let steamapps = lib_dir.join("steamapps");
        let entries = match fs::read_dir(&steamapps) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with("appmanifest_") && name_str.ends_with(".acf") {
                if let Ok(manifest_content) = fs::read_to_string(entry.path()) {
                    if let Some(game) = parse_appmanifest(&manifest_content, &steamapps) {
                        games.push(game);
                    }
                }
            }
        }
    }

    games
}

fn get_steam_path() -> Option<PathBuf> {
    if let Some(p) = read_reg_string(0, r"Software\Valve\Steam", "SteamPath") {
        let path = PathBuf::from(p);
        if path.is_dir() {
            return Some(path);
        }
    }
    if let Some(p) = read_reg_string(1, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath") {
        let path = PathBuf::from(p);
        if path.is_dir() {
            return Some(path);
        }
    }
    let default_path = PathBuf::from(r"C:\Program Files (x86)\Steam");
    if default_path.is_dir() {
        Some(default_path)
    } else {
        None
    }
}

fn parse_appmanifest(content: &str, steamapps_dir: &Path) -> Option<DetectedGame> {
    let vdf = parse_vdf(content);
    let app_state = match vdf.get("AppState") {
        Some(VdfValue::Obj(map)) => map,
        _ => return None,
    };

    let appid = match app_state.get("appid") {
        Some(VdfValue::Str(id)) => id.clone(),
        _ => return None,
    };

    let name = match app_state.get("name") {
        Some(VdfValue::Str(n)) => n.clone(),
        _ => return None,
    };

    // Filter out common tools and runtimes
    if appid == "228980" || appid == "250820" {
        return None;
    }
    let lower_name = name.to_lowercase();
    if lower_name.contains("redistributable")
        || lower_name.contains("proton")
        || lower_name.contains("steam linux runtime")
        || lower_name.contains("dedicated server")
    {
        return None;
    }

    let installdir_name = match app_state.get("installdir") {
        Some(VdfValue::Str(d)) => d.as_str(),
        _ => "",
    };
    let install_dir = steamapps_dir.join("common").join(installdir_name);

    let last_played = app_state
        .get("LastPlayed")
        .and_then(|v| match v {
            VdfValue::Str(s) => s.parse::<u64>().ok(),
            _ => None,
        })
        .filter(|&t| t > 0);

    let size_bytes = app_state.get("SizeOnDisk").and_then(|v| match v {
        VdfValue::Str(s) => s.parse::<u64>().ok(),
        _ => None,
    });

    // Steam CDN delivers high-res portrait posters for all Steam games
    let cover_url = Some(format!(
        "https://cdn.akamai.steamstatic.com/steam/apps/{appid}/library_600x900.jpg"
    ));

    Some(DetectedGame {
        id: format!("steam-{appid}"),
        name,
        store: "Steam".to_string(),
        store_id: appid,
        install_dir: install_dir.to_string_lossy().into_owned(),
        exe_path: None,
        cover_url,
        last_played,
        size_bytes,
        save_info: None,
    })
}
