use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::scanner::DetectedGame;

/// Words in executable names to reject
const EXCLUDE_EXE_PATTERNS: &[&str] = &[
    "unins",
    "uninstall",
    "setup",
    "dxsetup",
    "vcredist",
    "vc_redist",
    "crash",
    "unitycrash",
    "reporter",
    "handler",
    "helper",
    "updater",
    "easyanticheat",
    "patch",
    "launcher-installer",
    "installer",
    "redist",
    "support",
    "config",
    "settings",
    "dotnet",
    "oalinst",
    "battleye",
    "chrome",
    "firefox",
    "opera",
    "brave",
    "msedge",
    "code",
    "git",
    "node",
    "python",
    "telegram",
    "discord",
    "vlc",
    "spotify",
    "slack",
    "obs64",
    "obs32",
    "7z",
    "winrar",
    "utorrent",
    "qbittorrent",
    "zoom",
    "teams",
    "skype",
    "cmd",
    "powershell",
    "conhost",
    "bash",
    "wt",
];

/// Non-game software directory or app names to strictly reject
const NON_GAME_APP_KEYWORDS: &[&str] = &[
    "chrome", "firefox", "opera", "brave", "edge", "mozilla",
    "vscode", "visual studio", "code", "git", "github", "node", "nodejs",
    "python", "telegram", "discord", "vlc", "spotify", "slack", "obs",
    "blender", "photoshop", "premiere", "audacity", "7-zip", "winrar",
    "nvidia", "intel", "amd", "realtek", "driver", "drivers",
    "torrent", "utorrent", "qbittorrent", "bitcomet",
    "antivirus", "kaspersky", "avast", "office", "zoom", "teams", "skype",
    "virtualbox", "vmware", "docker", "postman", "figma", "jetbrains",
    "android", "steam", "epic games launcher", "ubisoft connect", "rockstar games launcher",
    "origin", "ea desktop", "riot games", "riot client", "battlenet", "battle.net",
    "wamp", "xampp", "mysql", "postgresql", "mongodb", "redis", "nginx", "apache",
    "cursor", "sublime", "notepad++", "rider", "clion", "webstorm", "pycharm",
    "gimp", "inkscape", "obsidian", "notion", "anydesk", "teamviewer",
    "yandex", "mail.ru", "drweb", "bitdefender", "malwarebytes",
    "msi afterburner", "rivatuner", "geforce experience", "armoury crate",
    "temp", "cache", "downloads", "documents", "pictures", "music", "videos",
];

/// Known non-game system folder names on Windows drives
const SYSTEM_DIR_NAMES: &[&str] = &[
    "$recycle.bin",
    "system volume information",
    "perflogs",
    "recovery",
    "documents and settings",
    "windows",
    "temp",
    "programdata",
    "msdownld.tmp",
    "onedrivetemp",
    "inetpub",
    "msocache",
    "config.msi",
];

/// Known game franchise keywords for immediate recognition
const KNOWN_GAME_FRANCHISE_KEYWORDS: &[&str] = &[
    "witcher", "cyberpunk", "gta", "grand theft auto", "red dead", "rdr",
    "elder scrolls", "skyrim", "oblivion", "fallout", "baldurs gate", "baldur",
    "dark souls", "elden ring", "sekiro", "bloodborne", "armored core",
    "resident evil", "silent hill", "dead space", "dead island", "dying light",
    "assassins creed", "far cry", "watch dogs", "splinter cell", "ghost recon",
    "the division", "forza", "need for speed", "burnout", "dirt",
    "metro 2033", "metro last light", "metro exodus", "stalker", "s.t.a.l.k.e.r",
    "bioshock", "dishonored", "prey", "deathloop", "half-life", "portal",
    "tomb raider", "hitman", "deus ex", "mass effect", "dragon age",
    "monster hunter", "final fantasy", "kingdom come", "hogwarts legacy",
    "starfield", "god of war", "horizon zero", "horizon forbidden", "spider-man", "spiderman",
    "the last of us", "uncharted", "death stranding", "control", "alan wake",
    "subnautica", "valheim", "hollow knight", "celeste", "hades", "terraria",
    "minecraft", "stardew valley", "factorio", "rimworld", "palworld",
    "teardown", "beamng", "euro truck", "farming simulator", "cities skylines",
    "atomic heart", "black myth", "helldivers", "ghost of tsushima", "payday",
    "mount & blade", "mount and blade", "civilization", "total war", "crusader kings",
];

