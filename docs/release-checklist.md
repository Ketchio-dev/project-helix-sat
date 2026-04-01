# Release Checklist

## Beta-safe environment

- [ ] `HELIX_DATABASE_URL` is configured and reachable.
- [ ] `HELIX_REDIS_URL` is configured and reachable.
- [ ] `HELIX_TOKEN_SECRET` is configured.
- [ ] `HELIX_LEGACY_PASSWORD_SECRET` is configured.
- [ ] `HELIX_ENABLE_DEMO_AUTH` is unset for the target environment.

## Supported surfaces

- [ ] Legacy learner shell remains the only supported private-beta learner surface.
- [ ] React app is still marked experimental/parity-gated.

## Release gate

- [ ] `npm run check`
- [ ] `npm run check:contracts`
- [ ] `npm run check:web-react`
- [ ] `HELIX_SMOKE_SCREENSHOT=artifacts/learner-smoke.png npm run smoke:learner`
- [ ] Learner smoke screenshot artifact exists under `artifacts/`.

## Auth and runtime safety

- [ ] Logout invalidates the old auth session.
- [ ] Production-like mode rejects missing PostgreSQL / Redis URLs.
- [ ] Demo auth is blocked in beta-safe mode.
- [ ] Auth throttling returns 429 after repeated invalid login attempts.
