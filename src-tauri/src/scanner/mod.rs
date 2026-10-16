use std::collections::HashSet;
use std::path::Path;
use serde::{Deserialize, Serialize};

use crate::saves::SaveInfo;

pub mod epic;
pub mod pc_scanner;
pub mod rockstar;
pub mod steam;
pub mod ubisoft;
pub mod vdf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedGame {
    pub id: String,
    pub name: String,
    pub store: String, // "Steam" | "Epic Games" | "Ubisoft" | "Rockstar Games" | "GOG" | "Xbox" | "Custom"
    pub store_id: String,
    pub install_dir: String,
    pub exe_path: Option<String>,
    pub cover_url: Option<String>,
    pub last_played: Option<u64>,
    pub size_bytes: Option<u64>,
    pub save_info: Option<SaveInfo>,
}

pub fn scan_all_games() -> Vec<DetectedGame> {
    let mut raw_games = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_dirs = HashSet::new();

    let all_scanned = vec![
        steam::scan_steam_games(),
        epic::scan_epic_games(),
        ubisoft::scan_ubisoft_games(),
        rockstar::scan_rockstar_games(),
    ];

    for store_games in all_scanned {
        for mut game in store_games {
            // Ensure folder actually exists on disk
            let install_path = Path::new(&game.install_dir);
            if !install_path.is_dir() {
                continue;
            }

            // Deduplicate by ID
            if !seen_ids.insert(game.id.clone()) {
                continue;
            }

            // Deduplicate by normalized canonical path
            let norm_dir = install_path
                .canonicalize()
                .map(|p| p.to_string_lossy().into_owned().to_lowercase())
                .unwrap_or_else(|_| {
                    game.install_dir
                        .replace('\\', "/")
                        .trim_end_matches('/')
                        .to_lowercase()
                });

            if !seen_dirs.insert(norm_dir) {
                continue;
            }

            // Resolve real saves on disk
            game.save_info = crate::saves::resolve_game_saves(&game);

            raw_games.push(game);
        }
    }

    // Sort alphabetically by name
    raw_games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    raw_games
}
