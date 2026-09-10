use crate::utils::create_command;

#[tauri::command]
pub fn send_native_notification(title: String, body: String) {
    #[cfg(target_os = "windows")]
    {
        let safe_body = body.replace('"', "\\\"");
        let safe_title = title.replace('"', "\\\"");
        let ps_script = format!(
            r#"[void] [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms"); $objNotification = New-Object System.Windows.Forms.NotifyIcon; $objNotification.Icon = [System.Drawing.SystemIcons]::Information; $objNotification.BalloonTipText = "{}"; $objNotification.BalloonTipTitle = "{}"; $objNotification.Visible = $True; $objNotification.ShowBalloonTip(5000); Start-Sleep -s 6; $objNotification.Dispose();"#,
            safe_body, safe_title
        );
        let _ = create_command("powershell")
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
        let _ = create_command("osascript").args(["-e", &osa_script]).spawn();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = create_command("notify-send").args([&title, &body]).spawn();
    }
}
