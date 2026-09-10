pub fn create_command<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

pub fn normalize_cookies_browser(browser: &str) -> Option<String> {
    let browser = browser.trim();
    if browser.is_empty() || browser == "none" {
        return None;
    }

    if browser.contains(':') {
        return Some(browser.to_string());
    }

    match browser {
        "chrome" | "edge" | "brave" | "firefox" => Some(format!("{browser}:Default")),
        _ => Some(browser.to_string()),
    }
}

pub fn executable_name(tool: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{tool}.exe")
    } else {
        tool.to_string()
    }
}

pub fn find_executable_in_path(name: &str) -> Option<std::path::PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let paths = std::env::split_paths(&path_var);
    for path in paths {
        let exe_path = path.join(executable_name(name));
        if exe_path.is_file() {
            return Some(exe_path);
        }
    }
    None
}

pub fn get_exe_dir_sibling(name: &str) -> Option<std::path::PathBuf> {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let tool_path = parent.join(executable_name(name));
            if tool_path.is_file() {
                return Some(tool_path);
            }
        }
    }
    None
}

pub fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "unknown"
    }
}
