## Supported Beta Surface (Wave 1)

The **legacy learner shell (`apps/web/public/*`)** is the only supported entry point for Wave 1.

The React app is considered **development-only** and does not fall under the managed beta support SLA. Operators should not attempt to route production traffic to the React port (default 5173) until promotion criteria in `docs/product-completion-milestones.md` are met.

## Operational Posture

The current architecture supports **two explicit operating modes**:

1. **Local fallback mode** — single-process, file-backed, dependency-light development mode.
2. **Beta-safe mode** — PostgreSQL-backed durable state/session records + Redis-backed auth rate limiting and revocation lookup.

Wave 1 managed beta should use **beta-safe mode**, not file-backed fallback mode.

### Local fallback constraints

1.  **Single Process Limitation**: The file-backed state storage does not support concurrent access from multiple server processes. High-availability (HA) deployments with multiple replicas are not supported in this mode.
2.  **Local Disk Dependency**: Persistence relies on a local filesystem path. In containerized environments, this path must be mapped to a persistent volume.
3.  **In-Memory Working Set**: While state is persisted to disk, the server maintains the active state in memory for performance. Memory usage scales with the number of active users and total system events.

### Beta-safe requirements

- `HELIX_DATABASE_URL` must point at PostgreSQL.
- `HELIX_REDIS_URL` must point at Redis.
- `HELIX_TOKEN_SECRET` and `HELIX_LEGACY_PASSWORD_SECRET` must be explicitly configured.
- `HELIX_ENABLE_DEMO_AUTH=1` must not be used.
- `HELIX_RUNTIME_MODE` / `HELIX_ENV` / `NODE_ENV` values that are production-like trigger these guards automatically.

## Persistence and Recovery

### Local fallback persistence

Local fallback persistence is gated by the `HELIX_STATE_FILE` environment variable.

### Persistence Mechanism

- **Atomic Writes**: State is written to a temporary file and then renamed to the target path. This prevents partial writes and file corruption during crashes.
- **Snapshot Frequency**: The server performs a full state snapshot on every mutable operation (e.g., attempt submission, registration, goal update).

### Local fallback corruption recovery

If the state file becomes unreadable or fails schema validation on startup:
1.  **Automatic Backup**: The server renames the problematic file to `*.corrupt-<timestamp>`.
2.  **Safe Fallback**: The server initializes with the default demo/seed data to ensure availability.
3.  **Operator Alert**: Check server logs for "Persistence snapshot" errors to identify when a fallback has occurred.

### Local fallback data reset and backups

- **Manual Backup**: Operators can backup the system by simply copying the `HELIX_STATE_FILE`.
- **System Reset**: Deleting the `HELIX_STATE_FILE` and restarting the server will reset the system to its initial seeded state.

### Beta-safe persistence behavior

- Mutable learner state snapshots are written through the PostgreSQL runtime adapter.
- Auth sessions are mirrored into PostgreSQL session-record storage.
- Logout and role changes revoke active session validity.
- Redis stores auth throttling counters and revoked-session lookup keys.

## Release gate

Private beta snapshots are tagged with semantic versions (`v0.1.x`). Every release must pass:

- `npm run check`
- `npm run check:contracts`
- `npm run check:web-react`
- `npm run smoke:learner`

When running locally, set `HELIX_SMOKE_SCREENSHOT=artifacts/learner-smoke.png` so the smoke artifact is preserved for inspection.

## Persistence decision gate

The current file-backed posture is acceptable only for **local fallback mode**. Beta-safe mode has already crossed the decision gate and should remain on PostgreSQL + Redis.

Fallback mode should be disabled whenever any of the following are true:

| Trigger | Threshold |
| :--- | :--- |
| **Managed beta traffic** | Any external learner cohort |
| **Concurrent Users** | > 1 active server process |
| **Availability** | Requirement for zero-downtime rolling deployments |
| **Audit/Compliance** | Requirement for durable auth session invalidation |
| **Control plane** | Need for shared auth rate limiting across instances |

## Test Coverage

Persistence/runtime behavior is verified via the split API/runtime suites (`tests/api-persistence.test.mjs`, `tests/api-session-and-exam.test.mjs`, `tests/runtime-store.test.mjs`), including:
- Unfinished session restoration across restarts.
- Completed history and dashboard preservation.
- Safely handling malformed JSON and invalid state shapes.
- Preservation of exposure tracking and telemetry events.
- Production-like config guards for PostgreSQL and Redis URLs.
- Runtime-backed revocation and auth rate-limit behavior.

## Operator quick start

### Local fallback

```bash
HELIX_STATE_FILE=.data/helix-sat-state.json node services/api/server.mjs
```

### Beta-safe

```bash
HELIX_RUNTIME_MODE=staging \
HELIX_DATABASE_URL=postgresql://user:pass@host:5432/helix \
HELIX_REDIS_URL=redis://host:6379/0 \
HELIX_TOKEN_SECRET=replace-me \
HELIX_LEGACY_PASSWORD_SECRET=replace-me \
node services/api/server.mjs
```
