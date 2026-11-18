# Phase 5 — current public state, 2026-11-18

Production main: [f1a29a7](https://github.com/sugia279/hiens-nha/commit/f1a29a7c08e36e93b44cacaa50557e6618c22fac). PR42/43 are merged; their post-merge Pages and Backend CI succeeded.

| Feature | Source / epoch | API writer |
| --- | --- | --- |
| Comments | API / 1 | On |
| Posts | API / 1 | On |
| Media | Git / 0 | Off |
| Requests | Git / 0 | Off |

Posts writer was enabled by an audited expected-state transition at00:42:25UTC on November18, preserving sourceAPI/epoch1. Control audit count is4. Legacy posts remains frozen; original import receipt is unchanged. Do not repeat either completed posts transition or reset it to Git0.

Fresh live owner OAuth succeeded. Account VI/EN, Knowledge and the Posts editor retained the verified owner session; the editor loaded its authorized content view and remained verified after refresh. The previous reported navigation/session failure was not reproduced in this observed flow; its cause remains undiagnosed. No production content or test account was created. Actual Posts save/submit/moderation and member pending flows remain unverified until legitimate use.

The bounded read-only hosted smoke passed12/12 at00:41UTC. Posts mine, pending and moderation anonymous requests each returned401. Complete live inventory showed the same five community issues, no replies or late Knowledge marker inputs. Original Posts receipt checksum matched, and the sole approved owner remained unchanged.

[Protected backup44031992148](https://github.com/sugia279/hiens-nha/actions/runs/44031992148) is successful and its artifact was unexpired, approximately18.1hours old at activation. Offline decryption and full hosted/config recovery remain unverified. Recheck freshness at each later activation.

Next: independent Media legacy freeze/deploy/drain/final parity, audited source transition with writer off, matching frontend marker/deployment and UI/privacy verification before opening its writer. Requests follows independently. Preserve the raw Media17 share URL versus parser canonical URL distinction and all original receipts. No synthetic production content, new accounts, hosted load rerun, grants/billing/protection or automation changes.

**Phase5 remains incomplete.** This minimal public-state checkpoint is not a deployment; use current main and DB audit before any mutation. Accepted V1 limits and the original failed staging performance evidence remain unchanged.
