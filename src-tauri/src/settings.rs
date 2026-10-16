//! Where Savio keeps its own files (settings, cache, logs) and how settings are saved.
//!
//! Two modes:
//! * Installed: everything lives in `%LOCALAPPDATA%\io.savio.desktop`
//!   (the uninstaller can remove this single folder).
//! * Portable: if `portable.mode` (file) or `data` (folder) sits next to `Savio.exe`,
//!   everything lives in that `data` folder and nothing is written to AppData.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde_json::Value;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

pub struct AppPaths {
    pub data_dir: PathBuf,
    pub portable: bool,
}

impl AppPaths {
    pub fn resolve(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let exe = std::env::current_exe()?;
        let exe_dir = exe
            .parent()
            .map(Path::to_path_buf)
            .ok_or("Savio.exe has no parent folder")?;

        let portable = exe_dir.join("portable.mode").is_file() || exe_dir.join("data").is_dir();

        let data_dir = if portable {
            exe_dir.join("data")
        } else {
            app.path().app_local_data_dir()?
        };
        fs::create_dir_all(&data_dir)?;

        Ok(Self { data_dir, portable })
    }

    /// Folder for the WebView2 browser engine cache. In installed mode Tauri already
    /// puts it inside `data_dir`, so we only need to set it explicitly for portable mode.
    pub fn webview_dir(&self) -> PathBuf {
        self.data_dir.join("EBWebView")
    }

    fn settings_path(&self) -> PathBuf {
        self.data_dir.join(SETTINGS_FILE)
    }

    /// Returns saved settings, or `None` on the very first launch.
    /// A damaged settings file is kept as `settings.json.bak` and treated as a first launch.
    pub fn load_settings(&self) -> Option<Value> {
        let path = self.settings_path();
        let text = fs::read_to_string(&path).ok()?;
        match serde_json::from_str::<Value>(&text) {
            Ok(value) if value.is_object() => Some(value),
            _ => {
                let _ = fs::rename(&path, self.data_dir.join("settings.json.bak"));
                None
            }
        }
    }

    /// Saves settings safely: writes a temporary file first, then swaps it in,
    /// so a power cut never leaves a half-written settings file.
    pub fn save_settings(&self, settings: &Value) -> Result<(), String> {
        if !settings.is_object() {
            return Err("Settings must be a JSON object".into());
        }
        let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        let tmp = self.data_dir.join("settings.json.tmp");
        fs::write(&tmp, text).map_err(|e| e.to_string())?;
        fs::rename(&tmp, self.settings_path()).map_err(|e| e.to_string())?;
        Ok(())
    }
}
