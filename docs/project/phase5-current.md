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

Before enabling the posts writer, finish legitimate owner sign-in/feature UI verification and recheck current controls, late inputs, backup freshness and privacy gates. Do not create production test content. Media and requests still require independent cutovers. **Phase5 is incomplete.**

This is a minimal public-state summary; it contains no raw payload, account/session identifiers, backup fingerprints or recovery internals. This documentation checkpoint is not a deployment: use the production main above and current DB control audit before the next mutation. The execution host became unavailable, so the terminal smoke after deployment did not run; that is not evidence of a production outage.
