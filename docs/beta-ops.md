# Managed Beta Operating Constraints

This document describes the operational posture, persistence mechanisms, and known constraints for the Project Helix SAT managed beta.

## Operational Posture

The current architecture is a **single-process, file-backed prototype**. It is designed for simple deployment and vertical scaling during the initial private beta phase.

### Known Constraints

1.  **Single Process Limitation**: The file-backed state storage does not support concurrent access from multiple server processes. High-availability (HA) deployments with multiple replicas are not supported in this mode.
2.  **Local Disk Dependency**: Persistence relies on a local filesystem path. In containerized environments, this path must be mapped to a persistent volume.
3.  **In-Memory Working Set**: While state is persisted to disk, the server maintains the active state in memory for performance. Memory usage scales with the number of active users and total system events.

## Persistence and Recovery

Persistence is gated by the `HELIX_STATE_FILE` environment variable.

### Persistence Mechanism

- **Atomic Writes**: State is written to a temporary file and then renamed to the target path. This prevents partial writes and file corruption during crashes.
- **Snapshot Frequency**: The server performs a full state snapshot on every mutable operation (e.g., attempt submission, registration, goal update).

### Corruption Recovery

If the state file becomes unreadable or fails schema validation on startup:
1.  **Automatic Backup**: The server renames the problematic file to `*.corrupt-<timestamp>`.
2.  **Safe Fallback**: The server initializes with the default demo/seed data to ensure availability.
3.  **Operator Alert**: Check server logs for "Persistence snapshot" errors to identify when a fallback has occurred.

### Data Reset and Backups

- **Manual Backup**: Operators can backup the system by simply copying the `HELIX_STATE_FILE`.
- **System Reset**: Deleting the `HELIX_STATE_FILE` and restarting the server will reset the system to its initial seeded state.

## Release Baseline

Private beta snapshots are tagged with semantic versions (`v0.1.x`). Every release must pass the full `npm run check` suite and the Playwright learner smoke tests.

## Persistence Decision Gate

The current file-backed posture is acceptable for the **Managed Private Beta (Wave 1)**. Transitioning to a hardened database (e.g., PostgreSQL) and multi-process deployment is required when any of the following triggers are met:

| Trigger | Threshold |
| :--- | :--- |
| **Concurrent Users** | > 50 simultaneous active learners |
| **State Size** | JSON state file exceeds 100MB |
| **Availability** | Requirement for zero-downtime rolling deployments |
| **Audit/Compliance** | Requirement for point-in-time recovery (PITR) or row-level locking |
| **Complexity** | Requirement for cross-service data sharing or complex relational queries |

## Test Coverage

Persistence behavior is verified via the split API persistence/session suites (`tests/api-persistence.test.mjs`, `tests/api-session-and-exam.test.mjs`), including:
- Unfinished session restoration across restarts.
- Completed history and dashboard preservation.
- Safely handling malformed JSON and invalid state shapes.
- Preservation of exposure tracking and telemetry events.
