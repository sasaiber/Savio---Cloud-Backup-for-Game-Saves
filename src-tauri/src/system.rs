//! Small Windows helpers: system language, accent color and title bar colors.

use std::ffi::c_void;

use serde::{Deserialize, Serialize};

use windows_sys::Win32::{
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
        DWMWA_USE_IMMERSIVE_DARK_MODE,
    },
    System::Registry::{
        RegCloseKey, RegDeleteValueW, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW, RegSetValueExW,
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, REG_SZ, RRF_RT_REG_DWORD,
        RRF_RT_REG_SZ,
    },
};

/// Windows display language, e.g. "ru-RU", "uk-UA", "pl-PL", "en-US".
pub fn system_locale() -> String {
    sys_locale::get_locale().unwrap_or_else(|| "en-US".to_string())
}

/// Checks if Windows 11 system app theme is Dark Mode.
pub fn is_system_dark() -> bool {
    read_dword(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme")
        .map(|v| v == 0)
        .unwrap_or(true)
}

/// Current Windows accent color as "#RRGGBB".
/// When "Automatic accent color" is on in Windows, this color is picked from the wallpaper.
pub fn accent_color() -> Option<String> {
    let value = read_dword(r"Software\Microsoft\Windows\DWM", "AccentColor")?;
    // The registry stores the color as 0xAABBGGRR.
    let r = value & 0xFF;
    let g = (value >> 8) & 0xFF;
    let b = (value >> 16) & 0xFF;
    Some(format!("#{r:02X}{g:02X}{b:02X}"))
}

/// Paints the native Windows 11 title bar so it blends with the app theme.
/// `caption` and `text` are "#RRGGBB" strings.
pub fn set_titlebar_colors(hwnd: *mut c_void, caption: &str, text: &str, dark: bool) -> Result<(), String> {
    if hwnd.is_null() {
        return Ok(());
    }
    let caption = match colorref_from_hex(caption) {
        Ok(c) => c,
        Err(_) => return Ok(()),
    };
    let text = match colorref_from_hex(text) {
        Ok(t) => t,
        Err(_) => return Ok(()),
    };
    let dark_flag: i32 = if dark { 1 } else { 0 };

    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd as _,
            DWMWA_USE_IMMERSIVE_DARK_MODE as _,
            &dark_flag as *const i32 as *const c_void,
            std::mem::size_of::<i32>() as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd as _,
            DWMWA_CAPTION_COLOR as _,
            &caption as *const u32 as *const c_void,
            std::mem::size_of::<u32>() as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd as _,
            DWMWA_BORDER_COLOR as _,
            &caption as *const u32 as *const c_void,
            std::mem::size_of::<u32>() as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd as _,
            DWMWA_TEXT_COLOR as _,
            &text as *const u32 as *const c_void,
            std::mem::size_of::<u32>() as u32,
        );
    }
    Ok(())
}

/// "#RRGGBB" -> Windows COLORREF (0x00BBGGRR).
fn colorref_from_hex(hex: &str) -> Result<u32, String> {
    let clean = hex.trim().trim_start_matches('#');
    if clean.len() != 6 {
        return Err(format!("Invalid color: {hex}"));
    }
    let rgb = u32::from_str_radix(clean, 16).map_err(|_| format!("Invalid color: {hex}"))?;
    let r = (rgb >> 16) & 0xFF;
    let g = (rgb >> 8) & 0xFF;
    let b = rgb & 0xFF;
    Ok(r | (g << 8) | (b << 16))
}

fn read_dword(subkey: &str, value: &str) -> Option<u32> {
    let subkey = wide(subkey);
    let value = wide(value);
    let mut data: u32 = 0;
    let mut size: u32 = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            &mut data as *mut u32 as *mut c_void,
            &mut size,
        )
    };
    if status == 0 {
        Some(data)
    } else {
        None
    }
}

pub fn read_reg_string(hkey: isize, subkey: &str, value: &str) -> Option<String> {
    let subkey = wide(subkey);
    let value = wide(value);
    let mut buf = [0u16; 1024];
    let mut size: u32 = (buf.len() * std::mem::size_of::<u16>()) as u32;
    let root = if hkey == 1 {
        HKEY_LOCAL_MACHINE
    } else {
        HKEY_CURRENT_USER
    };

    let status = unsafe {
        RegGetValueW(
            root,
            subkey.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buf.as_mut_ptr() as *mut c_void,
            &mut size,
        )
    };
    if status == 0 && size >= 2 {
        let len = (size as usize / 2).saturating_sub(1);
        Some(String::from_utf16_lossy(&buf[..len]))
    } else {
        None
    }
}

