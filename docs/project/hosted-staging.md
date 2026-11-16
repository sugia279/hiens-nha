# Hosted staging — operator handoff 2026-11-16

Owner approved Free Singapore staging in Hien's Org. Project **hiens-nha-staging / hitsdflorbqvoltsytxe** is ACTIVE_HEALTHY, PostgreSQL17.11.0.019. Fresh project quote0/month, organization Free; no upgrade/paid branch. Seven reviewed migrations and API v1 deployed; deployment bundle67fea9c8de2503115fe2e01b28f38dd4d461eb3c1782e2b1da81da946571cf4b. Production remains eqxlywwvchmzuyqtxexu, unchanged Git/epoch0/writers off.

## What is actually verified

Initial anonymous checkpoint:12/12 staging smoke cases passed: four frozen states, public lists, anonymous owner/admin denial, rejected Origin and accepted preflight. First health7790ms, subsequent state678–1213ms; generator location unverified. No p95/capacity/cold-start cause claimed. At that initial checkpoint Auth users0 and no fixtures existed; the later Windows smoke below created and cleaned its disposable fixtures. [Numeric evidence](backend-staging-2026-11-16.json). Health advisors0, security23 INFO deny-by-default [RLS/no-policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), performance24 INFO [unindexed FKs](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)/9 INFO [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). No grants/policies/indexes relaxed to silence notices.

