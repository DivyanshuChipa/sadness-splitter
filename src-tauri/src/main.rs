#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU32, Ordering};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager, Window};
use warp::{Filter, Reply};

#[cfg(target_os = "windows")]
use wmi::{COMLibrary, WMIConnection};

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug)]
#[serde(rename_all = "PascalCase")]
struct GpuEngine {
    #[allow(dead_code)]
    name: String,
    utilization_percentage: u32,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    percentage: i32,
}

#[derive(Clone, Serialize)]
struct FinishedPayload {
    success: bool,
    output_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct YtdlpStatus {
    available: bool,
    version: String,
    source: String,
    path: String,
    platform: String,
    install_supported: bool,
    managed_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct YtdlpInstallProgress {
    stage: String,
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: u8,
    message: String,
}

#[derive(Clone, Serialize)]
struct LogPayload {
    message: String,
    #[serde(rename = "type")]
    log_type: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfmpegStatus {
    available: bool,
    version: String,
    source: String,
    path: String,
    platform: String,
    install_supported: bool,
    managed_path: String,
    distro: Option<String>,
    install_command: Option<String>,
    install_warning: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfmpegInstallProgress {
    stage: String,
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: u8,
    message: String,
}

#[derive(Clone)]
struct FfmpegPair {
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
    source: &'static str,
    version: String,
}

static FFMPEG_INSTALLING: AtomicBool = AtomicBool::new(false);

const FFMPEG_ZIP_URL: &str = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
const FFMPEG_SHA256_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256";

fn executable_name(tool: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{tool}.exe")
    } else {
        tool.to_string()
    }
}

fn find_executable_in_path(name: &str) -> Option<PathBuf> {
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

fn managed_ffmpeg_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("ffmpeg"))
        .map_err(|error| format!("Could not resolve app data directory: {error}"))
}

fn pair_from_ffmpeg_path(path: PathBuf, source: &'static str) -> Option<FfmpegPair> {
    let parent = path.parent()?;
    let ffprobe = parent.join(executable_name("ffprobe"));

    if !path.is_file() || !ffprobe.is_file() {
        return None;
    }

    let version = read_ffmpeg_version(&path)?;
    if !command_succeeds(&ffprobe, &["-version"]) {
        return None;
    }

    Some(FfmpegPair {
        ffmpeg: path,
        ffprobe,
        source,
        version,
    })
}

fn pair_from_commands(
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
    source: &'static str,
) -> Option<FfmpegPair> {
    let version = read_ffmpeg_version(&ffmpeg)?;
    if !command_succeeds(&ffprobe, &["-version"]) {
        return None;
    }

    Some(FfmpegPair {
        ffmpeg,
        ffprobe,
        source,
        version,
    })
}

fn command_succeeds(command: &Path, args: &[&str]) -> bool {
    Command::new(command)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn read_ffmpeg_version(command: &Path) -> Option<String> {
    let output = Command::new(command).arg("-version").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let first_line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()?
        .trim()
        .to_string();
    let re = Regex::new(r"ffmpeg version (\S+)").ok()?;
    Some(
        re.captures(&first_line)
            .and_then(|captures| captures.get(1))
            .map(|value| value.as_str().to_string())
            .unwrap_or(first_line),
    )
}

fn resolve_ffmpeg(app: &AppHandle, custom_ffmpeg_path: &Option<String>) -> Option<FfmpegPair> {
    if let Some(path) = custom_ffmpeg_path
        .as_ref()
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
    {
        if let Some(pair) = pair_from_ffmpeg_path(PathBuf::from(path), "custom") {
            return Some(pair);
        }
    }

    if let (Some(ffmpeg_path), Some(ffprobe_path)) = (
        find_executable_in_path("ffmpeg"),
        find_executable_in_path("ffprobe"),
    ) {
        if let Some(pair) = pair_from_commands(ffmpeg_path, ffprobe_path, "system") {
            return Some(pair);
        }
    }

    let managed_root = managed_ffmpeg_root(app).ok()?;
    pair_from_ffmpeg_path(
        managed_root.join("bin").join(executable_name("ffmpeg")),
        "managed",
    )
}

fn resolved_command_path(
    app: &AppHandle,
    tool: &str,
    custom_ffmpeg_path: &Option<String>,
) -> PathBuf {
    if let Some(pair) = resolve_ffmpeg(app, custom_ffmpeg_path) {
        if tool == "ffprobe" {
            pair.ffprobe
        } else {
            pair.ffmpeg
        }
    } else {
        PathBuf::from(executable_name(tool))
    }
}

#[tauri::command]
fn get_video_duration(
    app: AppHandle,
    file_path: String,
    custom_ffmpeg_path: Option<String>,
) -> f64 {
    let cmd = resolved_command_path(&app, "ffprobe", &custom_ffmpeg_path);
    let output = Command::new(cmd)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            &file_path,
        ])
        .output();

    match output {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout);
            s.trim().parse::<f64>().unwrap_or(0.0)
        }
        Err(_) => 0.0,
    }
}

