use crate::ffmpeg::resolved_command_path;
use crate::types::{FinishedPayload, ProgressPayload, VideoMetadata};
use crate::utils::create_command;
use regex::Regex;
use std::io::{BufRead, BufReader};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, Window};

#[tauri::command]
pub fn get_video_duration(
    app: AppHandle,
    file_path: String,
    custom_ffmpeg_path: Option<String>,
) -> f64 {
    let cmd = resolved_command_path(&app, "ffprobe", &custom_ffmpeg_path);
    let output = create_command(cmd)
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
pub fn get_video_metadata(
    app: AppHandle,
    file_path: String,
    custom_ffmpeg_path: Option<String>,
) -> Result<VideoMetadata, String> {
    let cmd = resolved_command_path(&app, "ffprobe", &custom_ffmpeg_path);
    let output = create_command(cmd)
        .args([
            "-v",
            "error",
            "-show_entries",
            "stream=width,height,codec_type",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            &file_path,
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {e}"))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe exited with error: {err_msg}"));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse ffprobe JSON: {e}"))?;

    let duration_str = parsed["format"]["duration"].as_str().unwrap_or("0");
    let duration: f64 = duration_str.parse().unwrap_or(0.0);

    let mut width = None;
    let mut height = None;
    let mut has_audio = false;

    if let Some(streams) = parsed["streams"].as_array() {
        for stream in streams {
            if let Some(codec_type) = stream["codec_type"].as_str() {
                if codec_type == "video" {
                    width = stream["width"].as_u64().map(|w| w as u32);
                    height = stream["height"].as_u64().map(|h| h as u32);
                } else if codec_type == "audio" {
                    has_audio = true;
                }
            }
        }
    }

    Ok(VideoMetadata {
        width,
        height,
        has_audio,
        duration,
    })
}

#[tauri::command]
pub fn process_video(
    window: Window,
    args: Vec<String>,
    total_duration: f64,
    custom_ffmpeg_path: Option<String>,
) {
    let app = window.app_handle().clone();
    std::thread::spawn(move || {
        let cmd = resolved_command_path(&app, "ffmpeg", &custom_ffmpeg_path);
        let mut child = match create_command(cmd)
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
pub fn generate_thumbnail(
    app: AppHandle,
    file_path: String,
    custom_ffmpeg_path: Option<String>,
) -> String {
    let temp_dir = std::env::temp_dir();
    let thumb_path = temp_dir.join("sadness_thumb.jpg");
    let thumb_str = thumb_path.to_str().unwrap_or("");
    let cmd = resolved_command_path(&app, "ffmpeg", &custom_ffmpeg_path);

    // ffmpeg -i input -ss 00:00:01 -vframes 1 -q:v 2 output.jpg
    let _ = create_command(cmd)
        .args([
            "-i", &file_path, "-ss", "00:00:01", "-vframes", "1", "-q:v", "2", "-y", thumb_str,
        ])
        .output();

    thumb_str.to_string()
}

#[tauri::command]
pub fn list_videos_in_folder(folder_path: String) -> Vec<String> {
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
