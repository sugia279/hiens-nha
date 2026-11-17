# Phase 5 — current public state, 2026-11-17

Production main: [f1a29a7](https://github.com/sugia279/hiens-nha/commit/f1a29a7c08e36e93b44cacaa50557e6618c22fac). [PR42](https://github.com/sugia279/hiens-nha/pull/42) and [PR43](https://github.com/sugia279/hiens-nha/pull/43) are merged. Post-merge [Pages](https://github.com/sugia279/hiens-nha/actions/runs/44038294623) and [Backend CI](https://github.com/sugia279/hiens-nha/actions/runs/44038294635) succeeded.

| Feature | Source / epoch | API writer |
| --- | --- | --- |
| Comments | API / 1 | On |
| Posts | API / 1 | Off |
| Media | Git / 0 | Off |
| Requests | Git / 0 | Off |

Posts legacy publication remains frozen. VI/EN public content, the shared-post-0 bookmark and public detail routes were verified. Original receipts were not replaced. Do not repeat the completed posts source CAS or reset it to Git0.

[Owner-dispatched protected backup](https://github.com/sugia279/hiens-nha/actions/runs/44031992148) succeeded. Offline decryption of that artifact remains unverified.

## Resume observations

- Execution-host access recovered. The source-aware, read-only hosted probe completed all 12 checks at 09:00 UTC. This verifies the bounded functional checks, not performance or owner intent.
- At 09:49 UTC, anonymous posts mine, pending and moderation reads each returned 401. Production controls were unchanged; no posts API publication event or writer activation occurred.
- The owner reported successful sign-in and language switching. A later live tab displayed a session-verification failure, and the owner reported only internal navigation. Rechecking that tab did not recover its session. Aggregate identity-endpoint logs showed an earlier 200 and a later 401; these alone do not identify the cause.
- Browser connection subsequently timed out. Fresh owner-session continuity and feature UI verification remain unresolved. Do not label this a diagnosed production Auth defect, successful continuity test or permission denial. Do not bypass the gate or broaden token persistence as an incidental change.

Before enabling the posts writer, complete legitimate fresh owner sign-in and same-tab feature/language navigation verification, investigating any reproduced failure. Recheck current controls, late inputs, backup freshness and privacy gates at activation time. Do not create production test content. Media and requests still require independent cutovers. **Phase5 is incomplete.**

This is a minimal public-state checkpoint, not a deployment. It excludes raw payload, account/session identifiers, backup fingerprints and recovery internals. Use the production main above and current DB control audit before the next mutation. Preserve accepted V1 limits and the failed staging performance attempt as previously recorded.
