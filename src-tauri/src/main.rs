#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use regex::Regex;
use serde::Serialize;
use tauri::{Emitter, Window};
use sysinfo::System;

#[derive(Clone, Serialize)]
struct ProgressPayload {
    percentage: i32,
}

#[derive(Clone, Serialize)]
struct FinishedPayload {
    success: bool,
}

#[tauri::command]
fn get_video_duration(file_path: String) -> f64 {
    let output = Command::new("ffprobe")
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
fn process_video(window: Window, args: Vec<String>, total_duration: f64) {
    std::thread::spawn(move || {
        let mut child = match Command::new("ffmpeg")
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
        
        // Regex to parse `time=HH:MM:SS.ms`
        let re = Regex::new(r"time=(\d{2}):(\d{2}):(\d{2}\.\d{2})").unwrap();

        let mut last_percentage: i32 = 0;

        for line in reader.lines() {
            if let Ok(l) = line {
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
fn generate_thumbnail(file_path: String) -> String {
    let temp_dir = std::env::temp_dir();
    let thumb_path = temp_dir.join("sadness_thumb.jpg");
    let thumb_str = thumb_path.to_str().unwrap_or("");

    // ffmpeg -i input -ss 00:00:01 -vframes 1 -q:v 2 output.jpg
    let _ = Command::new("ffmpeg")
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

    Ok(SystemMetricsPayload { cpu_percent, ram_percent })
}

#[tauri::command]
fn check_ffmpeg() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_video_duration, process_video, list_videos_in_folder, generate_thumbnail, check_ffmpeg, get_system_metrics])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
