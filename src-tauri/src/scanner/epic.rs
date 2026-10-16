use std::fs;
use std::path::PathBuf;

use serde_json::Value;

use super::DetectedGame;

pub fn scan_epic_games() -> Vec<DetectedGame> {
    let mut games = Vec::new();
    let manifests_dir = PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests");
    if !manifests_dir.is_dir() {
        return games;
    }

    let entries = match fs::read_dir(&manifests_dir) {
        Ok(e) => e,
        Err(_) => return games,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("item") {
            if let Ok(text) = fs::read_to_string(&path) {
                if let Ok(val) = serde_json::from_str::<Value>(&text) {
                    if let Some(game) = parse_epic_item(&val) {
                        games.push(game);
                    }
                }
            }
        }
    }

    games
}

fn parse_epic_item(val: &Value) -> Option<DetectedGame> {
    let display_name = val.get("DisplayName")?.as_str()?.trim();
    let app_name = val.get("AppName")?.as_str()?.trim();
    let install_location = val.get("InstallLocation")?.as_str()?.trim();

    if display_name.is_empty() || install_location.is_empty() {
        return None;
    }

    // Skip DLC / mods that share a base game folder
    if display_name.contains("REDmod") || display_name.contains("Phantom Liberty") {
        return None;
    }

    let id = format!("epic-{app_name}");

    Some(DetectedGame {
        id,
        name: display_name.to_string(),
        store: "Epic Games".to_string(),
        store_id: app_name.to_string(),
        install_dir: install_location.to_string(),
        exe_path: None,
        cover_url: None,
        last_played: None,
        size_bytes: None,
        save_info: None,
    })
}