pub fn read_reg_subkeys(hkey: isize, subkey: &str) -> Vec<String> {
    let subkey_w = wide(subkey);
    let root = if hkey == 1 {
        HKEY_LOCAL_MACHINE
    } else {
        HKEY_CURRENT_USER
    };
    let mut hkey_out = std::ptr::null_mut();
    let mut results = Vec::new();

    unsafe {
        if RegOpenKeyExW(root, subkey_w.as_ptr(), 0, KEY_READ, &mut hkey_out) == 0 {
            let mut index = 0u32;
            let mut name_buf = [0u16; 256];
            loop {
                let mut name_len = name_buf.len() as u32;
                let status = RegEnumKeyExW(
                    hkey_out,
                    index,
                    name_buf.as_mut_ptr(),
                    &mut name_len,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                );
                if status != 0 {
                    break;
                }
                let name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                if !name.is_empty() {
                    results.push(name);
                }
                index += 1;
            }
            RegCloseKey(hkey_out);
        }
    }
    results
}

#[cfg(windows)]
extern "system" {
    fn MultiByteToWideChar(
        CodePage: u32,
        dwFlags: u32,
        lpMultiByteStr: *const u8,
        cbMultiByte: i32,
        lpWideCharStr: *mut u16,
        cchWideChar: i32,
    ) -> i32;
}

