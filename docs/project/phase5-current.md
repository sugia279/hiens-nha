# Phase 5 — current public state, 2026-11-18

Production main remains [f1a29a7](https://github.com/sugia279/hiens-nha/commit/f1a29a7c08e36e93b44cacaa50557e6618c22fac). PR42/43 are merged; their post-merge Pages and Backend CI succeeded.

| Feature | Source / epoch | API writer |
| --- | --- | --- |
| Comments | API / 1 | On |
| Posts | API / 1 | On |
| Media | Git / 0 | Off |
| Requests | Git / 0 | Off |

Posts writer was enabled by an audited expected-state transition at00:42:25UTC on November18, preserving sourceAPI/epoch1. Control audit count is4. Legacy posts remains frozen; original import receipt is unchanged. Do not repeat completed Posts transitions or reset it to Git0. Media/Requests legacy remains open: PR44 is not deployed.

Fresh live owner OAuth succeeded. Account VI/EN, Knowledge and the Posts editor retained the verified owner session; the authorized editor loaded and remained verified after refresh following writer activation. The previous navigation/session report was not reproduced in this observed flow; its cause remains undiagnosed. Do not restart the same OAuth troubleshooting loop from an older checkpoint. No production content or account was created. Actual Posts save/submit/moderation and member pending flows remain unverified until legitimate use.

The bounded read-only hosted smoke passed12/12 at00:41UTC. Posts mine, pending and moderation anonymous requests each returned401. Complete live inventory showed the same five community issues, no replies or late Knowledge marker inputs. Original Posts receipt checksum and the sole approved owner matched.

[Protected backup44031992148](https://github.com/sugia279/hiens-nha/actions/runs/44031992148) succeeded; its artifact was unexpired and approximately18.1hours old at activation. Offline decryption/full hosted/config recovery remain unverified. Recheck freshness at any later activation; do not reuse this age calculation.

## Current blocker and prepared Media change

[PR44](https://github.com/sugia279/hiens-nha/pull/44), head295063b3f584f7c52927543ae79757cc36c5f4e0, is draft and unmerged. It prepares only legacy Media freeze. Current-source builds and95smoke assertions each passed with Media open/frozen;3maintenance/archive-entrypoint tests passed. Read-only preflight matched both original Media receipts and both public projections, with zero Media API events. This is not final post-freeze parity/drain.

PR44 website CI44210257514 succeeded. Backend run44210257483 contracts job134486494275 failed the unchanged all-scope npm audit gate on [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), picomatch ReDoS. The advisory reviewed November17 lists versions through4.0.7 affected and no patched version; the npm registry reports4.0.7 latest at this observation. Fourteen dependency findings descend from that one advisory. The separate local Supabase/browser job was still running at this checkpoint; its result cannot undo the failed contracts gate. No audit gate, dependency, workflow or protection was changed to bypass the finding.

Resolve the dependency advisory before marking PR44 ready or merging it. Do not apply a blanket npm audit fix --force downgrade or silently waive the finding. Then verify exact-head CI, Media deployed freeze/drain/final raw and public parity, backup freshness, private denial and owner state; use an audited Media source transition with writer off followed by a matching reviewed frontend deployment and UI verification before opening its writer. Preserve the raw Media17 share URL versus canonical parser URL distinction and original receipts. Requests follows independently.

**Phase5 remains incomplete.** This minimal public-state checkpoint is not a deployment; use current main and DB audit before mutations. Accepted V1 limits and the failed staging performance evidence remain unchanged. No synthetic production content/accounts, hosted load rerun, grants/billing/protection or automation changes.
