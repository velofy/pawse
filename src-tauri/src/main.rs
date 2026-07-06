#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod schedule;

use std::{
    fs,
    io::Write as _,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration as StdDuration,
};

use chrono::{DateTime, Duration, Local};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt as _;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct Settings {
    interval_minutes: u64,
    /// "HH:MM" entries; when non-empty they replace the interval.
    fixed_times: Vec<String>,
    break_seconds: u64,
    messages: Vec<String>,
    allow_escape: bool,
    escape_hold_seconds: u64,
    sound: bool,
    dog_name: String,
    /// "golden" or any CSS hex color for the coat.
    coat: String,
    /// "auto" (real video when clips exist, else 3D), "video", or "3d".
    dog_style: String,
    autostart: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            interval_minutes: 45,
            fixed_times: Vec::new(),
            break_seconds: 30,
            messages: default_messages(),
            allow_escape: true,
            escape_hold_seconds: 3,
            sound: true,
            dog_name: "Biscuit".into(),
            coat: "golden".into(),
            dog_style: "auto".into(),
            autostart: false,
        }
    }
}

fn default_messages() -> Vec<String> {
    vec![
        "Hey Hooman, take a break, you have been working really hard 🐾".into(),
        "Woof! Time to stretch those legs, take a little walk. 🚶".into(),
        "Walk time! And grab some water while you're up. 💧".into(),
    ]
}

impl Settings {
    fn sanitized(mut self) -> Self {
        self.interval_minutes = self.interval_minutes.clamp(1, 720);
        self.break_seconds = self.break_seconds.clamp(5, 600);
        self.escape_hold_seconds = self.escape_hold_seconds.clamp(1, 10);
        self.messages.retain(|m| !m.trim().is_empty());
        if self.messages.is_empty() {
            self.messages = default_messages();
        }
        self.fixed_times.retain(|t| !t.trim().is_empty());
        self.dog_name = self.dog_name.trim().to_string();
        if self.dog_name.is_empty() {
            self.dog_name = "Biscuit".into();
        }
        if !["auto", "video", "3d"].contains(&self.dog_style.as_str()) {
            self.dog_style = "auto".into();
        }
        self
    }
}

struct AppState {
    settings: Mutex<Settings>,
    next_break: Mutex<Option<DateTime<Local>>>,
    paused_until: Mutex<Option<DateTime<Local>>>,
    in_break: AtomicBool,
    msg_index: Mutex<usize>,
    current_message: Mutex<String>,
}

fn config_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("no app config directory");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn settings_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("settings.json")
}

fn moods_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("moods.jsonl")
}

fn load_settings(app: &AppHandle) -> Settings {
    fs::read_to_string(settings_path(app))
        .ok()
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .map(Settings::sanitized)
        .unwrap_or_default()
}

fn persist_settings(app: &AppHandle, settings: &Settings) {
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(settings_path(app), json);
    }
}

fn append_mood(app: &AppHandle, mood: &str) {
    let entry = serde_json::json!({ "ts": Local::now().to_rfc3339(), "mood": mood });
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(moods_path(app))
    {
        let _ = writeln!(f, "{entry}");
    }
}

fn reschedule(app: &AppHandle) {
    let state = app.state::<AppState>();
    let s = state.settings.lock().unwrap().clone();
    *state.next_break.lock().unwrap() = Some(schedule::compute_next(
        s.interval_minutes,
        &s.fixed_times,
        Local::now(),
    ));
}

#[cfg(target_os = "macos")]
fn raise_above_everything(win: &tauri::WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    if let Ok(ptr) = win.ns_window() {
        let ns = ptr as *mut AnyObject;
        if !ns.is_null() {
            unsafe {
                // kCGScreenSaverWindowLevel: above the menu bar and the Dock.
                let _: () = msg_send![ns, setLevel: 1000isize];
                // canJoinAllSpaces (1) | fullScreenAuxiliary (1 << 8): also
                // covers apps that are in native fullscreen spaces.
                let _: () = msg_send![ns, setCollectionBehavior: 257usize];
            }
        }
    }
}

