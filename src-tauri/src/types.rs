use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Serialize)]
pub struct ProgressPayload {
    pub percentage: i32,
}

#[derive(Clone, Serialize)]
pub struct FinishedPayload {
    pub success: bool,
    pub output_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtdlpStatus {
    pub available: bool,
    pub version: String,
    pub source: String,
    pub path: String,
    pub platform: String,
    pub install_supported: bool,
    pub managed_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtdlpInstallProgress {
    pub stage: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: u8,
    pub message: String,
}

#[derive(Clone, Serialize)]
pub struct LogPayload {
    pub message: String,
    #[serde(rename = "type")]
    pub log_type: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    pub available: bool,
    pub version: String,
    pub source: String,
    pub path: String,
    pub platform: String,
    pub install_supported: bool,
    pub managed_path: String,
    pub distro: Option<String>,
    pub install_command: Option<String>,
    pub install_warning: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegInstallProgress {
    pub stage: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: u8,
    pub message: String,
}

#[derive(Clone)]
pub struct FfmpegPair {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub source: &'static str,
    pub version: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub has_audio: bool,
    pub duration: f64,
}

#[derive(Clone, Serialize)]
pub struct SystemMetricsPayload {
    pub cpu_percent: f32,
    pub ram_percent: f32,
    pub gpu_percent: f32,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug)]
#[serde(rename_all = "PascalCase")]
pub struct GpuEngine {
    #[allow(dead_code)]
    pub name: String,
    pub utilization_percentage: u32,
}