/// Scan PC drives and custom user directories for games
pub fn scan_pc_games(drives: &[String], custom_paths: &[String]) -> Vec<DetectedGame> {
    let mut detected_games = Vec::new();
    let mut seen_dirs = HashSet::new();
    let mut seen_names = HashSet::new();

    // 1. Candidate folders from drives
    let mut scan_roots: Vec<PathBuf> = Vec::new();

    for d in drives {
        let drive_path = Path::new(d);
        if !drive_path.is_dir() {
            continue;
        }

        // Common dedicated standalone game parent directories on any drive
        let common_dirs = [
            "Games",
            "Игры",
            "Program Files/Games",
            "Program Files (x86)/Games",
            "GOG Games",
            "Program Files/GOG Galaxy/Games",
            "Program Files (x86)/GOG Galaxy/Games",
            "XboxGames",
            "Torrent Games",
            "Repacks",
            "Standalone Games",
        ];

        for sub in common_dirs {
            let candidate = drive_path.join(sub);
            if candidate.is_dir() {
                scan_roots.push(candidate);
            }
        }

        // On non-C drives, inspect direct subdirectories of root, skipping stores and non-game folders
        let drive_letter = d.chars().next().unwrap_or('C').to_ascii_uppercase();
        if drive_letter != 'C' {
            if let Ok(entries) = fs::read_dir(drive_path) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                        let is_system = SYSTEM_DIR_NAMES.iter().any(|&sys| sys == name);
                        let is_store = name == "games"
                            || name == "игры"
                            || name.contains("steam")
                            || name.contains("epic")
                            || name.contains("ubisoft")
                            || name.contains("gog")
                            || name.contains("ea ")
                            || name.contains("origin")
                            || name.contains("riot")
                            || name.contains("battle.net");

                        let is_blacklisted = NON_GAME_APP_KEYWORDS.iter().any(|&kw| name == kw || name.contains(kw));

                        if !is_system && !is_store && !is_blacklisted {
                            inspect_game_folder(&p, &mut detected_games, &mut seen_dirs, &mut seen_names);
                        }
                    }
                }
            }
        }
    }

    // 2. Add custom user folders
    for c in custom_paths {
        let custom_dir = PathBuf::from(c);
        if custom_dir.is_dir() {
            // Check if the custom dir itself is a game folder
            if !inspect_game_folder(&custom_dir, &mut detected_games, &mut seen_dirs, &mut seen_names) {
                // If not, treat as a parent directory containing games
                scan_roots.push(custom_dir);
            }
        }
    }

    // 3. Scan all candidate subdirectories in scan_roots
    for root in scan_roots {
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                    if !SYSTEM_DIR_NAMES.iter().any(|&sys| sys == name) {
                        inspect_game_folder(&p, &mut detected_games, &mut seen_dirs, &mut seen_names);
                    }
                }
            }
        }
    }

    // Sort alphabetically by name
    detected_games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    detected_games
}