/// Take over every monitor with a break window. Idempotent while a break runs.
fn start_break(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.in_break.swap(true, Ordering::SeqCst) {
        return;
    }

    let settings = state.settings.lock().unwrap().clone();
    {
        let mut idx = state.msg_index.lock().unwrap();
        let msg = settings.messages[*idx % settings.messages.len()].clone();
        *idx = (*idx + 1) % settings.messages.len();
        *state.current_message.lock().unwrap() = msg;
    }

    let mut monitors = app.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        if let Ok(Some(primary)) = app.primary_monitor() {
            monitors.push(primary);
        }
    }
    if monitors.is_empty() {
        state.in_break.store(false, Ordering::SeqCst);
        return;
    }

    for (i, monitor) in monitors.iter().enumerate() {
        let label = format!("break-{i}");
        let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("break.html".into()))
            .title("Pawse")
            .decorations(false)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .closable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .transparent(true)
            .focused(i == 0)
            .build();
        match built {
            Ok(win) => {
                let _ = win.set_position(tauri::Position::Physical(*monitor.position()));
                let _ = win.set_size(tauri::Size::Physical(*monitor.size()));
                let _ = win.set_visible_on_all_workspaces(true);
                #[cfg(target_os = "macos")]
                raise_above_everything(&win);
                if i == 0 {
                    let _ = win.set_focus();
                }
            }
            Err(e) => eprintln!("pawse: failed to create break window {label}: {e}"),
        }
    }
}

/// Close break windows, log the outcome, schedule the next break.
fn end_break(app: &AppHandle, mood: &str) {
    let state = app.state::<AppState>();
    if !state.in_break.swap(false, Ordering::SeqCst) {
        return;
    }
    append_mood(app, mood);
    for (label, win) in app.webview_windows() {
        if label.starts_with("break-") {
            let _ = win.destroy();
        }
    }
    reschedule(app);
}

fn open_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Pawse")
        .inner_size(820.0, 700.0)
        .min_inner_size(640.0, 560.0)
        .build();
}

fn spawn_scheduler(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(StdDuration::from_secs(1));
        let state = app.state::<AppState>();
        if state.in_break.load(Ordering::SeqCst) {
            continue;
        }
        let now = Local::now();
        let settings = state.settings.lock().unwrap().clone();

        {
            let mut paused = state.paused_until.lock().unwrap();
            if let Some(until) = *paused {
                if now < until {
                    continue;
                }
                *paused = None;
                *state.next_break.lock().unwrap() = Some(schedule::compute_next(
                    settings.interval_minutes,
                    &settings.fixed_times,
                    now,
                ));
                continue;
            }
        }

        let due = {
            let mut next = state.next_break.lock().unwrap();
            match *next {
                None => {
                    *next = Some(schedule::compute_next(
                        settings.interval_minutes,
                        &settings.fixed_times,
                        now,
                    ));
                    false
                }
                Some(t) => now >= t,
            }
        };

        if due {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || start_break(&handle));
        }
    });
}

// ---------------------------------------------------------------------------
// Commands (the only bridge the UI has to the system)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(app: AppHandle, state: tauri::State<'_, AppState>, settings: Settings) {
    let clean = settings.sanitized();
    persist_settings(&app, &clean);
    let autolaunch = app.autolaunch();
    let _ = if clean.autostart {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    *state.settings.lock().unwrap() = clean;
    if !state.in_break.load(Ordering::SeqCst) && state.paused_until.lock().unwrap().is_none() {
        reschedule(&app);
    }
}

#[tauri::command]
fn get_status(state: tauri::State<AppState>) -> serde_json::Value {
    serde_json::json!({
        "next_break_ms": state.next_break.lock().unwrap().map(|t| t.timestamp_millis()),
        "paused_until_ms": state.paused_until.lock().unwrap().map(|t| t.timestamp_millis()),
        "in_break": state.in_break.load(Ordering::SeqCst),
    })
}

