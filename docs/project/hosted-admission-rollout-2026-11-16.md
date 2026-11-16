# Hosted admission rollout packet — 2026-11-16

Prepared source: PR35 head b8d9773f5377a1f7a526dccc271ad52aa0679dc0; main41ef15f remains unchanged. This is preparation, not executed deployment or a completed release gate.

## Read-only preflight

| Observation | Production eqxlywwvchmzuyqtxexu | Staging hitsdflorbqvoltsytxe |
| --- | --- | --- |
| Controls | Four git/epoch0/writes=false | Four api/epoch1/writes=false |
| Existing migrations | Seven baseline migrations | Seven baseline migrations, provider-assigned version identifiers |
| Shared admission catalog | read_budgets/read_windows/admit_read absent | read_budgets/read_windows/admit_read absent |
| Private tables / without RLS | 22 / 0 | 22 / 0 |
| Public browser-role SELECT grants | 8 | 8 |
| Edge api | ACTIVE/version2 | ACTIVE/version2 |
| Edge bundle SHA256 | effdbd26f3dd07e81a2edc5d6acbe7a105aeb2997ba7f14c27135ca93c761b22 | 67fea9c8de2503115fe2e01b28f38dd4d461eb3c1782e2b1da81da946571cf4b |

Control/catalog observations span12:52:12–12:52:45 UTC (19:52 Vietnam). Only aggregate state/catalog metadata returned; no application rows, identities or credentials read. An initial catalog lookup used a non-applicable guessed table name; its absence is discarded. The corrected checks use the exact migration identifiers read_budgets/read_windows/admit_read and confirm absence.

Neither DB has a catalog pgrst.db_tx_end setting. **This does not prove effective gateway commit mode**: provider environment configuration may be invisible through SQL. Obtain provider-level configuration evidence or an approved runtime persistence check before closing transaction-charge persistence. No headers or provider secrets should be exported.

## Execution gates

1. Obtain exact PR35 merge approval after the automatic-review rejection, recheck unchanged head/checks/reviews/main, use the normal merge path and verify post-merge Pages/Backend. PR34 approval does not substitute. No ref/API/protection workaround.
2. Review staging migration20261116115121_shared_read_admission.sql and matching Edge bundle from the merged source. Confirm writers remain off and retain existing staging isolation. Do not replay baseline migrations using production version numbers: staging has equivalent baseline names with different migration IDs.
3. Plan a paired maintenance rollout: migration revokes table SELECT used by old Edge, while new Edge requires new RPCs. Either order alone creates a compatibility gap; record start/end and accept bounded read/owner-check unavailability explicitly before execution. This packet does not promise zero downtime.
4. Verify staging catalog/grants/RLS, bounded anonymous POST projections, rejected direct SELECT/GET/HEAD and transaction-preference overrides with the appropriate caller role. Record effective commit behavior. Empty staging cannot prove pending/owner negative authority. The earlier rejected A/B fixture rehearsal remains unexecuted; do not recreate fixtures or repeat load to close this gate.
5. Stop on mismatch; leave writers off. Do not restore old Edge alone against revoked grants, regrant unmetered reads, or mark the paired rollout passed from a function deployment response.
6. Only after reviewed staging/runtime evidence, separately authorize production maintenance deployment. Production must retain existing owner/content, Git/epoch0/writers=false until independent per-feature cutover gates. Do not change source markers with this migration.
7. Production freeze/drain/final snapshot/delta and single-writer activation remain a later window under production-cutover.md. Never roll back to stale Git after API writes.

## Owner decisions still open

- Gateway/volumetric risk: DB successful-transaction counters do not cap Auth, invalid/failed requests, gateway invocations or egress. Do not silently treat the staging performance exception as acceptance of this separate scope. No new paid proxy/WAF/service is authorized.
- Backup: daily protected recovery and RPO24h/RTO1h remain proposals;08:00 notice is not a backup. Owner must choose actual cadence and environment-approval availability. Retain protection, quota preflight and offline private identity. No workflow schedule/dispatch/approval installed by this packet.
- Alerting: one hourly read-only execution is observed, but actionable alert delivery is unverified. No simulated production fault or false operational notice is sent.
- Hosted authority/repeatability remain distinct from local CI; failed staging575drops/2transport outcomes and unchanged2s threshold are retained.

Phase5 remains incomplete. Source readiness, catalog preflight, actual hosted runtime, and production cutover are separate evidence.
