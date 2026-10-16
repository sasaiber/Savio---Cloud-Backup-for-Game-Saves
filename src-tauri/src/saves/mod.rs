use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

use crate::scanner::DetectedGame;
use crate::system::read_reg_string;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInfo {
    pub primary_path: String,
    pub total_size_bytes: u64,
    pub file_count: usize,
    pub last_modified: Option<u64>,
}

pub fn resolve_game_saves(game: &DetectedGame) -> Option<SaveInfo> {
    let candidates = get_candidates(game);

    for path in candidates {
        if path.is_dir() {
            if let Some(info) = calculate_folder_stats(&path) {
                if info.file_count > 0 {
                    return Some(info);
                }
            }
        }
    }

    None
}

fn get_candidates(game: &DetectedGame) -> Vec<PathBuf> {
    let mut list = Vec::new();

    let clean_name = game
        .name
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != ' ', "")
        .trim()
        .to_string();

    let documents = get_personal_documents_dir();
    let saved_games = get_saved_games_dir();
    let local_appdata = get_local_appdata_dir();
    let appdata = get_appdata_dir();
    let locallow = get_locallow_dir();

    // 1. Specific popular game mappings (exact Save locations checked FIRST)
    if clean_name.contains("cyberpunk") {
        list.push(saved_games.join("CD Projekt Red").join("Cyberpunk 2077"));
    }
    if clean_name.contains("grand theft auto") || clean_name.contains("gta v") || clean_name.contains("gtav") {
        list.push(documents.join("Rockstar Games").join("GTA V").join("Profiles"));
        list.push(documents.join("Rockstar Games").join("GTA V"));
        list.push(documents.join("Rockstar Games").join("GTAV Enhanced").join("Profiles"));
    }
    if clean_name.contains("red dead") || clean_name.contains("rdr") {
        // Red Dead Redemption 2 Profiles
        let rdr_profiles = documents.join("Rockstar Games").join("Red Dead Redemption 2").join("Profiles");
        if rdr_profiles.is_dir() {
            if let Ok(entries) = fs::read_dir(&rdr_profiles) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        list.push(p);
                    }
                }
            }
            list.push(rdr_profiles);
        }
        list.push(documents.join("Rockstar Games").join("Red Dead Redemption 2"));
    }
    if clean_name.contains("dead island 2") {
        list.push(local_appdata.join("DeadIsland").join("Saved").join("SaveGames"));
    }
    if clean_name.contains("7 days to die") {
        list.push(appdata.join("7DaysToDie").join("Saves"));
    }
    if clean_name.contains("days gone") {
        list.push(local_appdata.join("BendGame").join("Saved"));
    }
    if clean_name.contains("sons of the forest") || clean_name.contains("the forest") {
        list.push(locallow.join("Endnight").join("SonsOfTheForest").join("Saves"));
    }
    if clean_name.contains("stalker") || clean_name.contains("s t a l k e r") {
        list.push(local_appdata.join("Stalker2").join("Saved").join("STEAM").join("SaveGames"));
        list.push(local_appdata.join("Stalker2").join("Saved").join("SaveGames"));
        list.push(local_appdata.join("Stalker2").join("Saved"));
    }
    if clean_name.contains("inzoi") {
        list.push(documents.join("inZOI"));
        list.push(local_appdata.join("inZOI").join("Saved").join("SaveGames"));
    }
    if clean_name.contains("teardown") {
        // AppData/Local/Teardown contains the real savegame.xml!
        list.push(local_appdata.join("Teardown"));
    }
    if clean_name.contains("beamng") {
        list.push(local_appdata.join("BeamNG").join("BeamNG.drive").join("current"));
        list.push(local_appdata.join("BeamNG").join("BeamNG.drive"));
        list.push(local_appdata.join("BeamNG"));
    }
    if clean_name.contains("hogwarts") || clean_name.contains("наследие") {
        list.push(local_appdata.join("HogwartsLegacy").join("Saved").join("SaveGames"));
        list.push(local_appdata.join("Hogwarts Legacy").join("Saved").join("SaveGames"));
    }
    if clean_name.contains("witcher 3") {
        list.push(documents.join("The Witcher 3").join("gamesaves"));
    }
    if clean_name.contains("elden ring") {
        list.push(appdata.join("EldenRing"));
    }
    if clean_name.contains("baldur") {
        list.push(local_appdata.join("Larian Studios").join("Baldur's Gate 3").join("PlayerProfiles").join("Public").join("Savegames"));
    }
    if clean_name.contains("dying light 2") {
        list.push(documents.join("dying light 2").join("out").join("save"));
        list.push(documents.join("dying light 2").join("out"));
        list.push(documents.join("dying light 2"));
    }
    if clean_name.contains("dying light the beast") {
        list.push(documents.join("dying light the beast").join("out"));
        list.push(documents.join("dying light the beast"));
    }
    if clean_name.contains("battlefield 4") {
        list.push(documents.join("Battlefield 4").join("settings"));
    }
    if clean_name.contains("battlefield 2042") {
        list.push(documents.join("Battlefield 2042").join("settings"));
    }
    if clean_name.contains("ghost recon") || clean_name.contains("wildlands") {
        list.push(documents.join("My Games").join("Ghost Recon Wildlands"));
    }
    if clean_name.contains("saints row") {
        list.push(local_appdata.join("SaintsRowTheThirdRemastered"));
    }
    if clean_name.contains("the division 2") {
        list.push(documents.join("My Games").join("Tom Clancy's The Division 2"));
    }
    if clean_name.contains("horizon") {
        list.push(documents.join("Horizon Forbidden West Complete Edition"));
    }
    if clean_name.contains("the last of us") {
        list.push(saved_games.join("The Last of Us Part I"));
        list.push(documents.join("The Last of Us Part II"));
    }

    // 2. Store specific save locations
    if game.store == "Ubisoft" {
        if let Some(ubisoft_root) = get_ubisoft_savegames_dir() {
            if let Ok(entries) = fs::read_dir(&ubisoft_root) {
                for account_entry in entries.flatten() {
                    let acc_path = account_entry.path();
                    if acc_path.is_dir() {
                        // Check if game.store_id folder exists inside
                        let game_save_dir = acc_path.join(&game.store_id);
                        if game_save_dir.is_dir() {
                            list.push(game_save_dir);
                        }
                    }
                }
            }
        }
    }

    if game.store == "Steam" {
        if let Some(steam_root) = get_steam_userdata_dir() {
            if let Ok(entries) = fs::read_dir(&steam_root) {
                for account_entry in entries.flatten() {
                    let acc_path = account_entry.path();
                    if acc_path.is_dir() {
                        let remote_dir = acc_path.join(&game.store_id).join("remote");
                        if remote_dir.is_dir() {
                            list.push(remote_dir);
                        }
                        let base_appid_dir = acc_path.join(&game.store_id);
                        if base_appid_dir.is_dir() {
                            list.push(base_appid_dir);
                        }
                    }
                }
            }
        }
    }

    // 3. Automated heuristic checks across Windows known folders
    let exact_name = &game.name;
    list.push(saved_games.join(exact_name));
    list.push(documents.join(exact_name));
    list.push(documents.join("My Games").join(exact_name));
    list.push(local_appdata.join(exact_name).join("Saved").join("SaveGames"));
    list.push(local_appdata.join(exact_name));
    list.push(appdata.join(exact_name));

    list
}