/// Decodes bytes from command-line outputs. Checks UTF-8 first, falls back to Windows OEM CP (e.g. CP866).
#[cfg(windows)]
pub fn decode_oem_or_utf8(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }
    let mut wide_buf = vec![0u16; bytes.len() * 2 + 8];
    let len = unsafe {
        MultiByteToWideChar(
            1, // CP_OEMCP
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            wide_buf.as_mut_ptr(),
            wide_buf.len() as i32,
        )
    };
    if len > 0 {
        String::from_utf16_lossy(&wide_buf[..len as usize])
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

#[cfg(not(windows))]
pub fn decode_oem_or_utf8(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// Discovers shared folders on an SMB host / router via `net view`.
pub fn discover_smb_shares(ip: &str, username: Option<&str>, password: Option<&str>) -> Result<Vec<String>, String> {
    let clean_ip = ip.trim().trim_start_matches(r"\\").trim_end_matches('\\');
    if clean_ip.is_empty() {
        return Err("IP-адрес роутера не указан".to_string());
    }

    // Authenticate IPC$ first if credentials are provided
    if let (Some(u), Some(p)) = (username, password) {
        let u = u.trim();
        let p = p.trim();
        if !u.is_empty() {
            let ipc_unc = format!(r"\\{}\IPC$", clean_ip);
            let mut cmd = std::process::Command::new("net");
            cmd.arg("use")
                .arg(&ipc_unc)
                .arg(p)
                .arg(format!("/user:{}", u))
                .arg("/persistent:no");
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            let _ = cmd.output();
        }
    }

    let mut cmd = std::process::Command::new("net");
    cmd.arg("view").arg(format!(r"\\{}", clean_ip));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().map_err(|e| format!("Не удалось выполнить команду net view: {}", e))?;
    let stdout = decode_oem_or_utf8(&output.stdout);
    let stderr = decode_oem_or_utf8(&output.stderr);

    if !output.status.success() {
        let err = if !stderr.trim().is_empty() { stderr.trim() } else { stdout.trim() };
        return Err(format!("Не удалось получить список папок с \\\\{}: {}", clean_ip, err));
    }

    let mut shares = Vec::new();
    let mut header_passed = false;
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("---") {
            header_passed = true;
            continue;
        }
        if header_passed {
            let lower = trimmed.to_lowercase();
            if lower.contains("command completed") || lower.contains("команда выполнена") {
                break;
            }
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if !parts.is_empty() {
                let name = parts[0];
                if !name.ends_with('$') && !name.eq_ignore_ascii_case("print$") {
                    shares.push(name.to_string());
                }
            }
        }
    }

    if shares.is_empty() {
        return Err(format!("На роутере \\\\{} не найдено открытых общих папок.", clean_ip));
    }

    Ok(shares)
}

/// Connects or verifies a Windows network share (ASUS Router, NAS, SMB share).
/// If username and password are provided, runs Windows `net use` in the background to authenticate the session.
pub fn connect_network_share(unc_path: &str, username: Option<&str>, password: Option<&str>) -> Result<(), String> {
    let unc = unc_path.trim().trim_end_matches('\\');
    if !unc.starts_with(r"\\") {
        return Ok(());
    }

    if let (Some(user), Some(pass)) = (username, password) {
        let u = user.trim();
        let p = pass.trim();
        if !u.is_empty() {
            let mut cmd = std::process::Command::new("net");
            cmd.arg("use")
                .arg(unc)
                .arg(p)
                .arg(format!("/user:{}", u))
                .arg("/persistent:no");

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            let output = cmd.output().map_err(|e| format!("Не удалось запустить команду net use: {}", e))?;
            if !output.status.success() {
                let err_msg = decode_oem_or_utf8(&output.stderr);
                let out_msg = decode_oem_or_utf8(&output.stdout);
                // System error 1219 indicates existing session, which is often acceptable
                if !err_msg.contains("1219") && !out_msg.contains("1219") {
                    let combined = format!("{}{}", err_msg.trim(), out_msg.trim());
                    if !combined.is_empty() {
                        let mut msg = format!("Ошибка подключения к сетевой папке ({}): {}", unc, combined);
                        if combined.contains("67") {
                            let host = unc.trim_start_matches(r"\\").split('\\').next().unwrap_or("");
                            if !host.is_empty() {
                                if let Ok(discovered) = discover_smb_shares(host, Some(u), Some(p)) {
                                    msg.push_str(&format!(
                                        "\n💡 На роутере найдены папки: {}. Укажите точное имя общей папки!",
                                        discovered.join(", ")
                                    ));
                                }
                            }
                        }
                        return Err(msg);
                    }
                }
            }
        }
    }

    let p = std::path::Path::new(unc);
    if !p.is_dir() {
        let host = unc.trim_start_matches(r"\\").split('\\').next().unwrap_or("");
        let mut msg = format!("Сетевая папка недоступна: {}. Проверьте сетевое подключение, IP-адрес роутера и имя общего ресурса.", unc);
        if !host.is_empty() {
            if let Ok(discovered) = discover_smb_shares(host, username, password) {
                msg.push_str(&format!(
                    "\n💡 На роутере \\\\{} найдены доступные папки: {}. Убедитесь, что указано точное имя ресурса!",
                    host, discovered.join(", ")
                ));
            }
        }
        return Err(msg);
    }

    Ok(())
}

#[repr(C)]
#[allow(non_snake_case)]
struct BROWSEINFOW {
    hwndOwner: *mut c_void,
    pidlRoot: *const c_void,
    pszDisplayName: *mut u16,
    lpszTitle: *const u16,
    ulFlags: u32,
    lpfn: *const c_void,
    lParam: isize,
    iImage: i32,
}

#[repr(C)]
#[allow(non_snake_case)]
struct OPENFILENAMEW {
    lStructSize: u32,
    hwndOwner: *mut c_void,
    hInstance: *mut c_void,
    lpstrFilter: *const u16,
    lpstrCustomFilter: *mut u16,
    nMaxCustFilter: u32,
    nFilterIndex: u32,
    lpstrFile: *mut u16,
    nMaxFile: u32,
    lpstrFileTitle: *mut u16,
    nMaxFileTitle: u32,
    lpstrInitialDir: *const u16,
    lpstrTitle: *const u16,
    Flags: u32,
    nFileOffset: u16,
    nFileExtension: u16,
    lpstrDefExt: *const u16,
    lCustData: isize,
    lpfnHook: *const c_void,
    lpTemplateName: *const u16,
    pvReserved: *mut c_void,
    dwReserved: u32,
    FlagsEx: u32,
}

#[link(name = "shell32")]
extern "system" {
    fn ShellExecuteW(
        hwnd: *mut c_void,
        lpOperation: *const u16,
        lpFile: *const u16,
        lpParameters: *const u16,
        lpDirectory: *const u16,
        nShowCmd: i32,
    ) -> isize;
    fn SHBrowseForFolderW(lpbi: *const BROWSEINFOW) -> *mut c_void;
    fn SHGetPathFromIDListW(pidl: *const c_void, pszPath: *mut u16) -> i32;
}

#[link(name = "ole32")]
extern "system" {
    fn CoTaskMemFree(pv: *mut c_void);
    fn CoInitializeEx(pvReserved: *mut c_void, dwCoInit: u32) -> i32;
    fn CoUninitialize();
}

#[link(name = "comdlg32")]
extern "system" {
    fn GetOpenFileNameW(lpofn: *mut OPENFILENAMEW) -> i32;
}

pub fn native_pick_folder(owner_hwnd: *mut c_void) -> Option<String> {
    unsafe {
        let _ = CoInitializeEx(std::ptr::null_mut(), 0x2); // COINIT_APARTMENTTHREADED (STA)

        let title_w = wide("Выберите папку с сохранениями");
        let mut display_name = [0u16; 260];
        let bi = BROWSEINFOW {
            hwndOwner: owner_hwnd,
            pidlRoot: std::ptr::null(),
            pszDisplayName: display_name.as_mut_ptr(),
            lpszTitle: title_w.as_ptr(),
            ulFlags: 0x00000001 | 0x00000040, // BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE
            lpfn: std::ptr::null(),
            lParam: 0,
            iImage: 0,
        };

        let pidl = SHBrowseForFolderW(&bi);
        if pidl.is_null() {
            CoUninitialize();
            return None;
        }

        let mut path_buf = [0u16; 1024];
        let success = SHGetPathFromIDListW(pidl, path_buf.as_mut_ptr());
        CoTaskMemFree(pidl);
        CoUninitialize();

        if success != 0 {
            let len = path_buf.iter().position(|&c| c == 0).unwrap_or(path_buf.len());
            let path_str = String::from_utf16_lossy(&path_buf[..len]);
            if !path_str.trim().is_empty() {
                return Some(path_str.trim().to_string());
            }
        }
        None
    }
}

pub fn native_pick_file(owner_hwnd: *mut c_void, filter: Option<&str>) -> Option<String> {
    unsafe {
        let mut file_buf = [0u16; 1024];
        let title_w = wide("Выберите файл");

        let filter_w = if let Some(f) = filter {
            let pattern = f.split('|').nth(1).unwrap_or("*.*");
            let mut v = Vec::new();
            v.extend(f.encode_utf16());
            v.push(0);
            v.extend(pattern.encode_utf16());
            v.push(0);
            v.extend("Все файлы (*.*)".encode_utf16());
            v.push(0);
            v.extend("*.*".encode_utf16());
            v.push(0);
            v.push(0);
            v
        } else {
            let mut v = Vec::new();
            v.extend("Исполняемые файлы (*.exe)".encode_utf16());
            v.push(0);
            v.extend("*.exe".encode_utf16());
            v.push(0);
            v.extend("Все файлы (*.*)".encode_utf16());
            v.push(0);
            v.extend("*.*".encode_utf16());
            v.push(0);
            v.push(0);
            v
        };

        let mut ofn: OPENFILENAMEW = std::mem::zeroed();
        ofn.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
        ofn.hwndOwner = owner_hwnd;
        ofn.lpstrFilter = filter_w.as_ptr();
        ofn.lpstrFile = file_buf.as_mut_ptr();
        ofn.nMaxFile = file_buf.len() as u32;
        ofn.lpstrTitle = title_w.as_ptr();
        ofn.Flags = 0x00001000 | 0x00000800 | 0x00000008; // OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR

        let result = GetOpenFileNameW(&mut ofn);
        if result != 0 {
            let len = file_buf.iter().position(|&c| c == 0).unwrap_or(file_buf.len());
            let file_str = String::from_utf16_lossy(&file_buf[..len]);
            if !file_str.trim().is_empty() {
                return Some(file_str.trim().to_string());
            }
        }
        None
    }
}

pub fn open_in_explorer(path: &str) -> Result<(), String> {
    let clean = path.trim();
    if clean.is_empty() {
        return Err("Путь не может быть пустым".to_string());
    }

    let is_url = clean.starts_with("http://") || clean.starts_with("https://");
    if !is_url {
        let p = std::path::Path::new(clean);
        if !p.exists() {
            return Err(format!("Папка не существует на диске: {}", clean));
        }
    }

    let path_w = wide(clean);
    let op_w = wide("open");
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            op_w.as_ptr(),
            path_w.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1, // SW_SHOWNORMAL
        )
    };
    if result > 32 {
        Ok(())
    } else {
        Err(format!("ShellExecute error code: {result}"))
    }
}