/// Inspect a directory: if it satisfies game criteria, creates a DetectedGame
fn inspect_game_folder(
    folder: &Path,
    detected_games: &mut Vec<DetectedGame>,
    seen_dirs: &mut HashSet<String>,
    seen_names: &mut HashSet<String>,
) -> bool {
    let norm_dir = folder
        .canonicalize()
        .map(|p| p.to_string_lossy().into_owned().to_lowercase())
        .unwrap_or_else(|_| folder.to_string_lossy().into_owned().to_lowercase());

    if !seen_dirs.insert(norm_dir.clone()) {
        return false;
    }

    let folder_name = match folder.file_name().and_then(|n| n.to_str()) {
        Some(name) => name.trim(),
        None => return false,
    };

    if folder_name.is_empty() || folder_name.starts_with('$') || folder_name.starts_with('.') {
        return false;
    }

    let folder_lower = folder_name.to_lowercase();

    // 1. Strict blacklist check: reject non-game applications immediately
    if NON_GAME_APP_KEYWORDS.iter().any(|&kw| folder_lower == kw || folder_lower.contains(kw)) {
        return false;
    }
    if SYSTEM_DIR_NAMES.iter().any(|&sys| folder_lower == sys) {
        return false;
    }

    let clean_name = clean_game_name(folder_name);
    if clean_name.is_empty() {
        return false;
    }

    // 2. Find executables in folder (root and depth 1 subfolders like bin/, x64/, etc.)
    let mut exes = Vec::new();
    find_executables_in_folder(folder, 0, &mut exes);

    if exes.is_empty() {
        return false;
    }

    // Double-check executable names against non-game apps
    let all_exes_blacklisted = exes.iter().all(|e| {
        let elower = e.name.to_lowercase();
        NON_GAME_APP_KEYWORDS.iter().any(|&kw| elower.contains(kw))
    });
    if all_exes_blacklisted {
        return false;
    }

    // 3. Verify game signatures (engine DLLs, asset archives, asset folders, save resolution)
    let size_bytes = calc_dir_size(folder);
    if !is_real_game_directory(folder, &clean_name, &exes, size_bytes) {
        return false;
    }

    // Pick best game executable
    let best_exe = pick_best_exe(&clean_name, &exes);

    let norm_name = clean_name.to_lowercase();
    if !seen_names.insert(norm_name.clone()) {
        return false;
    }

    // Build DetectedGame and resolve real saves
    let temp_game = DetectedGame {
        id: format!("custom_{}", sanitize_id(&clean_name)),
        name: clean_name.clone(),
        store: "Custom".to_string(),
        store_id: clean_name.clone(),
        install_dir: folder.to_string_lossy().into_owned(),
        exe_path: best_exe.clone(),
        cover_url: None,
        last_played: None,
        size_bytes: Some(size_bytes),
        save_info: None,
    };

    let save_info = crate::saves::resolve_game_saves(&temp_game);

    let final_game = DetectedGame {
        save_info,
        ..temp_game
    };

    detected_games.push(final_game);
    true
}

