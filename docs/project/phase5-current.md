# Phase 5 — current checkpoint, 2026-11-18

Production main is [97cd448](https://github.com/sugia279/hiens-nha/commit/97cd4489e6f1ed13fe8ecfb73d1e0341ad51ed36). [PR45](https://github.com/sugia279/hiens-nha/pull/45) dependency mitigation is merged and deployed. Its merge tree02955ed403db47c9bb64d1f8f01e8ddd6ffda84c exactly matches the final PR head tree.

## Dependency blocker resolved for the reviewed application mitigation

The explicitly named private picomatch fork uses the existing literalization path for repeated bodies containing *, ? or + before the recursion opt-out. Original +(*a) and raw +((a+)) reproduce bounded timeouts without the patch; patched variants and ordinary toolchain globs pass. Both old registry copies are replaced; unrelated locked package versions are unchanged. License, upstream file fingerprints, compatibility limits, private-fork maintenance responsibility and removal instructions are in docs/project/picomatch-hardening.md. This is not an upstream patched release. npm does not supply upstream advisory coverage for this private fork; zero audit findings alone are not the security evidence. No audit allowlist, severity/scope reduction, framework downgrade or CI policy change was made.

PR final head879976c154c709a7667149cae3d3b51812eab165 passed website44214000194 and Backend44214000649. Main [Pages44216276578](https://github.com/sugia279/hiens-nha/actions/runs/44216276578) and [Backend44216276679](https://github.com/sugia279/hiens-nha/actions/runs/44216276679) both completed successfully, including unchanged all-scope audit, native JWT/RPC/import/restore, full local load, browser and cleanup. Local validation included clean npm ci, full consumer resolution,374backend/unit tests,95smoke tests, enabled build, zero type errors/warnings (11vendor hints), verifier,23,023links/zero broken and budgets. Earlier PR44 failed audit run44210257483 remains historical evidence.

## Cutover state and next step

Last verified DB state (dependency work changed no DB controls):

| Feature | Source / epoch | API writer |
| --- | --- | --- |
| Comments | API / 1 | On |
| Posts | API / 1 | On |
| Media | Git / 0 | Off |
| Requests | Git / 0 | Off |

Posts writer was enabled by audited expected-state transition at00:42:25UTC November18; audit count4. Legacy posts stays frozen, receipt unchanged. Fresh owner OAuth/account VI/EN/Knowledge/editor continuity and authorized content loading were observed. The earlier reported navigation/session failure was not reproduced; cause remains undiagnosed. No production content/account was created. Actual Posts save/submit/moderation and member pending flow remain unverified until legitimate use. Do not repeat completed Posts transitions, reset it to Git0 or restart old OAuth troubleshooting without new evidence.

[PR44](https://github.com/sugia279/hiens-nha/pull/44) is draft, unmerged and not deployed. Its updated head1d8e2a241850f83c1a0e3e8eeca61295708aca6d merges the dependency remediation while preserving prior history. Fresh website44217901076 and Backend44217901106 CI must finish before marking ready or merging; its contracts/audit job has passed, while its full local load/browser job is still running at this checkpoint. Do not rerun these active checks merely because the old audit failed.

After exact-head CI success, continue the independent Media legacy freeze/deploy/drain/final live-input and receipt/public parity window, then audited source transition with writer off, paired frontend marker/deployment and privacy/owner UI verification before opening only Media writer. Both original Media receipts/public projections matched in pre-freeze read-only preparation; this is not final post-freeze parity. Preserve raw Issue17 share URL versus parser canonical URL. Requests follows independently.

The protected backup44031992148 was successful/unexpired and approximately18.1hours old at Posts activation. Recheck actual age, current controls and late inputs at the next activation; do not reuse that age calculation. Offline decryption/full hosted-config recovery remain unverified under accepted V1 limits. Source-aware hosted smoke12/12 and anonymous Posts private reads401 passed before activation. No synthetic production content/accounts, hosted load rerun, grants/billing/protection or automation changes are authorized by this checkpoint.

**Phase5 remains incomplete.** This checkpoint is documentation, not deployment or activation authority; current main and DB audit take precedence. Preserve original receipts, accepted V1 limits and the failed staging performance evidence unchanged.


## Latest Media execution — November18

PR44 full website44217901076/Backend44217901106 succeeded and merged normally at9668c41. Post-merge Pages44220125100 and Backend44220125081 succeeded. Live VI/EN Media maintenance and approved titles were verified. Complete archive history contains12completed runs, latest completion November13; fixed active-status inventory observed no active archive. Fresh complete live inventory has5community Issues/zero replies, exactly2Media markers, both approved parsed projections match; raw Issue17 share URL is unchanged. Read-only DB comparison matches both original receipts and both public projections. Anonymous Media mine/pending/admin/revision requests all returned401; approved owner and unexpired backup within24h verified.

Audited Media-only source transition completed at02:07:52UTC: API/epoch1/writer-off, control audit count5. The first attempted SQL failed before mutation due to a variable/alias name collision; corrected strict CAS then succeeded once. No import/receipt/author change. PR46 exact-head website44220389569/Backend44220389608 succeeded and merged at19b0d35d8ea453fd1e6b0e1f26b944db8a2be016. Its source marker changes only Media; favorite menu/bookmark anchors are retained as aliases to the current combined collection, tested VI/EN. Main Pages44221005086 succeeded; Backend44221005075 still runs at this checkpoint. Owner editor switched from an untouched default Posts draft to Media and remained verified with content loaded. Finish paired live VI/EN/public/owner checks and main CI before enabling only Media writer. Comments/PostsAPI1/on and RequestsGit0/off are unchanged; Requests legacy is still open. Phase5 incomplete. Do not repeat the completed Media source CAS.


## Latest Media writer activation — November18

Media source/frontend are API/epoch1; writer enabled by audited expected-state transition at02:12:28UTC, control audit count6. Main19b0d35 Pages44221005086 and Backend44221005075 both succeeded. Live API list/detail, query-preserving VI/EN, original titles, menu/bookmark anchors and owner Media editor (EN/VI, content loaded before and after refresh) were verified. Anonymous public reading and private denial passed; bounded current-source hosted smoke12/12 passed at02:11UTC with writer still off. Only the subsequent Media writer boolean changed. No content/import/receipt/grant was changed; real Media create/submit/moderation remains unverified until legitimate use. Do not repeat the completed Media transitions or return to stale Git. Comments/PostsAPI1/on, RequestsGit0/off unchanged. Requests freeze preparation follows independently; Phase5 remains incomplete.


## Latest Requests execution — November18

PR47 website44221704814/Backend44221704926 succeeded and merged at419889550f0ce6484e43ee12fd80763cb56ac240. Main Pages44222190739/Backend44222190695 succeeded. Live VI/EN Requests maintenance and old numeric detail14 were verified, with GitHub submit/update invitations removed and original approved scope/status/result retained. Complete archive history has12completed runs, latest November13, no active archive observed; complete stable-main inventory has5community Issues/zero replies and one Requests marker. Request14 parsed payload/approval/author/created/updated values match original Git. DB parity matches original receipt, scope/status/timestamps, mapping and one legacy event; zero Requests API events. Anonymous mine/all/admin reads401, public legacy14 returns original ID, approved/new/scope1/accepted-scope-null/result-empty. Sole approved owner unchanged; unexpired backup remains within24h.

Audited Requests-only source transition succeeded at02:23:17UTC: API/epoch1/writer-off, audit count7. PR48 website44222308113/Backend44222307900 succeeded and merged at e4abf75dbdc8f7c7228cc49ff5490803c4760169. Requests board/send menu anchors and numeric14 mapping are preserved. Observe paired main deployment/CI and verify live public board/detail/numeric route, private denial and actual owner continuity before enabling only Requests writer. Comments/Posts/Media remain API1/on. No import, receipt, author claim, synthetic content/account, grant or billing change. Phase5 incomplete; do not repeat completed Requests source CAS.
