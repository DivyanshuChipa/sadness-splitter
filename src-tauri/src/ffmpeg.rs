use crate::types::{FfmpegInstallProgress, FfmpegPair, FfmpegStatus};
use crate::utils::{
    create_command, executable_name, find_executable_in_path, get_exe_dir_sibling, platform_name,
};
use regex::Regex;
#[allow(unused_imports)]
use sha2::{Digest, Sha256};
use std::fs;
#[allow(unused_imports)]
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

#[allow(dead_code)]
pub static FFMPEG_INSTALLING: AtomicBool = AtomicBool::new(false);

#[allow(dead_code)]
const FFMPEG_ZIP_URL: &str = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
#[allow(dead_code)]
const FFMPEG_SHA256_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256";

pub fn managed_ffmpeg_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("ffmpeg"))
        .map_err(|error| format!("Could not resolve app data directory: {error}"))
}

pub fn pair_from_ffmpeg_path(path: PathBuf, source: &'static str) -> Option<FfmpegPair> {
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

pub fn pair_from_commands(
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

pub fn command_succeeds(command: &Path, args: &[&str]) -> bool {
    create_command(command)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub fn read_ffmpeg_version(command: &Path) -> Option<String> {
    let output = create_command(command).arg("-version").output().ok()?;
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

pub fn resolve_ffmpeg(app: &AppHandle, custom_ffmpeg_path: &Option<String>) -> Option<FfmpegPair> {
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
        get_exe_dir_sibling("ffmpeg"),
        get_exe_dir_sibling("ffprobe"),
    ) {
        if let Some(pair) = pair_from_commands(ffmpeg_path, ffprobe_path, "portable") {
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

pub fn resolved_command_path(
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

pub fn linux_install_guidance_from(contents: &str) -> (Option<String>, Option<String>, Option<String>) {
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

pub fn linux_install_guidance() -> (Option<String>, Option<String>, Option<String>) {
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

pub fn parse_sha256_response(contents: &str) -> Result<String, String> {
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

#[allow(dead_code)]
pub fn emit_install_progress(
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

pub struct InstallFlagGuard;

impl Drop for InstallFlagGuard {
    fn drop(&mut self) {
        FFMPEG_INSTALLING.store(false, Ordering::Release);
    }
}

#[allow(dead_code)]
pub fn extract_managed_binaries(zip_path: &Path, prepared_root: &Path) -> Result<(), String> {
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

#[allow(dead_code)]
pub fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
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

#[allow(dead_code)]
pub fn remove_dir_all_with_retry(path: &Path) -> std::io::Result<()> {
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

#[allow(dead_code)]
pub fn install_prepared_directory(prepared_root: &Path, final_root: &Path) -> Result<(), String> {
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

#[tauri::command]
pub fn get_ffmpeg_status(app: AppHandle, custom_ffmpeg_path: Option<String>) -> FfmpegStatus {
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
pub fn check_ffmpeg(app: AppHandle, custom_ffmpeg_path: Option<String>) -> bool {
    resolve_ffmpeg(&app, &custom_ffmpeg_path).is_some()
}

#[tauri::command]
pub fn get_ffmpeg_version(app: AppHandle, custom_ffmpeg_path: Option<String>) -> String {
    resolve_ffmpeg(&app, &custom_ffmpeg_path)
        .map(|pair| pair.version)
        .unwrap_or_else(|| "Not Found".to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn install_managed_ffmpeg(app: AppHandle) -> Result<FfmpegStatus, String> {
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
pub async fn install_managed_ffmpeg(_app: AppHandle) -> Result<FfmpegStatus, String> {
    Err("Automatic FFmpeg installation is only supported on Windows.".to_string())
}
