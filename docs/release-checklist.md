# Release Checklist

## Beta-safe environment

- [ ] `HELIX_DATABASE_URL` is configured and reachable.
- [ ] `HELIX_REDIS_URL` is configured and reachable.
- [ ] `HELIX_TOKEN_SECRET` is configured.
- [ ] `HELIX_LEGACY_PASSWORD_SECRET` is configured.
- [ ] `HELIX_ENABLE_DEMO_AUTH` is unset for the target environment.

## Supported surfaces

- [x] React learner app is the promoted, default-served learner surface (passed the promotion gate: `npm run smoke:learner:react` + HttpOnly cookie-session parity).
- [ ] Legacy learner shell remains available as a fallback via `HELIX_WEB_CLIENT=legacy`.

## Release gate

- [ ] `npm run check`
- [ ] `npm run check:contracts`
- [ ] `npm run check:web-react`
- [ ] `HELIX_SMOKE_SCREENSHOT=artifacts/learner-smoke.png npm run smoke:learner` (legacy fallback)
- [ ] `HELIX_SMOKE_SCREENSHOT=artifacts/react-learner-smoke.png npm run smoke:learner:react` (promoted surface)
- [ ] Learner smoke screenshot artifacts exist under `artifacts/`.

## Auth and runtime safety

- [ ] Logout invalidates the old auth session.
- [ ] Production-like mode rejects missing PostgreSQL / Redis URLs.
- [ ] Demo auth is blocked in beta-safe mode.
- [ ] Auth throttling returns 429 after repeated invalid login attempts.
