# Hien’s Nha — instructions for code changes

Read `docs/project/README.md`, `business.md`, `architecture.md` and `development.md` before implementing features. Read `docs/project/requests.md` for help-request changes. These describe the current system; numbered root design documents are the initial baseline.

- Preserve user commits and new bot archives; update from main and work on a feature branch. Never overwrite uploaded assets or force-push main.
- Keep presentation, domain validation, published read models, GitHub adapters and delivery separate. Reuse existing helpers.
- Keep public approval separate from acceptance. Only the repository owner may update Requests status. Enforce transitions and a nonempty completion result in the domain, not only in UI.
- Treat submitted text/JSON as untrusted data, never executable HTML/MDX. No secrets in repository, logs or issues. ADR0013 permits only the explicitly requested, scoped seven-day Supabase session in browser storage; never persist provider tokens or PKCE verifiers. Photo upload tokens stay in memory.
- Preserve versioned marker/schema compatibility, existing routes and imported chapters. Apply base URL utilities, both VI/EN routes, and original-content localization exclusions.
- If touching a contract, add meaningful regression tests and update relevant docs/diagrams in the same change. Use the regression map and commands in development.md. Do not bypass failing checks.
- Keep the `Archive guestbook` workflow name paired with the Pages workflow_run trigger. Archive reads latest state and fails on API errors; publication is a build snapshot, not realtime.
- Do not add production demo requests, send real submissions to test, deploy to a new host, introduce a backend/DB, change access/ownership, or widen operator permissions without user authorization for that scope.
- State verification limits honestly. Documentation/tests reduce regressions; do not promise zero bugs.
