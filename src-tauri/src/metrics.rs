use crate::types::SystemMetricsPayload;
use std::sync::atomic::{AtomicU32, Ordering};
use sysinfo::System;

#[cfg(target_os = "windows")]
use crate::types::GpuEngine;
#[cfg(target_os = "windows")]
use wmi::{COMLibrary, WMIConnection};

// We use an AtomicU32 to store f32 as bits to avoid Mutex overhead
pub static GPU_USAGE: AtomicU32 = AtomicU32::new(0);
pub static CPU_USAGE: AtomicU32 = AtomicU32::new(0);
pub static RAM_USAGE: AtomicU32 = AtomicU32::new(0);

#[cfg(target_os = "windows")]
pub fn start_gpu_monitor() {
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
pub fn start_gpu_monitor() {
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
pub fn start_gpu_monitor() {
    // Unsupported OS
}

pub fn get_gpu_usage() -> f32 {
    f32::from_bits(GPU_USAGE.load(Ordering::Relaxed))
}

pub fn start_system_monitor() {
    std::thread::spawn(move || {
        let mut sys = System::new_all();
        loop {
            sys.refresh_memory();
            sys.refresh_cpu();

            let total_mem = sys.total_memory();
            let used_mem = sys.used_memory();
            let ram_percent = if total_mem > 0 {
                ((used_mem as f64 / total_mem as f64) * 100.0) as f32
            } else {
                0.0
            };
            let cpu_percent = sys.global_cpu_info().cpu_usage();

            CPU_USAGE.store(cpu_percent.to_bits(), Ordering::Relaxed);
            RAM_USAGE.store(ram_percent.to_bits(), Ordering::Relaxed);

            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
    });
}

#[tauri::command]
pub fn get_system_metrics() -> Result<SystemMetricsPayload, String> {
    let cpu_percent = f32::from_bits(CPU_USAGE.load(Ordering::Relaxed));
    let ram_percent = f32::from_bits(RAM_USAGE.load(Ordering::Relaxed));
    let gpu_percent = get_gpu_usage();

    Ok(SystemMetricsPayload {
        cpu_percent,
        ram_percent,
        gpu_percent,
    })
}
