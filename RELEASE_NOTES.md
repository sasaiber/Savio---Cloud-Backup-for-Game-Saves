# Savio v0.1.0 — Initial Public Release (Windows 64-bit) 🎮

Savio is an open-source game save backup manager and cloud synchronizer designed specifically for Windows 10/11 with a modern **Material 3 Expressive** interface.

---

## 🌟 What's New in v0.1.0

### 🔄 Multi-Cloud & Storage Support
* **ASUS Router SMB**: Direct backup to USB flash drives or hard drives connected to ASUS routers (TUF / ROG / RT series) with automatic network share discovery (`net view`) and custom credential authentication.
* **Google Drive**: Seamless OAuth direct authentication without complex credential setup.
* **MEGA Cloud & WebDAV**: Direct encrypted remote cloud synchronization.
* **Local & External Drives**: Backup to secondary internal drives, external SSDs, or local NAS servers with disk health checks.

### 🎯 Intelligent Game & Save Detection
* **Launcher Integration**: Automatic scanning and categorization for:
  - Steam
  - Epic Games
  - Ubisoft Connect
  - Rockstar Games Launcher (*Red Dead Redemption 2*, *Grand Theft Auto V*)
  - GOG Galaxy
  - EA App
* **Deep PC Scanner for DRM-Free & Repack Games**: Advanced heuristic engine that filters out non-game software and identifies games through game engine signatures (Unity, Unreal Engine, DLSS, PhysX, FMOD) and game archive containers (`.pak`, `.pck`, `.dat`, `.vpk`, `.bundle`, `.forge`).
* **Deep Save Resolution**: Automatically resolves actual user profile paths across `%APPDATA%`, `%LOCALAPPDATA%`, `Saved Games`, `Documents`, and Steam user directories.

### ⏱️ Automatic Background Watcher
* **Exit Watcher**: Continuously monitors active game processes and automatically creates timestamped compressed backups when a game is closed.
* **Sync-Before-Launch**: Protects against accidental progress overwrites by checking whether cloud saves are newer before launching the game.

### 📦 100% Portable Edition
* Fully standalone operation when running with `portable.mode`. All configuration and backups are saved locally in the `data/` subfolder, leaving no traces in the Windows registry or `%LOCALAPPDATA%`.

---

## 📥 Downloads & Assets

| File | Type | Size | Description |
| :--- | :--- | :--- | :--- |
| **`Savio-Portable-v0.1.0-x64.zip`** | Portable Archive | ~32.4 MB | Standalone portable bundle (`Savio.exe` + `rclone.exe` + `portable.mode`). No install required. |
| **`Savio.exe`** | Executable | ~10.4 MB | Standalone application binary for Windows 10 / 11 (x64). |

### 🔒 Checksums (SHA-256)
```text
Savio-Portable-v0.1.0-x64.zip:
9BA9A79B7AB0CC0AD46D654A06EB3D2DFCBBE5D2BB420ED748C6C2D9EBA0D64C

Savio.exe:
872244972B2B968D5CB8DC2B897D548678CD8D0EFC50108DFF2D80B9A25DE922
```

---

## 🚀 Quick Start
1. Download **`Savio-Portable-v0.1.0-x64.zip`**.
2. Extract to any folder or USB stick (e.g. `D:\Savio`).
3. Run **`Savio.exe`**.