#[tauri::command]
fn process_video(
    window: Window,
    args: Vec<String>,
    total_duration: f64,
    custom_ffmpeg_path: Option<String>,
) {
    let app = window.app_handle().clone();
    std::thread::spawn(move || {
        let cmd = resolved_command_path(&app, "ffmpeg", &custom_ffmpeg_path);
        let mut child = match Command::new(cmd)
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(_) => {
                let _ = window.emit("finished", FinishedPayload { success: false, output_path: None });
                return;
            }
        };

        let stderr = child.stderr.take().expect("Failed to open stderr");
        let reader = BufReader::new(stderr);

        // Regex to parse `time=HH:MM:SS.ms` or similar (supports flexible decimal places)
        let re = Regex::new(r"time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)").unwrap();

        let mut last_percentage: i32 = 0;

        for segment in reader.split(b'\r') {
            if let Ok(bytes) = segment {
                let l = String::from_utf8_lossy(&bytes);
                if let Some(caps) = re.captures(&l) {
                    let h: f64 = caps[1].parse().unwrap_or(0.0);
                    let m: f64 = caps[2].parse().unwrap_or(0.0);
                    let s: f64 = caps[3].parse().unwrap_or(0.0);

                    let current_seconds = h * 3600.0 + m * 60.0 + s;

                    if total_duration > 0.0 {
                        let mut percentage = ((current_seconds / total_duration) * 100.0) as i32;
                        if percentage > 100 {
                            percentage = 100;
                        }

                        // Keep progress monotonic to avoid UI regressions.
                        if percentage < last_percentage {
                            percentage = last_percentage;
                        }

                        if percentage > last_percentage {
                            last_percentage = percentage;
                            let _ = window.emit("progress", ProgressPayload { percentage });
                        }
                    }
                }
            }
        }

        let status = child.wait().expect("Failed to wait on child");
        let _ = window.emit(
            "finished",
            FinishedPayload {
                success: status.success(),
                output_path: None,
            },
        );
    });
}

#[tauri::command]
fn generate_thumbnail(
    app: AppHandle,
    file_path: String,
    custom_ffmpeg_path: Option<String>,
) -> String {
    let temp_dir = std::env::temp_dir();
    let thumb_path = temp_dir.join("sadness_thumb.jpg");
    let thumb_str = thumb_path.to_str().unwrap_or("");
    let cmd = resolved_command_path(&app, "ffmpeg", &custom_ffmpeg_path);

    // ffmpeg -i input -ss 00:00:01 -vframes 1 -q:v 2 output.jpg
    let _ = Command::new(cmd)
        .args([
            "-i", &file_path, "-ss", "00:00:01", "-vframes", "1", "-q:v", "2", "-y", thumb_str,
        ])
        .output();

    thumb_str.to_string()
}