pub fn calculate_folder_stats(dir: &Path) -> Option<SaveInfo> {
    if !dir.is_dir() {
        return None;
    }

    let canonical = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    let comp_count = canonical.components().count();
    // Exclude drive roots like "C:\", "D:\"
    if comp_count <= 2 {
        return None;
    }

    // Exclude dangerous system roots
    let canonical_str = canonical.to_string_lossy().to_lowercase();
    let clean = canonical_str.trim_start_matches(r"\\?\").trim_end_matches('\\');
    if clean == "c:" || clean == "d:" || clean == "e:" 
        || clean == "c:\\windows" || clean == "c:\\users" 
        || clean == "c:\\program files" || clean == "c:\\program files (x86)" {
        return None;
    }

    let mut total_size: u64 = 0;
    let mut file_count: usize = 0;
    let mut latest_mtime: u64 = 0;

    walk_folder(dir, &mut total_size, &mut file_count, &mut latest_mtime, 0);

    if file_count == 0 {
        return None;
    }

    Some(SaveInfo {
        primary_path: dir.to_string_lossy().into_owned(),
        total_size_bytes: total_size,
        file_count,
        last_modified: if latest_mtime > 0 { Some(latest_mtime) } else { None },
    })
}

fn walk_folder(dir: &Path, total_size: &mut u64, file_count: &mut usize, latest_mtime: &mut u64, depth: usize) {
    if depth > 4 || *file_count >= 1000 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if *file_count >= 1000 {
            break;
        }

        // Avoid infinite loops on NTFS junctions/symlinks
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }

        let path = entry.path();
        if file_type.is_file() {
            if let Ok(meta) = entry.metadata() {
                *total_size += meta.len();
                *file_count += 1;
                if let Ok(modified) = meta.modified() {
                    if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let ts = duration.as_secs();
                        if ts > *latest_mtime {
                            *latest_mtime = ts;
                        }
                    }
                }
            }
        } else if file_type.is_dir() {
            // Ignore large cache or screenshot folders
            let dir_name = entry.file_name().to_string_lossy().to_lowercase();
            if dir_name == "screenshots" || dir_name == "logs" || dir_name == "crashes" || dir_name == "cache" {
                continue;
            }
            walk_folder(&path, total_size, file_count, latest_mtime, depth + 1);
        }
    }
}

