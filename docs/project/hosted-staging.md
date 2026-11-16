# Hosted staging — operator handoff 2026-11-16

Owner approved Free Singapore staging in Hien's Org. Project **hiens-nha-staging / hitsdflorbqvoltsytxe** is ACTIVE_HEALTHY, PostgreSQL17.11.0.019. Fresh project quote0/month, organization Free; no upgrade/paid branch. Seven reviewed migrations and API v1 deployed; deployment bundle67fea9c8de2503115fe2e01b28f38dd4d461eb3c1782e2b1da81da946571cf4b. Production remains eqxlywwvchmzuyqtxexu, unchanged Git/epoch0/writers off.

## What is actually verified

Staging12/12 anonymous smoke cases passed: four frozen states, public lists, anonymous owner/admin denial, rejected Origin and accepted preflight. First health7790ms, subsequent state678–1213ms; generator location unverified. No p95/capacity/cold-start cause claimed. Auth users0; no synthetic fixtures/content created yet. [Numeric evidence](backend-staging-2026-11-16.json). Health advisors0, security23 INFO deny-by-default [RLS/no-policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), performance24 INFO [unindexed FKs](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)/9 INFO [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). No grants/policies/indexes relaxed to silence notices.

**Operator checkpoint:** [draft PR34](https://github.com/sugia279/hiens-nha/pull/34), exact head9e5dc212314a20ac78b635d485da55fdc0e5ee33. Site CI43818840018 and Backend43818839997 now final success:89 backend tests, full local12900-operation mixed workload/cleanup,5 browser tests and native snapshot/restore/crypto. [Permanent CI/quota evidence](backend-staging-ci-2026-11-16.json). This validates the shared runner in local CI, not hosted performance. Owner reports staging password set, Node26.13.0/Git2.56.0.windows.4 and npm ci completed at the separately checked-out source. Windows helper itself remains unexecuted until the owner runs the guarded ci profile. Four extra Data API reads passed (anon profiles/roles401, private schema406, empty comments200); no fixture-based pending-visibility claim.

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

No actual hosted mixed-load run is claimed until private staging credentials are entered directly on the owner's machine. Native local runtime verification of the shared-workload extraction passed in exact-head CI; it does not replace the hosted measurement. Source merge and content cutover are separate decisions. Phase5 is not complete.
