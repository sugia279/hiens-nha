# Phase 5 V1 — current production checkpoint, 2026-11-18

**Phase5 V1 production cutover is complete within the approved operating scope.** [Closeout evidence and explicit limits](phase5-release-2026-11-18.md) distinguish rollout completion from unverified hosted recovery/performance/real-member coverage. Code baseline is main e4abf75dbdc8f7c7228cc49ff5490803c4760169 (PR48); this closeout changes documentation only.

| Feature | Source / epoch | API writer | Legacy publication |
| --- | --- | --- | --- |
| Comments | API / 1 | On | Frozen |
| Posts | API / 1 | On | Frozen |
| Media | API / 1 | On | Frozen |
| Requests | API / 1 | On | Frozen |

At02:31:42UTC /09:31Vietnam, all four controls matched current frontend markers;8control audit events (2per feature), one approved owner, original receipts and unclaimed authors preserved. Media writer activated02:12:28UTC; Requests writer02:29:43UTC after separate freeze/drain/final parity/source-with-writer-off/paired deploy/UI/privacy gates. No transitions were replayed. All exact-head PR44–48 and corresponding main Pages/Backend runs succeeded; see the closeout table. PR45's private picomatch mitigation retained the unchanged audit gate and full native/local-load/browser validation; it is not an upstream patched release.

Final bounded anonymous read-only hosted smoke at02:32UTC passed12/12, reporting all four API1 writers on. It does not establish performance/capacity/global ingress. Live Media list/detail/bookmarks and Requests board/detail/numeric14/VI–EN were verified. Actual owner session remained verified; Requests owner status controls appeared only for owner, and refreshed Requests/Media loaded after activation. Anonymous private reads returned401. Final metadata showed3approved comments, preserved Posts1/Media2/Requests1 import receipts,0Posts/Media API publication events and0Requests API events. The owner had previously confirmed a real comment login/create/reload/display. No synthetic production content/account or request status change was made.

[Protected backup44031992148](https://github.com/sugia279/hiens-nha/actions/runs/44031992148) was successful/unexpired and approximately19.9hours old at activation. Recheck actual age/newer artifacts before later operations. Manual daily backup/protected quota approval remains required; the08:00reminder is not a backup. New-artifact offline decrypt/full hosted-config recovery, RPO/RTO guarantees, volumetric ingress/fairness, alert delivery and actual hosted member pending/moderation/new content/status flows remain unverified as detailed in the approved V1 scope. Preserve the failed staging575dropped/2transport outcomes and2second threshold; no proven network diagnosis or hosted rerun. Hourly error watch stays owner-disabled; automation configuration is unchanged.

Next work is normal V1 use/monitoring and separately requested feature improvements, including Login/comment UX. Do not repeat source CAS, reset epochs, reopen legacy publication or return to stale Git after API writes. Recovery must freeze the selected writer and reconcile the private delta into a verified recovery source. Existing old tabs may retain cached HTML; refresh and sign in again for the current UI.

This public checkpoint excludes raw payload, account/session identifiers, backup fingerprints and recovery internals. Current main and the actual DB audit take precedence over historical candidate/Git0/incomplete text. Keep accepted V1 limits and original evidence unchanged.