pub fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AutostartStatus {
    pub enabled: bool,
    pub minimized: bool,
}

pub fn get_autostart_status() -> AutostartStatus {
    let subkey = r"Software\Microsoft\Windows\CurrentVersion\Run";
    if let Some(val) = read_reg_string(0, subkey, "Savio") {
        let minimized = val.contains("--minimized") || val.contains("--tray");
        AutostartStatus {
            enabled: true,
            minimized,
        }
    } else {
        AutostartStatus {
            enabled: false,
            minimized: true,
        }
    }
}

pub fn set_autostart(enabled: bool, minimized: bool) -> Result<(), String> {
    let subkey = wide(r"Software\Microsoft\Windows\CurrentVersion\Run");
    let val_name = wide("Savio");
    unsafe {
        let mut hkey = std::ptr::null_mut();
        let open_status = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            KEY_SET_VALUE,
            &mut hkey,
        );
        if open_status != 0 {
            return Err(format!("Не удалось открыть ветку реестра Windows: код {open_status}"));
        }
        let res = if enabled {
            let exe = std::env::current_exe().map_err(|e| format!("Не удалось определить путь к Savio: {}", e))?;
            let cmd = if minimized {
                format!("\"{}\" --minimized", exe.display())
            } else {
                format!("\"{}\"", exe.display())
            };
            let cmd_w = wide(&cmd);
            let bytes_len = (cmd_w.len() * std::mem::size_of::<u16>()) as u32;
            let status = RegSetValueExW(
                hkey,
                val_name.as_ptr(),
                0,
                REG_SZ,
                cmd_w.as_ptr() as *const u8,
                bytes_len,
            );
            if status == 0 {
                Ok(())
            } else {
                Err(format!("Не удалось записать автозагрузку в реестр: код {status}"))
            }
        } else {
            let _ = RegDeleteValueW(hkey, val_name.as_ptr());
            Ok(())
        };
        RegCloseKey(hkey);
        res
    }
}

