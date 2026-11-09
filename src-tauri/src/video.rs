use crate::ffmpeg::resolved_command_path;
use crate::types::{FinishedPayload, ProgressPayload, VideoMetadata};
use crate::utils::create_command;
use regex::Regex;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, Window};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

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

#[tauri::command]
pub fn extract_frames_to_zip(
    window: Window,
    input_path: String,
    output_zip_path: String,
    fps: f64,
    format: String,
    total_duration: f64,
    custom_ffmpeg_path: Option<String>,
) {
    let app = window.app_handle().clone();
    std::thread::spawn(move || {
        let temp_dir_name = format!(
            "sadness_frames_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        );
        let temp_dir = std::env::temp_dir().join(temp_dir_name);
        if let Err(e) = std::fs::create_dir_all(&temp_dir) {
            eprintln!("Failed to create temp dir for frames: {e}");
            let _ = window.emit(
                "finished",
                FinishedPayload {
                    success: false,
                    output_path: None,
                },
            );
            return;
        }

        let ext = if format.to_lowercase() == "jpg" || format.to_lowercase() == "jpeg" {
            "jpg"
        } else {
            "png"
        };
        let frame_pattern = temp_dir.join(format!("frame_%06d.{}", ext));
        let frame_pattern_str = frame_pattern.to_string_lossy().to_string();

        let cmd = resolved_command_path(&app, "ffmpeg", &custom_ffmpeg_path);
        let vf_arg = format!("fps={}", fps);
        let mut ffmpeg_cmd = create_command(cmd);
        ffmpeg_cmd
            .args([
                "-i",
                &input_path,
                "-vf",
                &vf_arg,
                "-vsync",
                "0",
                "-y",
                &frame_pattern_str,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = match ffmpeg_cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to spawn ffmpeg for frames extraction: {e}");
                let _ = std::fs::remove_dir_all(&temp_dir);
                let _ = window.emit(
                    "finished",
                    FinishedPayload {
                        success: false,
                        output_path: None,
                    },
                );
                return;
            }
        };

        let stderr = child.stderr.take().expect("Failed to open stderr");
        let reader = BufReader::new(stderr);
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
                        // 0% - 85% is FFmpeg frame extraction
                        let mut percentage = ((current_seconds / total_duration) * 85.0) as i32;
                        if percentage > 85 {
                            percentage = 85;
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
        if !status.success() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            let _ = window.emit(
                "finished",
                FinishedPayload {
                    success: false,
                    output_path: None,
                },
            );
            return;
        }

        // Progress update: archiving into ZIP
        let _ = window.emit("progress", ProgressPayload { percentage: 88 });

        // Collect all extracted frames sorted
        let mut frame_entries: Vec<std::path::PathBuf> = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    frame_entries.push(path);
                }
            }
        }
        frame_entries.sort();

        if frame_entries.is_empty() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            let _ = window.emit(
                "finished",
                FinishedPayload {
                    success: false,
                    output_path: None,
                },
            );
            return;
        }

        // Create zip archive
        let zip_file_res = File::create(&output_zip_path);
        let zip_file = match zip_file_res {
            Ok(f) => f,
            Err(e) => {
                eprintln!("Failed to create zip file at {output_zip_path}: {e}");
                let _ = std::fs::remove_dir_all(&temp_dir);
                let _ = window.emit(
                    "finished",
                    FinishedPayload {
                        success: false,
                        output_path: None,
                    },
                );
                return;
            }
        };

        let mut zip = ZipWriter::new(zip_file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);

        let total_frames = frame_entries.len();
        let mut buffer = Vec::with_capacity(64 * 1024);

        for (idx, frame_path) in frame_entries.iter().enumerate() {
            let file_name = match frame_path.file_name().and_then(|n| n.to_str()) {
                Some(name) => name,
                None => continue,
            };

            if let Ok(mut f) = File::open(frame_path) {
                if zip.start_file(file_name, options).is_ok() {
                    buffer.clear();
                    if f.read_to_end(&mut buffer).is_ok() {
                        let _ = zip.write_all(&buffer);
                    }
                }
            }

            // Progress from 88% to 98%
            let zip_pct = 88 + (((idx + 1) as f64 / total_frames as f64) * 10.0) as i32;
            if zip_pct > last_percentage {
                last_percentage = zip_pct;
                let _ = window.emit("progress", ProgressPayload { percentage: zip_pct });
            }
        }

        let zip_ok = zip.finish().is_ok();
        let _ = std::fs::remove_dir_all(&temp_dir);

        let _ = window.emit(
            "finished",
            FinishedPayload {
                success: zip_ok,
                output_path: if zip_ok {
                    Some(output_zip_path)
                } else {
                    None
                },
            },
        );
    });
}