#[tauri::command]
fn list_videos_in_folder(folder_path: String) -> Vec<String> {
    let mut videos = Vec::new();
    if let Ok(entries) = std::fs::read_dir(folder_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    let ext = ext.to_lowercase();
                    if ["mp4", "mkv", "avi", "mov", "webm"].contains(&ext.as_str()) {
                        if let Some(s) = path.to_str() {
                            videos.push(s.to_string());
                        }
                    }
                }
            }
        }
    }
    videos
}

#[derive(Clone, Serialize)]
struct SystemMetricsPayload {
    cpu_percent: f32,
    ram_percent: f32,
    gpu_percent: f32,
}

// We use an AtomicU32 to store f32 as bits to avoid Mutex overhead
static GPU_USAGE: AtomicU32 = AtomicU32::new(0);

#[cfg(target_os = "windows")]
fn start_gpu_monitor() {
    std::thread::spawn(move || {
        let com_con = match COMLibrary::new() {
            Ok(c) => c,
            Err(_) => {
                // Silently fail if COM is unavailable
                return;
            }
        };

        let wmi_con = match WMIConnection::new(com_con.into()) {
            Ok(w) => w,
            Err(_) => return,
        };

        loop {
            // Querying Windows Performance Counters for GPU Engine (3D)
            let query = "SELECT Name, UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine WHERE Name LIKE '%engtype_3D%'";
            if let Ok(results) = wmi_con.raw_query::<GpuEngine>(query) {
                // Sum up the utilization across all running 3D processes
                let total_utilization: u32 = results.iter().map(|e| e.utilization_percentage).sum();

                // Cap at 100% just in case
                let final_percentage = if total_utilization > 100 {
                    100.0
                } else {
                    total_utilization as f32
                };
                GPU_USAGE.store(final_percentage.to_bits(), Ordering::Relaxed);
            } else {
                GPU_USAGE.store(f32::NAN.to_bits(), Ordering::Relaxed);
            }

            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });
}

#[cfg(target_os = "linux")]
fn start_gpu_monitor() {
    std::thread::spawn(move || {
        // sysfs paths for Intel (i915) are more complex (often intel_gpu_top requires root or debugfs).
        // For AMD, gpu_busy_percent exists.
        loop {
            let paths = [
                "/sys/class/drm/card0/device/gpu_busy_percent",
                "/sys/class/drm/card1/device/gpu_busy_percent",
            ];

            let mut found = false;
            for path in paths {
                if let Ok(content) = std::fs::read_to_string(path) {
                    if let Ok(val) = content.trim().parse::<f32>() {
                        GPU_USAGE.store(val.to_bits(), Ordering::Relaxed);
                        found = true;
                        break;
                    }
                }
            }
            if !found {
                GPU_USAGE.store(f32::NAN.to_bits(), Ordering::Relaxed);
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn start_gpu_monitor() {
    // Unsupported OS
}

fn get_gpu_usage() -> f32 {
    f32::from_bits(GPU_USAGE.load(Ordering::Relaxed))
}

static MEDIA_PORT: AtomicU16 = AtomicU16::new(0);

#[tauri::command]
fn get_media_server_port() -> u16 {
    MEDIA_PORT.load(Ordering::Relaxed)
}

fn start_media_server(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to start tokio runtime");
        rt.block_on(async {
            #[cfg(unix)]
            let route_media = warp::path("media").and(warp::fs::dir("/"));

            #[cfg(windows)]
            let route_media = warp::path("media").and(warp::fs::dir("C:\\"));

            let handle_clone = handle.clone();
            let route_assets = warp::path("app-assets").and(warp::path::tail()).map(
                move |tail: warp::path::Tail| {
                    let path_str = tail.as_str();
                    match handle_clone.asset_resolver().get(path_str.to_string()) {
                        Some(asset) => {
                            let res = warp::reply::with_header(
                                warp::reply::with_status(asset.bytes, warp::http::StatusCode::OK),
                                "Content-Type",
                                asset.mime_type,
                            );
                            let res_with_ranges =
                                warp::reply::with_header(res, "Accept-Ranges", "bytes");
                            res_with_ranges.into_response()
                        }
                        None => {
                            let res_err = warp::reply::with_header(
                                warp::reply::with_status(
                                    Vec::new(),
                                    warp::http::StatusCode::NOT_FOUND,
                                ),
                                "Content-Type",
                                "application/octet-stream",
                            );
                            res_err.into_response()
                        }
                    }
                },
            );

            let route = route_media.or(route_assets);

            let cors = warp::cors()
                .allow_any_origin()
                .allow_methods(vec!["GET", "OPTIONS"])
                .allow_headers(vec!["Range", "Accept", "Content-Type"]);

            let (addr, server) = warp::serve(route.with(cors)).bind_ephemeral(([127, 0, 0, 1], 0));

            MEDIA_PORT.store(addr.port(), Ordering::Relaxed);

            server.await;
        });
    });
}

#[tauri::command]
fn get_system_metrics() -> Result<SystemMetricsPayload, String> {
    let mut sys = System::new_all();
    sys.refresh_memory();
    sys.refresh_cpu();
    std::thread::sleep(std::time::Duration::from_millis(120));
    sys.refresh_cpu();

    let total_mem = sys.total_memory();
    let used_mem = sys.used_memory();

    let ram_percent = if total_mem > 0 {
        ((used_mem as f64 / total_mem as f64) * 100.0) as f32
    } else {
        0.0
    };

    let cpu_percent = sys.global_cpu_info().cpu_usage();
    let gpu_percent = get_gpu_usage();

    Ok(SystemMetricsPayload {
        cpu_percent,
        ram_percent,
        gpu_percent,
    })
}

fn platform_name() -> &'static str {
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

#[allow(dead_code)]
fn linux_install_guidance_from(contents: &str) -> (Option<String>, Option<String>, Option<String>) {
    let mut id = String::new();
    let mut id_like = String::new();

    for line in contents.lines() {
        if let Some(value) = line.strip_prefix("ID=") {
            id = value.trim_matches('"').to_lowercase();
        } else if let Some(value) = line.strip_prefix("ID_LIKE=") {
            id_like = value.trim_matches('"').to_lowercase();
        }
    }

    let family = format!("{id} {id_like}");
    if family.contains("ubuntu") || family.contains("debian") {
        return (
            Some(id),
            Some("sudo apt update && sudo apt install ffmpeg".to_string()),
            None,
        );
    }
    if family.contains("arch") || family.contains("manjaro") {
        return (Some(id), Some("sudo pacman -S ffmpeg".to_string()), None);
    }
    if family.contains("fedora") {
        return (
            Some(id),
            Some("sudo dnf install ffmpeg-free".to_string()),
            Some(
                "Fedora's ffmpeg-free package may support fewer patented codecs than third-party builds."
                    .to_string(),
            ),
        );
    }

    (
        if id.is_empty() { None } else { Some(id) },
        None,
        Some(
            "Use your distribution package manager or the official FFmpeg download page."
                .to_string(),
        ),
    )
}

fn linux_install_guidance() -> (Option<String>, Option<String>, Option<String>) {
    #[cfg(target_os = "linux")]
    {
        let contents = fs::read_to_string("/etc/os-release").unwrap_or_default();
        linux_install_guidance_from(&contents)
    }

    #[cfg(not(target_os = "linux"))]
    {
        (None, None, None)
    }
}

fn parse_sha256_response(contents: &str) -> Result<String, String> {
    let checksum = contents
        .split_whitespace()
        .next()
        .ok_or_else(|| "FFmpeg checksum response was empty.".to_string())?
        .to_lowercase();
    if checksum.len() != 64
        || !checksum
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("FFmpeg checksum response was invalid.".to_string());
    }
    Ok(checksum)
}

#[tauri::command]
fn get_ffmpeg_status(app: AppHandle, custom_ffmpeg_path: Option<String>) -> FfmpegStatus {
    let managed_root = managed_ffmpeg_root(&app).unwrap_or_default();
    let managed_executable = managed_root.join("bin").join(executable_name("ffmpeg"));
    let (distro, install_command, install_warning) = linux_install_guidance();

    if let Some(pair) = resolve_ffmpeg(&app, &custom_ffmpeg_path) {
        return FfmpegStatus {
            available: true,
            version: pair.version,
            source: pair.source.to_string(),
            path: pair.ffmpeg.to_string_lossy().to_string(),
            platform: platform_name().to_string(),
            install_supported: false,
            managed_path: managed_executable.to_string_lossy().to_string(),
            distro,
            install_command,
            install_warning,
        };
    }

    FfmpegStatus {
        available: false,
        version: "Not Found".to_string(),
        source: "missing".to_string(),
        path: String::new(),
        platform: platform_name().to_string(),
        install_supported: cfg!(target_os = "windows"),
        managed_path: managed_executable.to_string_lossy().to_string(),
        distro,
        install_command,
        install_warning,
    }
}

#[tauri::command]
fn check_ffmpeg(app: AppHandle, custom_ffmpeg_path: Option<String>) -> bool {
    resolve_ffmpeg(&app, &custom_ffmpeg_path).is_some()
}

#[tauri::command]
fn get_ffmpeg_version(app: AppHandle, custom_ffmpeg_path: Option<String>) -> String {
    resolve_ffmpeg(&app, &custom_ffmpeg_path)
        .map(|pair| pair.version)
        .unwrap_or_else(|| "Not Found".to_string())
}

static YTDLP_INSTALLING: AtomicBool = AtomicBool::new(false);

fn managed_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("ytdlp").join(executable_name("yt-dlp")))
        .map_err(|error| format!("Could not resolve app data directory: {error}"))
}

struct YtdlpResolveResult {
    path: PathBuf,
    source: &'static str,
    version: String,
}

fn query_ytdlp_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if output.status.success() {
        let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !version_str.is_empty() {
            return Some(version_str);
        }
    }
    None
}

