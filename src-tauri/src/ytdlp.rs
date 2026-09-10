use crate::ffmpeg::resolve_ffmpeg;
use crate::types::{FinishedPayload, LogPayload, ProgressPayload, YtdlpInstallProgress, YtdlpStatus};
use crate::utils::{create_command, executable_name, get_exe_dir_sibling, normalize_cookies_browser, platform_name};
use regex::Regex;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Window};

pub static YTDLP_INSTALLING: AtomicBool = AtomicBool::new(false);

pub fn managed_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("ytdlp").join(executable_name("yt-dlp")))
        .map_err(|error| format!("Could not resolve app data directory: {error}"))
}

pub struct YtdlpResolveResult {
    pub path: PathBuf,
    pub source: &'static str,
    pub version: String,
}

pub fn query_ytdlp_version(path: &Path) -> Option<String> {
    let output = create_command(path).arg("--version").output().ok()?;
    if output.status.success() {
        let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !version_str.is_empty() {
            return Some(version_str);
        }
    }
    None
}

pub fn resolve_ytdlp(app: &AppHandle, custom_ytdlp_path: &Option<String>) -> Option<YtdlpResolveResult> {
    if let Some(path_str) = custom_ytdlp_path
        .as_ref()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
    {
        let path = PathBuf::from(path_str);
        if path.is_file() {
            if let Some(version) = query_ytdlp_version(&path) {
                return Some(YtdlpResolveResult {
                    path,
                    source: "custom",
                    version,
                });
            }
        }
    }

    if let Some(ytdlp_path) = get_exe_dir_sibling("yt-dlp") {
        if let Some(version) = query_ytdlp_version(&ytdlp_path) {
            return Some(YtdlpResolveResult {
                path: ytdlp_path,
                source: "portable",
                version,
            });
        }
    }

    if let Ok(managed_path) = managed_ytdlp_path(app) {
        if managed_path.is_file() {
            if let Some(version) = query_ytdlp_version(&managed_path) {
                return Some(YtdlpResolveResult {
                    path: managed_path,
                    source: "managed",
                    version,
                });
            }
        }
    }

    let system_name = executable_name("yt-dlp");
    let system_path = PathBuf::from(&system_name);
    if let Some(version) = query_ytdlp_version(&system_path) {
        return Some(YtdlpResolveResult {
            path: system_path,
            source: "system",
            version,
        });
    }

    None
}

#[tauri::command]
pub fn get_ytdlp_status(app: AppHandle, custom_ytdlp_path: Option<String>) -> YtdlpStatus {
    let managed_executable = managed_ytdlp_path(&app)
        .unwrap_or_else(|_| PathBuf::from("ytdlp").join(executable_name("yt-dlp")));

    if let Some(res) = resolve_ytdlp(&app, &custom_ytdlp_path) {
        return YtdlpStatus {
            available: true,
            version: res.version,
            source: res.source.to_string(),
            path: res.path.to_string_lossy().to_string(),
            platform: platform_name().to_string(),
            install_supported: false,
            managed_path: managed_executable.to_string_lossy().to_string(),
        };
    }

    YtdlpStatus {
        available: false,
        version: "Not Found".to_string(),
        source: "missing".to_string(),
        path: String::new(),
        platform: platform_name().to_string(),
        install_supported: cfg!(target_os = "windows") || cfg!(target_os = "linux") || cfg!(target_os = "macos"),
        managed_path: managed_executable.to_string_lossy().to_string(),
    }
}

pub fn emit_ytdlp_install_progress(
    app: &AppHandle,
    stage: &str,
    downloaded_bytes: u64,
    total_bytes: u64,
    message: &str,
) {
    let percent = if total_bytes > 0 {
        ((downloaded_bytes.saturating_mul(100) / total_bytes).min(100)) as u8
    } else {
        0
    };
    let _ = app.emit(
        "ytdlp-install-progress",
        YtdlpInstallProgress {
            stage: stage.to_string(),
            downloaded_bytes,
            total_bytes,
            percent,
            message: message.to_string(),
        },
    );
}

