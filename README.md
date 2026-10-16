# Savio 🎮

> **Open-source Cloud Game Save Vault & Manager for Windows 10/11**  
> Автоматическое резервное копирование и облачная синхронизация игровых сохранений в стиле **Material 3 Expressive**.

![Windows 11 Ready](https://img.shields.io/badge/Windows%2011-Compatible-0078D4?logo=windows)
![Rust 2021](https://img.shields.io/badge/Backend-Rust%20%2F%20Tauri%202.0-DEA584?logo=rust)
![React 18](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript%20%2B%20Vite-61DAFB?logo=react)
![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg)

---

## ✨ Основные возможности

* 🔄 **Универсальные облачные хранилища**:
  - **ASUS Router SMB** — прямое подключение к USB-накопителю на роутере ASUS (TUF/ROG/RT) с автоопределением сетевых папок.
  - **Google Drive** — прямая OAuth-авторизация без сложных настроек.
  - **MEGA Cloud & WebDAV** — шифрованные и независимые облака.
  - **Локальные / Внешние диски** и домашние **NAS (SMB)**.
* 🎯 **Интеллектуальный детектор игр и сохранений**:
  - Автоматическое сканирование библиотек **Steam**, **Epic Games**, **Ubisoft Connect**, **Rockstar Games Launcher**, **GOG** и **EA App**.
  - Глубокое сканирование дисков ПК на наличие DRM-Free, Repack и автономных инди-игр с фильтрацией игровых движков (Unity, Unreal, Source, DLSS, PhysX).
  - Точное определение путей к профилям сохранений (`%APPDATA%`, `%LOCALAPPDATA%`, `Saved Games`, `Documents`, реестр).
* ⏱️ **Фоновый мониторинг (Watcher)**:
  - Автоматическое создание снимка сохранения сразу после закрытия игры.
  - Предупреждение о конфликтах перед запуском, если облачная версия сохранения новее локальной.
* 📦 **Полная автономность (Portable Mode)**:
  - Режим Portable при наличии файла `portable.mode` — все данные хранятся в каталоге программы `data/`, не оставляя следов в реестре и `AppData`.
* 🎨 **M3 Expressive интерфейс**:
  - Нативная интеграция с тёмной/светлой темой и акцентными цветами Windows 11.
  - Мультиязычность: русский, украинский, польский, английский языки.

---

## 🚀 Установка и запуск

### Вариант 1: Portable-версия (без установки)
1. Скачайте архив `Savio-Portable-v0.1.0-x64.zip` из [Releases](https://github.com/sasaiber/Savio---Cloud-Backup-for-Game-Saves/releases).
2. Распакуйте в любую удобную папку (например, `D:\Savio`).
3. Запустите `Savio.exe`.

### Вариант 2: Сборка из исходников

**Требования**:
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (1.80+ с MSVC toolchain)

```bash
# 1. Клонирование репозитория
git clone https://github.com/sasaiber/Savio---Cloud-Backup-for-Game-Saves.git
cd Savio---Cloud-Backup-for-Game-Saves

# 2. Установка зависимостей фронтенда
npm install

# 3. Запуск в режиме разработки
npm run tauri dev

# 4. Сборка релизного бинарника
npx tauri build --no-bundle
```

---

## 🛠️ Архитектура

```
├── src/                 # React 18 + TypeScript + Vite UI
│   ├── components/      # Компоненты Material 3 (Card, Button, Modals)
│   ├── pages/           # Страницы: Библиотека, Облака, Настройки, Онбординг
│   ├── locales/         # Локализации (ru, en, uk, pl)
│   └── state/           # Управление состоянием настроек и синхронизации
├── src-tauri/           # Rust бэкенд на базе Tauri v2
│   ├── src/scanner/     # Сканеры лаунчеров (Steam, Epic, Ubisoft, Rockstar, PC)
│   ├── src/saves/       # Интеллектуальный определитель путей к сохранениям
│   ├── src/snapshots.rs # Движок резервного копирования и rclone
│   ├── src/watcher.rs   # Фоновый трекер игровых процессов
│   └── src/system.rs    # Системные Win32 API и сетевые шары (SMB)
```

---

## 📜 Лицензия

Распространяется под лицензией **GPL-3.0-or-later**.