fn resolve_ytdlp(app: &AppHandle, custom_ytdlp_path: &Option<String>) -> Option<YtdlpResolveResult> {
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
fn get_ytdlp_status(app: AppHandle, custom_ytdlp_path: Option<String>) -> YtdlpStatus {
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

fn emit_ytdlp_install_progress(
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

struct YtdlpInstallFlagGuard;
impl Drop for YtdlpInstallFlagGuard {
    fn drop(&mut self) {
        YTDLP_INSTALLING.store(false, Ordering::Release);
    }
}

#[tauri::command]
async fn install_managed_ytdlp(app: AppHandle) -> Result<YtdlpStatus, String> {
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
            use std::io::Write;
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
fn download_youtube(
    window: Window,
    url: String,
    format: String,
    output_dir: String,
    custom_ytdlp_path: Option<String>,
    custom_ffmpeg_path: Option<String>,
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

        let mut filename_cmd = Command::new(&ytdlp_res.path);
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
        if format == "mp3" {
            download_args.extend(vec![
                "-f".to_string(),
                "bestaudio/best".to_string(),
                "-x".to_string(),
                "--audio-format".to_string(),
                "mp3".to_string(),
            ]);
        } else {
            download_args.extend(vec![
                "-f".to_string(),
                "bestvideo+bestaudio/best".to_string(),
                "--merge-output-format".to_string(),
                "mp4".to_string(),
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

        let mut download_cmd = Command::new(&ytdlp_res.path);
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

fn emit_install_progress(
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
        "ffmpeg-install-progress",
        FfmpegInstallProgress {
            stage: stage.to_string(),
            downloaded_bytes,
            total_bytes,
            percent,
            message: message.to_string(),
        },
    );
}

struct InstallFlagGuard;

impl Drop for InstallFlagGuard {
    fn drop(&mut self) {
        FFMPEG_INSTALLING.store(false, Ordering::Release);
    }
}

fn extract_managed_binaries(zip_path: &Path, prepared_root: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path)
        .map_err(|error| format!("Could not open downloaded archive: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Invalid FFmpeg ZIP archive: {error}"))?;
    let bin_dir = prepared_root.join("bin");
    fs::create_dir_all(&bin_dir)
        .map_err(|error| format!("Could not create FFmpeg directory: {error}"))?;

    let wanted = [executable_name("ffmpeg"), executable_name("ffprobe")];
    let mut extracted = [false, false];

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not read ZIP entry: {error}"))?;
        let Some(safe_path) = entry.enclosed_name() else {
            return Err("FFmpeg archive contained an unsafe path.".to_string());
        };
        let Some(file_name) = safe_path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        for (wanted_index, wanted_name) in wanted.iter().enumerate() {
            if file_name.eq_ignore_ascii_case(wanted_name) {
                let output_path = bin_dir.join(wanted_name);
                let mut output = fs::File::create(&output_path).map_err(|error| {
                    format!("Could not create {}: {error}", output_path.display())
                })?;
                std::io::copy(&mut entry, &mut output)
                    .map_err(|error| format!("Could not extract {wanted_name}: {error}"))?;
                extracted[wanted_index] = true;
            }
        }
    }

    if extracted.iter().all(|found| *found) {
        Ok(())
    } else {
        Err("Archive did not contain both ffmpeg and ffprobe binaries.".to_string())
    }
}

fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut retries = 0;
    loop {
        match fs::rename(from, to) {
            Ok(_) => return Ok(()),
            Err(err) => {
                if err.kind() == std::io::ErrorKind::PermissionDenied && retries < 10 {
                    retries += 1;
                    std::thread::sleep(std::time::Duration::from_millis(150));
                } else {
                    return Err(err);
                }
            }
        }
    }
}

fn remove_dir_all_with_retry(path: &Path) -> std::io::Result<()> {
    let mut retries = 0;
    loop {
        match fs::remove_dir_all(path) {
            Ok(_) => return Ok(()),
            Err(err) => {
                if err.kind() == std::io::ErrorKind::PermissionDenied && retries < 10 {
                    retries += 1;
                    std::thread::sleep(std::time::Duration::from_millis(150));
                } else {
                    return Err(err);
                }
            }
        }
    }
}

fn install_prepared_directory(prepared_root: &Path, final_root: &Path) -> Result<(), String> {
    let parent = final_root
        .parent()
        .ok_or_else(|| "Invalid managed FFmpeg destination.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    let backup_root = parent.join("ffmpeg-backup");
    if backup_root.exists() {
        remove_dir_all_with_retry(&backup_root)
            .map_err(|error| format!("Could not clear old FFmpeg backup: {error}"))?;
    }

    if final_root.exists() {
        rename_with_retry(final_root, &backup_root)
            .map_err(|error| format!("Could not stage existing FFmpeg installation: {error}"))?;
    }

    if let Err(error) = rename_with_retry(prepared_root, final_root) {
        if backup_root.exists() {
            let _ = rename_with_retry(&backup_root, final_root);
        }
        return Err(format!("Could not activate FFmpeg installation: {error}"));
    }

    if backup_root.exists() {
        let _ = remove_dir_all_with_retry(&backup_root);
    }
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn install_managed_ffmpeg(app: AppHandle) -> Result<FfmpegStatus, String> {
    if FFMPEG_INSTALLING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("An FFmpeg installation is already in progress.".to_string());
    }
    let _install_guard = InstallFlagGuard;

    let final_root = managed_ffmpeg_root(&app)?;
    if pair_from_ffmpeg_path(
        final_root.join("bin").join(executable_name("ffmpeg")),
        "managed",
    )
    .is_some()
    {
        return Ok(get_ffmpeg_status(app, None));
    }

    let parent = final_root
        .parent()
        .ok_or_else(|| "Invalid managed FFmpeg destination.".to_string())?
        .to_path_buf();
    fs::create_dir_all(&parent)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    let staging_root = parent.join(format!("ffmpeg-install-{}", std::process::id()));
    if staging_root.exists() {
        fs::remove_dir_all(&staging_root)
            .map_err(|error| format!("Could not clear previous installer files: {error}"))?;
    }
    fs::create_dir_all(&staging_root)
        .map_err(|error| format!("Could not create installer directory: {error}"))?;

    let result = async {
        let client = reqwest::Client::builder()
            .user_agent("Sadness-Splitter-3000/2.0")
            .build()
            .map_err(|error| format!("Could not initialize downloader: {error}"))?;

        emit_install_progress(
            &app,
            "downloading",
            0,
            0,
            "Connecting to FFmpeg download server...",
        );
        let mut response = client
            .get(FFMPEG_ZIP_URL)
            .send()
            .await
            .map_err(|error| format!("FFmpeg download failed: {error}"))?
            .error_for_status()
            .map_err(|error| format!("FFmpeg server returned an error: {error}"))?;
        let total_bytes = response.content_length().unwrap_or(0);
        let zip_path = staging_root.join("ffmpeg.zip");
        let mut zip_file = fs::File::create(&zip_path)
            .map_err(|error| format!("Could not create download file: {error}"))?;
        let mut downloaded_bytes = 0_u64;

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("FFmpeg download was interrupted: {error}"))?
        {
            zip_file
                .write_all(&chunk)
                .map_err(|error| format!("Could not save FFmpeg download: {error}"))?;
            downloaded_bytes += chunk.len() as u64;
            emit_install_progress(
                &app,
                "downloading",
                downloaded_bytes,
                total_bytes,
                "Downloading FFmpeg essentials...",
            );
        }
        zip_file
            .flush()
            .map_err(|error| format!("Could not finish FFmpeg download: {error}"))?;
        drop(zip_file);

        emit_install_progress(
            &app,
            "verifying",
            downloaded_bytes,
            total_bytes,
            "Verifying SHA-256 checksum...",
        );
        let checksum_response = client
            .get(FFMPEG_SHA256_URL)
            .send()
            .await
            .map_err(|error| format!("Could not download FFmpeg checksum: {error}"))?
            .error_for_status()
            .map_err(|error| format!("Checksum server returned an error: {error}"))?
            .text()
            .await
            .map_err(|error| format!("Could not read FFmpeg checksum: {error}"))?;
        let expected_checksum = parse_sha256_response(&checksum_response)?;

        let mut downloaded_file = fs::File::open(&zip_path)
            .map_err(|error| format!("Could not reopen FFmpeg download: {error}"))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 1024 * 1024];
        loop {
            let read = downloaded_file
                .read(&mut buffer)
                .map_err(|error| format!("Could not verify FFmpeg download: {error}"))?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        let actual_checksum = format!("{:x}", hasher.finalize());
        if actual_checksum != expected_checksum {
            return Err(
                "FFmpeg checksum verification failed. The download was discarded.".to_string(),
            );
        }

        emit_install_progress(
            &app,
            "extracting",
            downloaded_bytes,
            total_bytes,
            "Extracting verified FFmpeg binaries...",
        );
        let prepared_root = staging_root.join("ffmpeg");
        extract_managed_binaries(&zip_path, &prepared_root)?;
        let prepared_ffmpeg = prepared_root.join("bin").join(executable_name("ffmpeg"));
        let prepared_pair = pair_from_ffmpeg_path(prepared_ffmpeg, "managed")
            .ok_or_else(|| "Extracted FFmpeg binaries failed verification.".to_string())?;

        install_prepared_directory(&prepared_root, &final_root)?;
        emit_install_progress(
            &app,
            "ready",
            downloaded_bytes,
            total_bytes,
            &format!("FFmpeg {} is ready.", prepared_pair.version),
        );

        Ok(get_ffmpeg_status(app.clone(), None))
    }
    .await;

    let _ = remove_dir_all_with_retry(&staging_root);
    result
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
async fn install_managed_ffmpeg(_app: AppHandle) -> Result<FfmpegStatus, String> {
    Err("Automatic FFmpeg installation is only supported on Windows.".to_string())
}

#[tauri::command]
fn send_native_notification(title: String, body: String) {
    #[cfg(target_os = "windows")]
    {
        let safe_body = body.replace('"', "\\\"");
        let safe_title = title.replace('"', "\\\"");
        let ps_script = format!(
            r#"[void] [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms"); $objNotification = New-Object System.Windows.Forms.NotifyIcon; $objNotification.Icon = [System.Drawing.SystemIcons]::Information; $objNotification.BalloonTipText = "{}"; $objNotification.BalloonTipTitle = "{}"; $objNotification.Visible = $True; $objNotification.ShowBalloonTip(5000); Start-Sleep -s 6; $objNotification.Dispose();"#,
            safe_body, safe_title
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .spawn();
    }

    #[cfg(target_os = "macos")]
    {
        let safe_body = body.replace('"', "\\\"");
        let safe_title = title.replace('"', "\\\"");
        let osa_script = format!(
            "display notification \"{}\" with title \"{}\"",
            safe_body, safe_title
        );
        let _ = Command::new("osascript").args(["-e", &osa_script]).spawn();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("notify-send").args([&title, &body]).spawn();
    }
}

fn main() {
    // Crucial fix for Linux hardware acceleration crash with WebKitGTK and Radeon/NVIDIA GPUs
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    start_gpu_monitor();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            start_media_server(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_video_duration,
            process_video,
            list_videos_in_folder,
            generate_thumbnail,
            check_ffmpeg,
            get_ffmpeg_version,
            get_ffmpeg_status,
            install_managed_ffmpeg,
            get_system_metrics,
            send_native_notification,
            get_media_server_port,
            get_ytdlp_status,
            install_managed_ytdlp,
            download_youtube
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{linux_install_guidance_from, parse_sha256_response};

    #[test]
    fn parses_supported_linux_families() {
        let (_, ubuntu_command, _) =
            linux_install_guidance_from("ID=linuxmint\nID_LIKE=\"ubuntu debian\"\n");
        assert_eq!(
            ubuntu_command.as_deref(),
            Some("sudo apt update && sudo apt install ffmpeg")
        );

        let (_, arch_command, _) = linux_install_guidance_from("ID=manjaro\nID_LIKE=arch\n");
        assert_eq!(arch_command.as_deref(), Some("sudo pacman -S ffmpeg"));

        let (_, fedora_command, warning) = linux_install_guidance_from("ID=fedora\n");
        assert_eq!(
            fedora_command.as_deref(),
            Some("sudo dnf install ffmpeg-free")
        );
        assert!(warning.is_some());
    }

    #[test]
    fn rejects_unknown_linux_family_without_guessing_a_command() {
        let (distro, command, warning) = linux_install_guidance_from("ID=gentoo\n");
        assert_eq!(distro.as_deref(), Some("gentoo"));
        assert!(command.is_none());
        assert!(warning.is_some());
    }

    #[test]
    fn validates_sha256_response() {
        let checksum = "6f58ce889f59c311410f7d2b18895b33c03456463486f3b1ebc93d97a0f54541";
        assert_eq!(parse_sha256_response(checksum).unwrap(), checksum);
        assert!(parse_sha256_response("not-a-checksum").is_err());
        assert!(parse_sha256_response("").is_err());
    }
}
