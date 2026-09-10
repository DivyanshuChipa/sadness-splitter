use std::sync::atomic::{AtomicU16, Ordering};
use warp::{Filter, Reply};

pub static MEDIA_PORT: AtomicU16 = AtomicU16::new(0);

#[tauri::command]
pub fn get_media_server_port() -> u16 {
    MEDIA_PORT.load(Ordering::Relaxed)
}

pub fn start_media_server(handle: tauri::AppHandle) {
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
