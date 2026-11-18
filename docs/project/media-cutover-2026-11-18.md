# Media cutover preparation — 2026-11-18

Source candidate after PR44: switch only the Media frontend marker to API/epoch1. Comments/Posts stay API1/on and Requests Git0/off. Merge only after the deployed Media freeze, complete admitted-job drain, final live/receipt/public parity, privacy/backup checks and an independently confirmed audited Media DB transition to API1/writer-off. This commit does not import, change original receipts or enable a writer. API markup preserves the favorite-music/favorite-videos/share-link menu/bookmark targets as aliases to the current combined Media collection; it never falls back to stale Git data. VI/EN smoke verifies each anchor exactly once.

This candidate freezes only the legacy Media submission/archive path. Posts remains frozen with frontend API/epoch1; comments remains API/epoch1; Requests stays open on Git/epoch0. The Media source marker and DB writer remain Git/epoch0/off. Approved media, original receipts, public players and VI/EN routes must be preserved.

Posts owner OAuth, VI/EN and editor continuity were observed on the deployed main before its audited writer activation on November18. This Media candidate is preparation, not evidence of a deployed freeze or completed cutover. At the Media window, verify the deployed maintenance notice in both languages, let admitted archive jobs drain, and compare the complete fresh live Issue/comment inventory with the original imported provenance and public projection.

Keep Issue17's raw Facebook share URL distinct from the parser's canonical video URL. Do not rewrite an original receipt or run archive/import merely to normalize that URL. Resolve any late delta explicitly before a source transition.

Recheck the protected backup's freshness, current controls and owner identity at activation. Use the existing audited expected-state transition to move only Media to an increased API epoch with its writer off; deploy the matching reviewed source marker and verify public/private separation, old links and owner UI before opening only the Media writer. Requests requires its own later window.

Validation: independent maintenance-marker/archive entrypoint tests passed (3); current-source builds and all95smoke assertions passed with Media open and then frozen. These local checks do not establish hosted drain, final parity or authority. Exact-head CI/deployment remains required.

No production fixtures, new accounts, grants, billing changes or hosted load runs are part of this candidate. Preserve accepted V1 limits and the failed staging performance evidence. Phase5 remains incomplete.
