# Phase 5 V1 — production cutover closeout, 2026-11-18

**Phase5 V1 cutover is complete within the owner's approved free operating scope.** This closes the staged production rollout, not the unverified recovery/performance/real-member coverage listed below. Code baseline is main e4abf75dbdc8f7c7228cc49ff5490803c4760169 (PR48); the closeout commit updates documentation only.

## Production state

| Feature | Source / epoch | API writer | Legacy publication |
| --- | --- | --- | --- |
| Comments | API / 1 | On | Frozen |
| Posts | API / 1 | On | Frozen |
| Media | API / 1 | On | Frozen |
| Requests | API / 1 | On | Frozen |

Final operator observation at02:31:42UTC /09:31Vietnam: all four controls match the reviewed frontend, with8audit events (source transition and writer activation for each feature). One approved owner remains unchanged. Original imported receipts, unclaimed author identities and legacy entity mappings were preserved. No synthetic production content/account, import replay, new grant, billing/protection or automation change was made.

## Execution evidence

| Window | Reviewed PR | Successful main Pages / Backend |
| --- | --- | --- |
| Dependency mitigation | [45](https://github.com/sugia279/hiens-nha/pull/45) | [44216276578](https://github.com/sugia279/hiens-nha/actions/runs/44216276578) / [44216276679](https://github.com/sugia279/hiens-nha/actions/runs/44216276679) |
| Media legacy freeze | [44](https://github.com/sugia279/hiens-nha/pull/44) | [44220125100](https://github.com/sugia279/hiens-nha/actions/runs/44220125100) / [44220125081](https://github.com/sugia279/hiens-nha/actions/runs/44220125081) |
| Media API marker | [46](https://github.com/sugia279/hiens-nha/pull/46) | [44221005086](https://github.com/sugia279/hiens-nha/actions/runs/44221005086) / [44221005075](https://github.com/sugia279/hiens-nha/actions/runs/44221005075) |
| Requests legacy freeze | [47](https://github.com/sugia279/hiens-nha/pull/47) | [44222190739](https://github.com/sugia279/hiens-nha/actions/runs/44222190739) / [44222190695](https://github.com/sugia279/hiens-nha/actions/runs/44222190695) |
| Requests API marker | [48](https://github.com/sugia279/hiens-nha/pull/48) | [44222905399](https://github.com/sugia279/hiens-nha/actions/runs/44222905399) / [44222905292](https://github.com/sugia279/hiens-nha/actions/runs/44222905292) |

Each exact PR head also passed website and Backend CI before merge. Backend CI retained its unchanged all-scope audit, native JWT/direct-RPC/concurrency/import/restore checks, selected local load profile, browser and cleanup. PR45's security-sensitive change ran the full local load profile; no hosted load was rerun. [Private picomatch mitigation and maintenance limits](picomatch-hardening.md) remain explicit; this is not an upstream patched release.

Media source CAS completed02:07:52UTC, writer02:12:28UTC. Requests source CAS completed02:23:17UTC, writer02:29:43UTC. Both held writer off through paired frontend deployment and public/privacy/owner verification. Comments and Posts earlier completed transitions were not replayed.

## Data and live verification

Deployed VI/EN maintenance was observed before each remaining source switch. The complete archive history contained12completed runs, latest November13, and active-status inventories observed no admitted archive still running. Complete stable-main community inventories contained5Issues/zero replies,2Media markers and1Requests marker; final late-input checks found no delta requiring import. Original Media17 raw share URL was distinguished from its canonical parser URL.

Read-only DB parity matched both original Media receipts/public projections and Request14's original receipt, payload, status, result, timestamps, legacy snapshot event and mapping. Posts original receipt was retained. Actual comments login/create/reload/display had already been confirmed by the owner; final metadata retained3approved comments. Posts/Media API publication events and Requests API events were0 at the final observation: no production test submissions or status mutations were used as evidence.

Live checks covered Media list/detail and menu/bookmark aliases, Requests board/detail/numeric14 bridge, VI/EN, approved content and real owner session continuity. Owner Requests status controls were present, while anonymous reading exposed no owner controls. Anonymous Media mine/pending/admin/revisions and Requests mine/all/admin reads returned401; public legacy14 returned the approved original request with status new, scope1, no accepted scope and an empty result. Owner refresh after both writer activations remained verified with content loaded. No create/moderation/status button was used to manufacture a real-user test.

Current-source bounded hosted smoke passed12/12 for the paired Media and Requests deployments. The final all-writers-on smoke result is recorded in phase5-current.md. These are functional checks, not hosted performance, capacity or volumetric-ingress proof. Build checks retained all265HTML routes; API Requests build passed95smoke assertions,26verifier checks,23,035links/zero broken and existing budgets.

## Accepted V1 limits and operations

- The failed full staging attempt remains failed:575dropped arrivals/2transport outcomes, original2second threshold, root cause not proven. The owner accepted proceeding; this is not a passed performance gate or a network diagnosis.
- Shared admission limits application/DB work but provides no WAF/volumetric-traffic or per-user fairness guarantee; Auth/gateway and failed transactions can still consume quota.
- Protected encrypted [backup44031992148](https://github.com/sugia279/hiens-nha/actions/runs/44031992148) succeeded; its artifact was unexpired and approximately19.9hours old at final activation. It was created November17at06:35:42UTC. Recheck actual freshness and any newer backup at operation time. Backup remains owner-run with quota attestation/protected approval, at least daily and before data/schema work. The08:00reminder does not create a backup. RPO24h is a target, not a guarantee; this reviewed snapshot reaches24hours on November18at13:35Vietnam.
- Offline decryption of this newer artifact and complete hosted-project/config/OAuth/role-password recovery remain unverified; RTO1h is not demonstrated. Do not reuse an older artifact's offline attestation. Storage remains disabled; static assets stay in Git.
- The owner-disabled hourly error watch stays disabled; the daily backup-status reminder is retained. Alert delivery/detection and continuous on-call coverage are not proven. Observe failures and quota manually under the approved runbook.
- Actual hosted member-A/member-B pending/privacy/moderation flows and new Posts/Media/Requests save/submit/moderation/status changes remain unverified until legitimate use. Local native JWT/browser checks are separate evidence. Original imported authors are unclaimed; matching a GitHub name does not grant editing ownership.
- Existing tabs may retain a cached pre-cutover HTML page. Refresh and sign in again to load the current UI; ordinary same-tab navigation/VI–EN preserves the in-memory session after verification. Reload/new-tab does not provide persistent login. The earlier session-navigation report was not reproduced in the verified flows; its cause remains undiagnosed.

If backup is stale/missing or API authority/source checks fail, use the existing guarded maintenance control model and investigate. After any API write, never restore a stale Git snapshot. Freeze the selected writer, preserve a fresh encrypted recovery point, reconcile post-snapshot IDs/versions/revisions/events and verify parity before reopening. Do not reset epochs or repeat the completed source/writer CAS from historical checkpoint text.

See [production operations](production-operations.md), [recovery runbook](hosted-recovery.md), [V1 decision](phase5-release-decision.md), [Requests guide](requests.md) and [current checkpoint](phase5-current.md). Historical packets and failed runs remain in Git history and linked evidence; they are not overwritten as passes.