pub struct YtdlpInstallFlagGuard;
impl Drop for YtdlpInstallFlagGuard {
    fn drop(&mut self) {
        YTDLP_INSTALLING.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub async fn install_managed_ytdlp(app: AppHandle) -> Result<YtdlpStatus, String> {
    if YTDLP_INSTALLING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("A yt-dlp installation is already in progress.".to_string());
    }
    let _install_guard = YtdlpInstallFlagGuard;

    let final_path = managed_ytdlp_path(&app)?;
    if let Some(res) = resolve_ytdlp(&app, &None) {
        if res.source == "managed" {
            return Ok(get_ytdlp_status(app, None));
        }
    }

    let parent = final_path
        .parent()
        .ok_or_else(|| "Invalid managed yt-dlp destination.".to_string())?
        .to_path_buf();
    fs::create_dir_all(&parent)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    let staging_path = parent.join(format!("yt-dlp-install-{}.tmp", std::process::id()));
    if staging_path.exists() {
        let _ = fs::remove_file(&staging_path);
    }

    let download_url = if cfg!(target_os = "windows") {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    } else {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    };

    let result = async {
        let client = reqwest::Client::builder()
            .user_agent("Sadness-Splitter-3000/2.0")
            .build()
            .map_err(|error| format!("Could not initialize downloader: {error}"))?;

        emit_ytdlp_install_progress(
            &app,
            "downloading",
            0,
            0,
            "Connecting to yt-dlp download server...",
        );

        let mut response = client
            .get(download_url)
            .send()
            .await
            .map_err(|error| format!("yt-dlp download failed: {error}"))?
            .error_for_status()
            .map_err(|error| format!("yt-dlp server returned an error: {error}"))?;

        let total_bytes = response.content_length().unwrap_or(0);
        let mut file = fs::File::create(&staging_path)
            .map_err(|error| format!("Could not create staging file: {error}"))?;
        let mut downloaded_bytes = 0_u64;

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("yt-dlp download was interrupted: {error}"))?
        {
            file.write_all(&chunk)
                .map_err(|error| format!("Could not write downloaded chunk to disk: {error}"))?;
            downloaded_bytes += chunk.len() as u64;

            emit_ytdlp_install_progress(
                &app,
                "downloading",
                downloaded_bytes,
                total_bytes,
                &format!("Downloading yt-dlp binary ({}%)...", if total_bytes > 0 { downloaded_bytes * 100 / total_bytes } else { 0 }),
            );
        }

        emit_ytdlp_install_progress(
            &app,
            "installing",
            downloaded_bytes,
            total_bytes,
            "Configuring permissions...",
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&staging_path)
                .map_err(|e| format!("Could not read staging permissions: {e}"))?
                .permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&staging_path, perms)
                .map_err(|e| format!("Could not set executable permissions: {e}"))?;
        }

        if final_path.exists() {
            let _ = fs::remove_file(&final_path);
        }

        fs::rename(&staging_path, &final_path)
            .map_err(|error| format!("Could not move yt-dlp binary: {error}"))?;

        Ok(())
    }.await;

    if staging_path.exists() {
        let _ = fs::remove_file(&staging_path);
    }

    result.map(|_| get_ytdlp_status(app, None))
}