/// Checks whether a folder contains actual game assets, engine signatures, or matches known game franchises
fn is_real_game_directory(folder: &Path, clean_name: &str, exes: &[ExeCandidate], size_bytes: u64) -> bool {
    let lower_name = clean_name.to_lowercase();

    // 1. Matches known game franchise or database
    if KNOWN_GAME_FRANCHISE_KEYWORDS.iter().any(|&kw| lower_name.contains(kw)) {
        return true;
    }

    // 2. Scan files & subdirectories (depth 0 to 2) for game engines & assets
    let mut has_engine_dll = false;
    let mut has_game_archive = false;
    let mut has_game_folder = false;

    if let Ok(entries) = fs::read_dir(folder) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    // Game asset archives
                    if matches!(
                        ext_lower.as_str(),
                        "pak" | "pck" | "dat" | "vpk" | "bundle" | "assets" | "unity3d"
                            | "rpa" | "big" | "ba2" | "bsa" | "forge" | "cpk" | "arc" | "wad" | "rgpack" | "cas"
                    ) {
                        has_game_archive = true;
                    }
                    if ext_lower == "dll" {
                        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                        if stem.starts_with("unityplayer")
                            || stem.starts_with("steam_api")
                            || stem.starts_with("galaxy")
                            || stem.starts_with("eossdk")
                            || stem.starts_with("binkw")
                            || stem.starts_with("bink2")
                            || stem.starts_with("fmod")
                            || stem.starts_with("openal")
                            || stem.starts_with("physx")
                            || stem.starts_with("nvngx_dlss")
                            || stem.starts_with("sl.common")
                            || stem.starts_with("d3dx9")
                            || stem.starts_with("xinput")
                        {
                            has_engine_dll = true;
                        }
                    }
                }
            } else if p.is_dir() {
                let d_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                if matches!(
                    d_name.as_str(),
                    "content" | "data" | "gamedata" | "binaries" | "engine" | "monobleedingedge"
                ) {
                    has_game_folder = true;
                }

                // Check subfolder for DLLs/assets
                if let Ok(sub_entries) = fs::read_dir(&p) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_p = sub_entry.path();
                        if sub_p.is_file() {
                            if let Some(ext) = sub_p.extension().and_then(|e| e.to_str()) {
                                let ext_lower = ext.to_lowercase();
                                if matches!(
                                    ext_lower.as_str(),
                                    "pak" | "pck" | "dat" | "vpk" | "bundle" | "assets" | "forge"
                                ) {
                                    has_game_archive = true;
                                }
                                if ext_lower == "dll" {
                                    let stem = sub_p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                                    if stem.starts_with("unityplayer")
                                        || stem.starts_with("steam_api")
                                        || stem.starts_with("galaxy")
                                        || stem.starts_with("eossdk")
                                        || stem.starts_with("binkw")
                                        || stem.starts_with("fmod")
                                    {
                                        has_engine_dll = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if has_engine_dll || has_game_archive || has_game_folder {
        return true;
    }

    // 3. Executable engine signatures (e.g. main exe > 25 MB with game-like characteristics)
    let has_large_exe = exes.iter().any(|e| e.size >= 25 * 1024 * 1024);
    if has_large_exe && size_bytes >= 50 * 1024 * 1024 {
        return true;
    }

    false
}

struct ExeCandidate {
    path: PathBuf,
    name: String,
    size: u64,
    depth: usize,
}

fn find_executables_in_folder(dir: &Path, depth: usize, exes: &mut Vec<ExeCandidate>) {
    if depth > 2 {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() {
            if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                if ext.eq_ignore_ascii_case("exe") {
                    let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    if !file_name.is_empty() {
                        let lower = file_name.to_lowercase();
                        let is_excluded = EXCLUDE_EXE_PATTERNS.iter().any(|pat| lower.contains(pat));
                        if !is_excluded {
                            let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                            exes.push(ExeCandidate {
                                path: p,
                                name: file_name,
                                size,
                                depth,
                            });
                        }
                    }
                }
            }
        } else if p.is_dir() && depth < 2 {
            let dir_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            if !dir_name.starts_with('.') 
                && dir_name != "support" 
                && dir_name != "redist" 
                && dir_name != "_commonredist" 
                && dir_name != "directx" 
                && dir_name != "installer" 
                && dir_name != "mono"
                && !NON_GAME_APP_KEYWORDS.iter().any(|&kw| dir_name == kw)
            {
                find_executables_in_folder(&p, depth + 1, exes);
            }
        }
    }
}

fn pick_best_exe(game_name: &str, exes: &[ExeCandidate]) -> Option<String> {
    if exes.is_empty() {
        return None;
    }

    let clean_game = game_name
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>();

    let mut scored: Vec<(&ExeCandidate, i64)> = exes
        .iter()
        .map(|e| {
            let mut score = 0i64;

            // Prioritize root folder executables (+1000)
            if e.depth == 0 {
                score += 1000;
            } else if e.depth == 1 {
                score += 200;
            }

            // Exe name similarity with game name (+500)
            let clean_exe = e
                .name
                .to_lowercase()
                .trim_end_matches(".exe")
                .chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>();

            if !clean_exe.is_empty() && !clean_game.is_empty() {
                if clean_game.contains(&clean_exe) || clean_exe.contains(&clean_game) {
                    score += 500;
                }
            }

            // Size weight (larger exe is usually the main game engine binary)
            score += (e.size / (1024 * 1024)) as i64;

            (e, score)
        })
        .collect();

    scored.sort_by(|a, b| b.1.cmp(&a.1));
    Some(scored[0].0.path.to_string_lossy().into_owned())
}

/// Cleans folder names from packaging tags
fn clean_game_name(folder_name: &str) -> String {
    let mut name = folder_name.to_string();

    // Remove tags like [FitGirl Repack], [DODI], (GOG), etc.
    while let Some(start) = name.find('[') {
        if let Some(end) = name[start..].find(']') {
            name.replace_range(start..=start + end, " ");
        } else {
            break;
        }
    }

    while let Some(start) = name.find('(') {
        if let Some(end) = name[start..].find(')') {
            name.replace_range(start..=start + end, " ");
        } else {
            break;
        }
    }

    // Remove common suffixes
    let suffixes = &[" COPY", "_COPY", " Copy", " - Copy", " - копия", " копия"];
    for s in suffixes {
        if name.ends_with(s) {
            name = name[..name.len() - s.len()].to_string();
        }
    }

    name.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn sanitize_id(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .filter(|&c| c != ' ')
        .collect()
}

fn calc_dir_size(dir: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                total += fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}
