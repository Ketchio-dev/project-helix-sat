# Helix SAT Rust API Prototype

This is an incremental Rust web-app backend for the existing Helix SAT learner shell.

Run it from the repository root:

```bash
npm run dev:rust
```

Then open:

```text
http://127.0.0.1:4322
```

Current scope:

- Serves `apps/web/public/*`
- Supports cookie login/register/logout
- Supports `/api/me`, goal profile read/write, dashboard reads, narrative/projection/report shells
- Keeps practice session execution on the Node API migration backlog

Validation:

```bash
npm run check:rust
```

The production-equivalent Node server remains `npm run dev`. This Rust service is a parity-building slice, not a full replacement yet.