#[tauri::command]
pub fn download_youtube(
    window: Window,
    url: String,
    format: String,
    output_dir: String,
    custom_ytdlp_path: Option<String>,
    custom_ffmpeg_path: Option<String>,
    cookies_browser: String,
) {
    let app = window.app_handle().clone();
    std::thread::spawn(move || {
        let ytdlp_res = match resolve_ytdlp(&app, &custom_ytdlp_path) {
            Some(res) => res,
            None => {
                let _ = window.emit("finished", FinishedPayload { success: false, output_path: None });
                let _ = window.emit("backend-log", LogPayload {
                    message: "Error: yt-dlp binary not found. Please install it or set a custom path in settings.".to_string(),
                    log_type: "error".to_string(),
                });
                return;
            }
        };

        let ffmpeg_loc = resolve_ffmpeg(&app, &custom_ffmpeg_path)
            .map(|pair| pair.ffmpeg.to_string_lossy().to_string());

        let mut filename_args = Vec::new();
        if let Some(browser) = normalize_cookies_browser(&cookies_browser) {
            filename_args.extend(vec![
                "--cookies-from-browser".to_string(),
                browser,
            ]);
        }

        if format == "mp3" {
            filename_args.extend(vec![
                "-f".to_string(),
                "bestaudio/best".to_string(),
                "-x".to_string(),
                "--audio-format".to_string(),
                "mp3".to_string(),
            ]);
        } else {
            filename_args.extend(vec![
                "-f".to_string(),
                "bestvideo+bestaudio/best".to_string(),
                "--merge-output-format".to_string(),
                "mp4".to_string(),
            ]);
        }

        if let Some(ref loc) = ffmpeg_loc {
            filename_args.extend(vec![
                "--ffmpeg-location".to_string(),
                loc.clone(),
            ]);
        }

        let output_template = format!("{}/%(title)s.%(ext)s", output_dir);
        filename_args.extend(vec![
            "--get-filename".to_string(),
            "-o".to_string(),
            output_template.clone(),
            url.clone(),
        ]);

        let mut filename_cmd = create_command(&ytdlp_res.path);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            filename_cmd.creation_flags(0x08000000);
        }

        let query_output = filename_cmd.args(&filename_args).output();
        let final_output_path = match query_output {
            Ok(out) if out.status.success() => {
                let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !p.is_empty() {
                    Some(p)
                } else {
                    None
                }
            }
            _ => None,
        };

        let _ = window.emit("backend-log", LogPayload {
            message: format!("Resolved download path: {:?}", final_output_path),
            log_type: "info".to_string(),
        });

        let mut download_args = Vec::new();
        if let Some(browser) = normalize_cookies_browser(&cookies_browser) {
            download_args.extend(vec![
                "--cookies-from-browser".to_string(),
                browser,
            ]);
        }

        if format == "mp3" {
            download_args.extend(vec![
                "-f".to_string(),
                "bestaudio/best".to_string(),
                "-x".to_string(),
                "--audio-format".to_string(),
                "mp3".to_string(),
                "--embed-thumbnail".to_string(),
                "--embed-metadata".to_string(),
            ]);
        } else {
            download_args.extend(vec![
                "-f".to_string(),
                "bestvideo+bestaudio/best".to_string(),
                "--merge-output-format".to_string(),
                "mp4".to_string(),
                "--embed-thumbnail".to_string(),
                "--embed-metadata".to_string(),
            ]);
        }

        if let Some(ref loc) = ffmpeg_loc {
            download_args.extend(vec![
                "--ffmpeg-location".to_string(),
                loc.clone(),
            ]);
        }

        download_args.extend(vec![
            "-o".to_string(),
            output_template,
            url.clone(),
        ]);

        let mut download_cmd = create_command(&ytdlp_res.path);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            download_cmd.creation_flags(0x08000000);
        }

        let mut child = match download_cmd
            .args(&download_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = window.emit("finished", FinishedPayload { success: false, output_path: None });
                let _ = window.emit("backend-log", LogPayload {
                    message: format!("Error spawning yt-dlp: {}", e),
                    log_type: "error".to_string(),
                });
                return;
            }
        };

        let _ = window.emit("backend-log", LogPayload {
            message: format!("yt-dlp args: {:?}", download_args),
            log_type: "info".to_string(),
        });

        let stdout = child.stdout.take().expect("Failed to open stdout");
        let reader = BufReader::new(stdout);
        let progress_re = Regex::new(r"\[download\]\s+(\d+(?:\.\d+)?)%").unwrap();

        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window.emit("backend-log", LogPayload {
                    message: l.clone(),
                    log_type: "info".to_string(),
                });

                if let Some(caps) = progress_re.captures(&l) {
                    if let Ok(pct) = caps[1].parse::<f64>() {
                        let percentage = pct as i32;
                        let _ = window.emit("progress", ProgressPayload { percentage });
                    }
                }
            }
        }

        let stderr = child.stderr.take().expect("Failed to open stderr");
        let err_reader = BufReader::new(stderr);
        for line in err_reader.lines() {
            if let Ok(l) = line {
                let _ = window.emit("backend-log", LogPayload {
                    message: l,
                    log_type: "error".to_string(),
                });
            }
        }

        let status = child.wait().expect("Failed to wait on child");
        let _ = window.emit(
            "finished",
            FinishedPayload {
                success: status.success(),
                output_path: if status.success() { final_output_path } else { None },
            },
        );
    });
}
