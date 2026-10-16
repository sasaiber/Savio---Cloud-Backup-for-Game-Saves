# Savio 🎮

> **Open-Source Cloud Game Save Vault & Manager for Windows 10/11**  
> Automated backup, multi-cloud synchronization, and conflict resolution built with **Material 3 Expressive**.

[![Windows 11 Compatible](https://img.shields.io/badge/Windows%2011-Compatible-0078D4?logo=windows&logoColor=white)](https://github.com/sasaiber/Savio---Cloud-Backup-for-Game-Saves/releases)
[![Rust](https://img.shields.io/badge/Backend-Rust%20%2F%20Tauri%202.0-DEA584?logo=rust&logoColor=white)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript%20%2B%20Vite-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/badge/Release-v0.1.0-green.svg)](https://github.com/sasaiber/Savio---Cloud-Backup-for-Game-Saves/releases)

---

## 🌟 Key Features

### 🔄 Multi-Cloud & Storage Providers
* **ASUS Router SMB**: Directly sync saves to USB drives connected to ASUS (TUF/ROG/RT) routers with automatic share discovery via SMB (`net view`).
* **Google Drive**: Seamless OAuth-authenticated cloud backup.
* **MEGA Cloud & WebDAV**: End-to-end encrypted and self-hosted storage.
* **Local / External Drives & NAS**: Dedicated local backup paths and network shares with health verification.

### 🎯 Intelligent Game & Save Detection
* **Launcher Libraries**: Auto-detects installed games from:
  - **Steam**
  - **Epic Games**
  - **Ubisoft Connect**
  - **Rockstar Games Launcher** (e.g. *Red Dead Redemption 2*, *GTA V*)
  - **GOG Galaxy**
  - **EA App**
* **Deep PC Drive Scanner**: Scans drives for DRM-Free, standalone, and repackaged games with strict validation heuristics (filters out non-game software, checks game engine signatures like Unity, Unreal Engine, DLSS, PhysX, and asset archives `.pak`, `.pck`, `.dat`, `.vpk`, `.bundle`, `.forge`).
* **Smart Save Resolution**: Locates save folders across `%APPDATA%`, `%LOCALAPPDATA%`, `Saved Games`, `Documents`, and Steam user profiles.

### ⏱️ Automated Game Watcher & Conflict Resolution
* **Automatic Snapshots on Exit**: Watches running game processes in the background and creates a compressed snapshot when you finish playing.
* **Sync-Before-Launch**: Checks whether the cloud version is newer than the local version before starting a game, prompting for resolution to prevent lost progress.
* **Timestamp & Version History**: Easily restore previous save states or view snapshot diffs.

### 📦 100% Portable Mode
* Simply extract the portable package with `portable.mode` present next to `Savio.exe`.
* All settings, snapshots, and databases stay strictly inside the local `data/` directory.
* No traces left in Windows registry or `%LOCALAPPDATA%`.

### 🎨 Material 3 Expressive UI
* Native Windows 11 accent color and dark/light theme integration.
* Smooth physics-based spring animations.
* Multilingual support: English, Russian, Ukrainian, and Polish.

---

## 🚀 Getting Started

### Option 1: Portable Release (Recommended, No Installation)
1. Download **`Savio-Portable-v0.1.0-x64.zip`** from [Releases](https://github.com/sasaiber/Savio---Cloud-Backup-for-Game-Saves/releases).
2. Extract the archive anywhere (e.g., `D:\Savio` or a USB flash drive).
3. Run **`Savio.exe`**.

### Option 2: Build from Source

#### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Rust](https://www.rust-lang.org/) (v1.80+ with MSVC toolchain)
* [Git](https://git-scm.com/)

#### Steps
```bash
# 1. Clone the repository
git clone https://github.com/sasaiber/Savio---Cloud-Backup-for-Game-Saves.git
cd Savio---Cloud-Backup-for-Game-Saves

# 2. Install frontend dependencies
npm install

# 3. Run in development mode (hot-reload)
npm run tauri dev

# 4. Build standalone production binary
npx tauri build --no-bundle
```
The compiled executable will be located at `src-tauri/target/release/savio.exe`.

---

## 📂 Architecture

```
Savio/
├── src/                     # React 19 + TypeScript + Vite frontend
│   ├── components/          # Material 3 UI components (Cards, Buttons, Modals)
│   ├── pages/               # Views: Library, Clouds, Settings, Onboarding
│   ├── locales/             # Translations (en, ru, uk, pl)
│   ├── state/               # Reactive settings and sync configuration
│   └── theme/               # M3 Expressive theme, color tokens, and shapes
├── src-tauri/               # Rust backend (Tauri v2)
│   ├── src/scanner/         # Game launchers and PC drive scanners
│   ├── src/saves/           # Save profile resolution engine
│   ├── src/snapshots.rs     # Backup snapshot creation and rclone cloud bridge
│   ├── src/watcher.rs       # Background game process watcher
│   └── src/system.rs        # Win32 platform integration & SMB share discovery
└── README.md
```

---

## 📜 License

This project is licensed under the **MIT License**.

When borrowing, redistributing, or using portions of this codebase in derivative works, you **must include attribution and a link back to the original repository**:  
👉 `https://github.com/sasaiber/Savio---Cloud-Backup-for-Game-Saves`

See [LICENSE](LICENSE) for full details.
