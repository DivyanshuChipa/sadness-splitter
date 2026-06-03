#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window};
use sysinfo::System;
use std::sync::atomic::{AtomicU16, AtomicU32, Ordering};
use warp::{Filter, Reply};

#[cfg(target_os = "windows")]
use wmi::{COMLibrary, WMIConnection};

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug)]
#[serde(rename_all = "PascalCase")]
struct GpuEngine {
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
}

fn get_command_path(name: &str, custom_ffmpeg_path: &Option<String>) -> String {
    if let Some(ref path) = custom_ffmpeg_path {
        if !path.trim().is_empty() {
            if name == "ffprobe" {
                let p = std::path::Path::new(path);
                if let Some(parent) = p.parent() {
                    let exe_name = p.file_name().and_then(|f| f.to_str()).unwrap_or("ffmpeg.exe");
                    let ffprobe_exe = exe_name.replace("ffmpeg", "ffprobe").replace("FFMPEG", "FFPROBE");
                    let resolved = parent.join(ffprobe_exe);
                    if resolved.exists() {
                        return resolved.to_string_lossy().to_string();
                    }
                }
            }
            return path.clone();
        }
    }
    name.to_string()
}

#[tauri::command]
fn get_video_duration(file_path: String, custom_ffmpeg_path: Option<String>) -> f64 {
    let cmd = get_command_path("ffprobe", &custom_ffmpeg_path);
    let output = Command::new(cmd)
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
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
fn process_video(window: Window, args: Vec<String>, total_duration: f64, custom_ffmpeg_path: Option<String>) {
    std::thread::spawn(move || {
        let cmd = get_command_path("ffmpeg", &custom_ffmpeg_path);
        let mut child = match Command::new(cmd)
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(_) => {
                let _ = window.emit("finished", FinishedPayload { success: false });
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
        let _ = window.emit("finished", FinishedPayload { success: status.success() });
    });
}

#[tauri::command]
fn generate_thumbnail(file_path: String, custom_ffmpeg_path: Option<String>) -> String {
    let temp_dir = std::env::temp_dir();
    let thumb_path = temp_dir.join("sadness_thumb.jpg");
    let thumb_str = thumb_path.to_str().unwrap_or("");
    let cmd = get_command_path("ffmpeg", &custom_ffmpeg_path);

    // ffmpeg -i input -ss 00:00:01 -vframes 1 -q:v 2 output.jpg
    let _ = Command::new(cmd)
        .args([
            "-i", &file_path,
            "-ss", "00:00:01",
            "-vframes", "1",
            "-q:v", "2",
            "-y", thumb_str,
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
                let final_percentage = if total_utilization > 100 { 100.0 } else { total_utilization as f32 };
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
            let route_assets = warp::path("app-assets")
                .and(warp::path::tail())
                .map(move |tail: warp::path::Tail| {
                    let path_str = tail.as_str();
                    match handle_clone.asset_resolver().get(path_str.to_string()) {
                        Some(asset) => {
                            let res = warp::reply::with_header(
                                warp::reply::with_status(asset.bytes, warp::http::StatusCode::OK),
                                "Content-Type",
                                asset.mime_type
                            );
                            let res_with_ranges = warp::reply::with_header(
                                res,
                                "Accept-Ranges",
                                "bytes"
                            );
                            res_with_ranges.into_response()
                        }
                        None => {
                            let res_err = warp::reply::with_header(
                                warp::reply::with_status(Vec::new(), warp::http::StatusCode::NOT_FOUND),
                                "Content-Type",
                                "application/octet-stream"
                            );
                            res_err.into_response()
                        }
                    }
                });

            let route = route_media.or(route_assets);

            let cors = warp::cors()
                .allow_any_origin()
                .allow_methods(vec!["GET", "OPTIONS"])
                .allow_headers(vec!["Range", "Accept", "Content-Type"]);

            let (addr, server) = warp::serve(route.with(cors))
                .bind_ephemeral(([127, 0, 0, 1], 0));

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

    Ok(SystemMetricsPayload { cpu_percent, ram_percent, gpu_percent })
}

#[tauri::command]
fn check_ffmpeg(custom_ffmpeg_path: Option<String>) -> bool {
    let cmd = get_command_path("ffmpeg", &custom_ffmpeg_path);
    Command::new(cmd)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command]
fn get_ffmpeg_version(custom_ffmpeg_path: Option<String>) -> String {
    let cmd = get_command_path("ffmpeg", &custom_ffmpeg_path);
    let output = Command::new(cmd)
        .arg("-version")
        .output();
    
    match output {
        Ok(out) => {
            let stdout_str = String::from_utf8_lossy(&out.stdout);
            if let Some(first_line) = stdout_str.lines().next() {
                let re = Regex::new(r"ffmpeg version (\S+)").unwrap();
                if let Some(caps) = re.captures(first_line) {
                    caps[1].to_string()
                } else {
                    first_line.trim().to_string()
                }
            } else {
                "Unknown".to_string()
            }
        }
        Err(_) => "Not Found".to_string(),
    }
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
        let osa_script = format!("display notification \"{}\" with title \"{}\"", safe_body, safe_title);
        let _ = Command::new("osascript")
            .args(["-e", &osa_script])
            .spawn();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("notify-send")
            .args([&title, &body])
            .spawn();
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
            get_system_metrics, 
            send_native_notification,
            get_media_server_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}