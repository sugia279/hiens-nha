# Hosted release gates — operator checkpoint 2026-11-16

Current source-aware smoke — 2026-11-17: the operator probe now reads the version1 comments/feature source markers from this checkout and validates every source/epoch before making requests. It supports independent API cutovers and increased Git epochs from guarded recovery; a mismatched epoch/source still fails. Git must report writer=false; an API writer must be boolean and is recorded as observed metadata, because a matching API source can legitimately have its writer off during cutover or on after activation. **A smoke pass does not validate intended API writer activation:** use DB control audit and the separate owner/write gates for that decision (`apiWriterIntentVerified=false`). Invalid marker files fail before network activity. Run from the reviewed deployed-marker checkout; do not use an old all-Git checkout to assess a newer production state.

Verification at05:08:27UTC: [one bounded production smoke](backend-source-aware-smoke-2026-11-17.json) passed12/12 checks with commentsAPI1/on and the other three featuresGit0/off. Public lists return bounded DTOs; anonymous owner/admin401, unapproved Origin403 and allowed preflight204. First health7483ms means this is not a latency/capacity pass. No content payload/token/headers were logged, no writes/accounts/fixtures created and no load test rerun. The129backend tests, including5probe regressions, passed locally. Exact published-head CI is separate. Posts legacy freeze is deployed from PR41; final cutover remains blocked on protected fresh-backup preparation after the browser automatic-review usage failure. The owner has authorized the production-backup job, but no new run has been dispatched and no quota check has been attested; authorization does not establish those results.

Continuation after approved PR#34: main41ef15f; [new evidence](backend-postmerge-readiness-2026-11-16.json), [concrete remaining operations/ingress work](production-operations.md). Read-only audit found8 intentional public SELECT grants matching the foundation migration and no applicable observed role/database pre-request setting. This does not prove gateway configuration or public read-volume protection. Official pre-request counter examples exclude GET/HEAD, so that hook alone cannot close this gate. No grants, settings, proxy, paid service or production writer changed.

Main79efa47, Supabase eqxlywwvchmzuyqtxexu, Free/Singapore. Recovery#6 plus owner offline decrypt/hash and final post-merge CI are verified. Production content remains Git/epoch0/writers off. This packet does not authorize a content source switch.

## Measured read-only baseline

`node scripts/backend/hosted-readonly-probe.mjs --confirm-read-only`

Node22.23.4+; no installation, DB URL, key or access token required. Run from the branch containing this operator source. The fixed target is the approved production project's anonymous API. At most12 sequential GET/OPTIONS calls, at least1second apart,10s timeout,64KiB body bound, redirect refusal, first failure stops. It never creates accounts/content, sends mutation methods, retries, or prints response bodies/headers/request IDs. Functional success is not a performance/ingress gate pass.

[First hosted report](backend-hosted-smoke-2026-11-16.json):12/12 functional checks passed; all four source states remain Git0/writes=false, public post/media/request lists return page DTOs, anonymous /me and admin are401, unapproved Origin403, approved preflight204. CORS is a browser policy, not authentication or global abuse protection. No authenticated/A/B mutation, direct Data API abuse or rate-limit saturation test was performed. One separate initial health read preceded this12-call baseline.

Observed first health6763ms, state692–1533ms, public lists322–395ms. Generator location is **unverified**, not representative Vietnam; request order is not proof of a cold start. No p95, sustained capacity or <2s success claimed. The script can be run once from the owner's Windows computer to obtain an explicitly owner-local baseline; retain failures, don't rerun to conceal them. Only the numeric JSON output may be shared.

## Ingress and monitoring

Existing connectionBudget is per-worker160rps/burst320 and uses transport peer, not client forwarded headers. Gateway topology and distributed end-user fairness are not verified. Direct Data API bypass and public-read amplification remain open. Do not stress production or trust arbitrary X-Forwarded-For/CF headers to close this gate. No Redis, paid WAF, new proxy or broader DB grants added.

Supabase log queries now work against the unified logs table. Inspect attribute *names* first; never dump header values/IPs/URLs/query strings/tokens or full messages. The recorded window has12 function-edge records with response status fields,0>=500 and maximum execution_time_ms952. Log ingestion/coverage is incomplete/uncorrelated; it does not explain the client's6763ms or prove an error-free monitoring interval.

Manual dashboard review: project → Reports → API Gateway, Edge Functions, PostgREST and Database. Compare request/error/execution time and connection/resource graphs for the same window; include generator-side timing. For numeric read-only aggregation:

```sql
select count() as events,
  countIf(mapContains(log_attributes,'response.status_code')) as status_field_events,
  countIf(toUInt16OrZero(log_attributes['response.status_code'])>=500) as responses_5xx,
  max(toUInt64OrZero(log_attributes['execution_time_ms'])) as max_execution_ms
from logs where source='function_edge_logs'
```

Pass explicit ISO start/end to the Logs tool (<=24h); absence/delayed logs is not zero failures. Logs/Reports are observations, not automated alert delivery. Proposed thresholds remain 5xx/transport>1% for5m, p95>=2s for5m, quota>=80%, source mismatch and missing/stale backup against an agreed RPO. Alert destination, sampling cadence, retention and owner response still need a concrete decision; no outbound messages or recurring automation configured.

Advisors: health0; security23 INFO deny-by-default RLS/no-policy plus existing1 WARN Auth leaked-password protection disabled; performance24 INFO unindexed foreign keys/8 INFO unused indexes. No policy/index/Auth setting changed. Password Auth remains outside the GitHub-only login work; do not equate that warning with a DB-password failure. Review [password warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [FK indexing](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) against actual query plans before changing anything.

## Isolation proposal at the earlier checkpoint

At the earlier read-only checkpoint only production existed. Owner subsequently approved the zero-quoted scope and staging was provisioned: [current staging status and Windows operator steps](hosted-staging.md). Current mixed-load harness must never target production. Organization Hien's Org/ltbeenaimvtmhpcidznt remains Free; a fresh get_cost(project) quote was **0 per month** before creation. No paid branch or upgrade.

Approved scope: separate Free Singapore project **hiens-nha-staging** in Hien's Org, solely for reviewed migrations/API and disposable staging-only Auth/content fixtures, then cleanup. Never restore the production Auth dump into public staging or copy production credentials/users/owner grants there. Keep staging credentials separate and enter them directly on the owner's machine; no secrets in chat. Production stays Git0/writers off throughout. Supabase paid development branches and Pro upgrades are outside scope.

Next measurement stage: review the guarded shared-workload runner, run10/20/50RPS with writes only on staging after private credentials and native CI, record generator location/quota/resources/ingress and repeatability, including owner-local Vietnam measurement. Authentication/provider sign-in and write-authority gates remain distinct. This read-only probe is not that load runner.

Only after hosted gates pass: final legacy freeze/drain/live Issue reconciliation/delta, shadow parity, versioned source/epoch alignment and one API writer per feature, followed by actual hosted smoke and rollback checkpoint. No Phase5 completion inferred from backup or local load.

Sources: [Supabase Reports](https://supabase.com/docs/guides/observability/reports), [rate limiting example](https://supabase.com/docs/guides/functions/examples/rate-limiting). The Redis example is a provider pattern, not authorization to add a service.