fn get_personal_documents_dir() -> PathBuf {
    if let Some(personal) = read_reg_string(
        0,
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
        "Personal",
    ) {
        let expanded = expand_env_vars(&personal);
        let path = PathBuf::from(expanded);
        if path.is_dir() {
            return path;
        }
    }

    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let onedrive_docs = PathBuf::from(&userprofile).join("OneDrive").join("Документы");
        if onedrive_docs.is_dir() {
            return onedrive_docs;
        }
        let onedrive_en = PathBuf::from(&userprofile).join("OneDrive").join("Documents");
        if onedrive_en.is_dir() {
            return onedrive_en;
        }
        return PathBuf::from(userprofile).join("Documents");
    }

    PathBuf::from(r"C:\Users\Default\Documents")
}

fn get_saved_games_dir() -> PathBuf {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let path = PathBuf::from(userprofile).join("Saved Games");
        if path.is_dir() {
            return path;
        }
    }
    PathBuf::from(r"C:\Users\Default\Saved Games")
}

fn get_local_appdata_dir() -> PathBuf {
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(local)
    } else {
        PathBuf::from(r"C:\Users\Default\AppData\Local")
    }
}

fn get_locallow_dir() -> PathBuf {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        PathBuf::from(userprofile).join("AppData").join("LocalLow")
    } else {
        PathBuf::from(r"C:\Users\Default\AppData\LocalLow")
    }
}

fn get_appdata_dir() -> PathBuf {
    if let Ok(roaming) = std::env::var("APPDATA") {
        PathBuf::from(roaming)
    } else {
        PathBuf::from(r"C:\Users\Default\AppData\Roaming")
    }
}

fn get_steam_userdata_dir() -> Option<PathBuf> {
    if let Some(p) = read_reg_string(0, r"Software\Valve\Steam", "SteamPath") {
        let path = PathBuf::from(p).join("userdata");
        if path.is_dir() {
            return Some(path);
        }
    }
    let default_path = PathBuf::from(r"C:\Program Files (x86)\Steam\userdata");
    if default_path.is_dir() {
        Some(default_path)
    } else {
        None
    }
}

fn get_ubisoft_savegames_dir() -> Option<PathBuf> {
    let standard = PathBuf::from(r"C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\savegames");
    if standard.is_dir() {
        Some(standard)
    } else {
        None
    }
}

fn expand_env_vars(text: &str) -> String {
    let mut result = text.to_string();
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        result = result.replace("%USERPROFILE%", &userprofile);
    }
    result
}
