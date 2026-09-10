#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;
mod media_server;
mod metrics;
mod notifications;
mod types;
mod utils;
mod video;
mod ytdlp;

use ffmpeg::{
    check_ffmpeg, get_ffmpeg_status, get_ffmpeg_version, install_managed_ffmpeg,
};
use media_server::{get_media_server_port, start_media_server};
use metrics::{get_system_metrics, start_gpu_monitor, start_system_monitor};
use notifications::send_native_notification;
use video::{
    generate_thumbnail, get_video_duration, get_video_metadata, list_videos_in_folder, process_video,
};
use ytdlp::{download_youtube, get_ytdlp_status, install_managed_ytdlp};

fn main() {
    // Crucial fix for Linux hardware acceleration crash with WebKitGTK and Radeon/NVIDIA GPUs
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    start_gpu_monitor();
    start_system_monitor();

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
            download_youtube,
            get_video_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use crate::ffmpeg::{linux_install_guidance_from, parse_sha256_response};

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
