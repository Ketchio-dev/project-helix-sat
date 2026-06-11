use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn unix_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

pub(crate) fn now_iso() -> String {
    "2026-05-04T00:00:00.000Z".to_string()
}