#[tauri::command]
fn get_break_info(
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
) -> serde_json::Value {
    serde_json::json!({
        "settings": state.settings.lock().unwrap().clone(),
        "message": state.current_message.lock().unwrap().clone(),
        "primary": window.label() == "break-0",
    })
}

#[tauri::command]
fn finish_break(app: AppHandle, mood: String) {
    let mood = if mood == "happy" { "happy" } else { "meh" };
    end_break(&app, mood);
}

#[tauri::command]
fn skip_break(app: AppHandle) {
    end_break(&app, "skipped");
}

#[tauri::command]
fn take_break_now(app: AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || start_break(&handle));
}

#[tauri::command]
fn pause_breaks(state: tauri::State<AppState>, minutes: u64) {
    *state.paused_until.lock().unwrap() = Some(Local::now() + Duration::minutes(minutes as i64));
}

#[tauri::command]
fn resume_breaks(app: AppHandle, state: tauri::State<'_, AppState>) {
    *state.paused_until.lock().unwrap() = None;
    reschedule(&app);
}

/// Absolute paths to the real-dog clips: the user's own clips in
/// `<config>/dogclips/` win over the bundled set; None if neither is complete.
#[tauri::command]
fn get_dog_clips(app: AppHandle) -> Option<serde_json::Value> {
    let names = ["idle.mp4", "happy.mp4", "sad.mp4"];
    let user_dir = config_dir(&app).join("dogclips");
    let bundled = app
        .path()
        .resolve("clips", tauri::path::BaseDirectory::Resource)
        .ok();
    let dir = if names.iter().all(|n| user_dir.join(n).exists()) {
        Some(user_dir)
    } else {
        bundled.filter(|b| names.iter().all(|n| b.join(n).exists()))
    };
    dir.map(|d| {
        serde_json::json!({
            "idle": d.join("idle.mp4").to_string_lossy(),
            "happy": d.join("happy.mp4").to_string_lossy(),
            "sad": d.join("sad.mp4").to_string_lossy(),
        })
    })
}

#[tauri::command]
fn get_mood_log(app: AppHandle) -> Vec<serde_json::Value> {
    fs::read_to_string(moods_path(&app))
        .map(|content| {
            let entries: Vec<serde_json::Value> = content
                .lines()
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect();
            let skip = entries.len().saturating_sub(90);
            entries.into_iter().skip(skip).collect()
        })
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            open_settings(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            get_status,
            get_break_info,
            finish_break,
            skip_break,
            take_break_now,
            pause_breaks,
            resume_breaks,
            get_mood_log,
            get_dog_clips,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            let first_run = !settings_path(&handle).exists();
            let settings = load_settings(&handle);
            if first_run {
                persist_settings(&handle, &settings);
            }
            app.manage(AppState {
                settings: Mutex::new(settings),
                next_break: Mutex::new(None),
                paused_until: Mutex::new(None),
                in_break: AtomicBool::new(false),
                msg_index: Mutex::new(0),
                current_message: Mutex::new(String::new()),
            });

            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "break_now", "Take a break now", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "pause_1h", "Pause for 1 hour", true, None::<&str>)?,
                    &MenuItem::with_id(app, "resume", "Resume breaks", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "Quit Pawse", true, None::<&str>)?,
                ],
            )?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Pawse, break time with Biscuit")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "break_now" => {
                        let handle = app.clone();
                        let _ = app.run_on_main_thread(move || start_break(&handle));
                    }
                    "pause_1h" => {
                        let state = app.state::<AppState>();
                        *state.paused_until.lock().unwrap() =
                            Some(Local::now() + Duration::minutes(60));
                    }
                    "resume" => {
                        let state = app.state::<AppState>();
                        *state.paused_until.lock().unwrap() = None;
                        reschedule(app);
                    }
                    "settings" => open_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            reschedule(&handle);
            spawn_scheduler(handle.clone());
            if first_run {
                open_settings(&handle);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Pawse")
        .run(|_app, event| {
            // Keep running from the tray when the last window closes; only an
            // explicit app.exit() (tray Quit) carries an exit code.
            if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