**Operator checkpoint:** [draft PR34](https://github.com/sugia279/hiens-nha/pull/34), exact head9e5dc212314a20ac78b635d485da55fdc0e5ee33. Site CI43818840018 and Backend43818839997 now final success:89 backend tests, full local12900-operation mixed workload/cleanup,5 browser tests and native snapshot/restore/crypto. [Permanent CI/quota evidence](backend-staging-ci-2026-11-16.json). This validates the shared runner in local CI, not hosted performance. Owner reports staging password set, Node26.13.0/Git2.56.0.windows.4 and npm ci completed at the separately checked-out source. Windows helper has now executed successfully for the ci profile; see the measured report below. Four earlier Data API reads passed (anon profiles/roles401, private schema406, empty comments200); those empty-table reads alone were not fixture-based visibility evidence.

## Windows ci smoke measured — 2026-11-16

[Preserved owner reports and independent checks](backend-staging-smoke-2026-11-16.json), source9e5dc212314a20ac78b635d485da55fdc0e5ee33, Node26.13.0/Windows. All1250 measured operations/65seconds passed with0 unexpected errors/drops. Phase p95ms228.53/203.61/195.31/340.59/179.35; worst observed operation-class p95 and measured max1291.18ms. Actual247 writes/1003 reads (19.76% writes); burst97 writes/500ops (19.4%) because3 busy write slots fell back to reads. This passes the existing >=18% write-mix bound; do not describe it as exactly20% in every phase. Some class samples are tiny (burst owner requests6); this is short smoke, not a sustained capacity claim.

Reported quota-boundary429/idempotent replay,48 public pointers,25 request scopes/history and anonymous pending denial passed; the429 gate used a seeded DB counter, not a distributed-IP abuse test. Sampled DB13times: max22 connections/2 active/0 waiting locks/probe56ms,0 sample errors. Windows host metrics describe the generator, not the hosted DB CPU/memory. Independent live query confirms Auth users/profiles/roles/comments/publications/requests all0; staging controls all api/epoch1/writes=false. Production separately rechecked Git/epoch0/writes=false.

Provider aggregate07:56–08:01UTC contains1471 function records,0>=500 and1 expected429; max execution3083ms over the wider setup/measured/reconciliation window. It is not correlated to a measured phase/request, and does not replace the client's measured max1291ms or establish a cold-start cause. Do not poll raw logs or infer complete ingestion from this sample.

The subsequent full attempt1 failed its generator/delivery gate and is retained below; do not repeat it automatically. The ci reports are preserved in the evidence above; fixed-name local report files will be overwritten by the full run. Keep the new full reports, including any failure/cleanup outcome. Record generator country/city and VPN use separately; location remains unverified in the script. Full14.5-minute duration, repeatability, A/B authority, provider resources and global ingress remain open. Phase5 is not complete.

## Full attempt1 retained failure — 2026-11-16

[Preserved original full reports and independent review](backend-staging-full-2026-11-16-attempt1.json). Same source9e5dc212314a20ac78b635d485da55fdc0e5ee33/Node26.13.0/Windows. Warm-up, steady10, steady20 and burst50 pass; recovery10 fails **575 dropped arrival slots and2 no-HTTP/transport outcomes**, not the2s latency budget. All observed phase/class p95 remain<2s; phase p95ms218.47/228.32/304.00/198.92/770.95. Only12325/12900 required operations launched,12323HTTP200; recovery achieved5.208 launched RPS against10 expected. Its observed p95 does not validate10RPS when575 requests never launched.

Recovery generator lag max58423.87ms and2 in-flight outcomes around58.5–58.6s suggest a client scheduling/process/OS interruption. They do not prove sleep, Node defect, a network or Supabase outage. A timer callback can be delayed by the event loop; a10s configured timeout is not proof against a suspended process. DB samples162, max26 connections/8active/0waiting locks, max DB probe579ms, no sample errors; these samples have incomplete time coverage and cannot exclude unsampled backend stalls. Provider aggregate08:35–08:52:30UTC has12542 function records,0>=500,1 expected429,max execution3615ms, with no per-request correlation/completeness guarantee. Health advisors0 at observation time.

Reconciliation and cleanup passed. Independent queries confirm staging users/profiles/roles/comments/publications/requests0 and api/epoch1/writers off; production remains Git/epoch0/writers off. PowerShell line16 is the intentional wrapper throw on the failed run exit status. No credential reset, ignored exception, threshold change or automatic repeat. Keep this failed observation permanently. Next: owner confirms possible sleep/hibernate/lid/process interruption and network context; choose a controlled follow-up after cause review. Full hosted gate, global ingress and production cutover remain open.

## Credentials entered directly on the owner's Windows machine

No credential goes into chat/Git or a command containing its literal value. The staging database password is independent from production. Project creation through the connector did not return that password. The agent has not reset it. If it is unknown, the owner must set/reset **only staging's** password at [staging Database Settings](https://supabase.com/dashboard/project/hitsdflorbqvoltsytxe/database/settings). Never open production's password-reset page for this step. Keep the raw new password locally; the helper percent-encodes it correctly.

1. Open [staging legacy API keys](https://supabase.com/dashboard/project/hitsdflorbqvoltsytxe/settings/api-keys/legacy). Copy the existing **service_role** key only when prompted. This temporary operator deliberately accepts the legacy JWT key so its project ref/role can be rejected before networking. Do not use anon, a production key, a JWT signing secret, or create/rotate any key. This admin credential is for creating/deleting staging Auth fixtures only; measured CRUD uses each caller's JWT and the publishable key.
2. From [staging API Keys](https://supabase.com/dashboard/project/hitsdflorbqvoltsytxe/settings/api-keys), copy **Publishable key** (`sb_publishable_...`). It is distinct from service_role.
3. Use a separate checkout of branch `feat/hosted-staging-gates` so existing working changes stay intact. Install the pinned npm dependencies there with `npm ci`. Run from its repository root, with Node>=22.23.4 and PowerShell7:

```powershell
pwsh -NoProfile -File .\scripts\backend\staging-load.ps1
```

The helper prompts for staging DB password and service_role key hidden, then publishable key. Paste **one value per prompt**. Process environment only; previous values restored in finally. No secret file or persistent OS environment variable is created. Do not enable a transcript, paste credentials into command text, or share full terminal/session files. If Windows blocks the script, report that error; do not weaken execution policy.

The default `ci` profile is a65-second smoke of10/20/50RPS, not the full gate. Run full only after its numeric report/cleanup is reviewed:

```powershell
pwsh -NoProfile -File .\scripts\backend\staging-load.ps1 -Full
```

Full is14.5minutes/12900 measured HTTP operations,80% reads/20% writes,24 synthetic members plus one disposable owner. Maximum150 in flight,10s HTTP/15s DB statement timeouts, no automatic retries. Setup/cleanup add bounded fixture operations outside timed phases. Staging rejects production/wrong project, foreign service-role ref, wrong host/port/TLS options and arbitrary CLI target/profile values before connecting. Certificate validation stays enabled with the pinned public CA; no insecure fallback.

The DB must have no Auth users/profiles/roles/comments/publications/requests before starting; partial cleanup or manually added users stops the runner for review. It creates only staging fixtures, confirms them without sending confirmation email, assigns only the synthetic staging owner, registers one discussion entity, and switches only staging controls for the workload. It shares local workload operations/quota/visibility/reconciliation code without weakening local loopback guards. First failed hosted phase stops further phases; failures remain in reports. Finally freezes staging writes and cleans this run's fixtures. A killed process can prevent finally: stop and report; an operator must freeze staging and review exact leftovers before retrying. Never broadly delete unknown users/data.

Only share ignored **staging-summary.json**, **staging-workload.json** and generator location/runtime with the operator after confirming they are numeric reports. **Never share load-sessions.json, stack.json, sessions.json, raw SQL/Auth errors or environment values.** Numeric reports do not mark global ingress or the complete hosted performance gate passed automatically. Operator must review actual per-class p95/errors/drops, pending separation, resource/quota/log aggregates, cleanup, real A/B authority and repeatability. The fixture password login excludes GitHub OAuth; production OAuth is separately verified and must remain unchanged. Windows generator location should be recorded as owner-reported Vietnam, not independently geolocated by the script.

The short Windows hosted ci run is now verified as above. It does not replace the full hosted-duration/ingress gates. Native local runtime verification of the shared-workload extraction passed separately in exact-head CI. Source merge and content cutover are separate decisions. Phase5 is not complete.


## Owner-accepted performance exception — 2026-11-16

Owner instructed proceeding on the hypothesis of network corruption. The failed attempt remains failed; no network root cause has been established, no2s threshold changed and no load repeated. This is a release-risk disposition allowing continued preparation, not replacement test evidence. See [readiness evidence](backend-cutover-readiness-2026-11-16.json) and [production review packet](production-cutover.md). Other authority/ingress/operations/freeze/delta gates remain explicit. Production is still Git0/writers off; Phase5 is not complete.
