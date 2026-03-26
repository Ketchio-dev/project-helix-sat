# Test Spec — Module Simulation

## Verification Targets
1. API can start a module simulation and returns ordered session-owned items.
2. Attempt submission during a module updates session progress and returns module summary context.
3. Tutor hints remain blocked for active module items based on server-side session state.
4. API can finish a module and returns a module-level summary.
5. Dashboard and session history expose latest module summary without regressing existing shapes.
6. OpenAPI/foundation checks include the module routes.

## Planned Automated Coverage
### API tests
- `POST /api/module/start` returns a module session with `sessionType=module_simulation`, deterministic item order, and exam-mode metadata.
- `POST /api/attempt/submit` during an active module returns session progress and module summary fields.
- `POST /api/tutor/hint` rejects requests for active module items even if client mode is forged.
- `POST /api/module/finish` returns completed summary with accuracy, pacing, and breakdowns.
- `GET /api/dashboard/learner` includes `latestModuleSummary`.
- `GET /api/sessions/history` includes module session rows with compatible payload fields.

### Foundation tests
- OpenAPI declares `/api/module/start` and `/api/module/finish`.
- Foundation validator still passes with updated route/document expectations.

### Static verification
- `node --check services/api/src/store.mjs services/api/src/router.mjs apps/web/public/app.js`
- `npm test`
- `npm run build`
- `npm run check`

## Manual Smoke Expectations
- Browser can start and finish a module from the learner shell.
- While a module is active, hint requests are visually blocked/hidden the same way exam-mode flows are handled.

## Known Gaps
- No real persistence or multi-tab conflict arbitration in this slice.
- No true countdown timer enforcement yet.