pub fn launch_game_target(target: &str) -> Result<(), String> {
    let clean = target.trim();
    if clean.is_empty() {
        return Err("Путь запуска не указан".to_string());
    }

    let is_protocol = clean.starts_with("steam://")
        || clean.starts_with("com.epicgames.launcher://")
        || clean.starts_with("http://")
        || clean.starts_with("https://");

    if !is_protocol {
        let p = std::path::Path::new(clean);
        if !p.exists() {
            return Err(format!("Исполняемый файл не найден: {}", clean));
        }
    }

    let target_w = wide(clean);
    let op_w = wide("open");

    let working_dir_w = if !is_protocol {
        if let Some(parent) = std::path::Path::new(clean).parent() {
            if parent.is_dir() {
                Some(wide(&parent.to_string_lossy()))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let dir_ptr = working_dir_w
        .as_ref()
        .map(|w| w.as_ptr())
        .unwrap_or(std::ptr::null());

    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            op_w.as_ptr(),
            target_w.as_ptr(),
            std::ptr::null(),
            dir_ptr,
            1, // SW_SHOWNORMAL
        )
    };

    if result > 32 {
        Ok(())
    } else {
        Err(format!("ShellExecute error code: {result}"))
    }
}

/// Returns all mounted drive root paths on Windows, e.g. ["C:\\", "D:\\", "E:\\"].
pub fn get_logical_drives() -> Vec<String> {
    let mut drives = Vec::new();
    for c in b'C'..=b'Z' {
        let drive_str = format!("{}:\\", c as char);
        if std::path::Path::new(&drive_str).is_dir() {
            drives.push(drive_str);
        }
    }
    if drives.is_empty() {
        drives.push("C:\\".to_string());
    }
    drives
}

