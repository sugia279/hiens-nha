# Hosted backup and recovery — encrypted GitHub artifact

Latest successful backup — 2026-11-27: owner-approved protected main [run46006487083](https://github.com/sugia279/hiens-nha/actions/runs/46006487083) completed before the guest social migrations. Artifact15202083298 was created13:30:29UTC and expires2026-12-27T13:30:28UTC. Account allowance and blocked paid-overage budgets were checked before dispatch. Read-only source snapshot, 65table/734row disposable local restore, checksum/schema/public-private/owner/frozen-restore checks, encryption, upload and cleanup all passed. Downloaded ZIP and ciphertext hashes match metadata/manifest; only ciphertext and the redacted manifest are present. Source commit fa52a19; the snapshot itself did not mutate hosted data. Owner offline decrypt of this artifact and a full hosted-project/config/Storage restore remain unverified; no older attestation is reused and no RPO/RTO guarantee is made. Subsequent guest migrations/Edge rollout are recorded in the [current checkpoint](guest-social-checkpoint-2026-11-26.md). [Fresh recovery evidence](backend-hosted-recovery-2026-11-27.json).

Latest freshness check — 2026-11-17: run43881272412/artifact14233685030 was present/unexpired and12.437hours old at02:30:48UTC before comments writer activation. It expires2026-12-16T14:04:33Z. Its original hosted-source→isolated-local restore remains separate from the older run43799403285 offline attestation; offline decrypt of the newer artifact and full hosted/config/RPO/RTO remain unverified under accepted V1 limits. No new backup dispatched. Recheck freshness and post-snapshot data before further cutovers/recovery. [Current evidence](backend-comments-writer-2026-11-17.json).

Approved destination: GitHub Actions artifact, encrypted with age, retained **30 days**. Workflow: **Hosted encrypted recovery**, manual/main only. It reads Supabase `eqxlywwvchmzuyqtxexu` through its Singapore session pooler, restores the consistent snapshot into a disposable local DB, checks parity/permissions, and publishes ciphertext only. No content source/epoch or hosted role/control update.

## Current owner verification — 2026-11-16

Owner Windows offline decryption and SHA256 comparison for run43799403285 are now verified by the supplied screenshot (both hashes valid64 hex characters, equality True). [Offline attestation](backend-offline-recovery-2026-11-16.json) records this separately; the artifact's original at-creation manifest is not rewritten. Post-merge Backend43799143951 and Pages43799143993 both succeeded for main79efa47. The complete hosted-source → isolated local restore → ciphertext → offline decrypt/hash rehearsal is verified. Earlier pending/proposed/unverified statements below are historical checkpoints. New hosted-project recovery, provider/config/Storage recovery, scheduling and later release/cutover gates remain separate.

## One-time owner configuration

Protection/configuration checkpoint (2026-11-15): Required reviewers is saved with `sugia279` as the only reviewer; Selected branches and tags allows exactly branch `main`, no tags. Reload verification passed. Prevent self-review remains off for the sole-owner workflow; the existing administrator-bypass default is unchanged. Owner has entered `SUPABASE_DB_URL` and the public `BACKUP_AGE_RECIPIENT` directly; presence and workflow preflight verified. Do not repeat owner bootstrap, add reviewers or reveal a secret to confirm it. The following steps remain the setup/replacement reference.

1. Generate an age identity **on your own computer, outside this repository**. Windows supports `winget install --id FiloSottile.age` (official age instructions below). In PowerShell:

   ```powershell
   $backupKeyDirectory = Join-Path $env:USERPROFILE 'HiensNhaBackupKeys'
   New-Item -ItemType Directory -Force $backupKeyDirectory | Out-Null
   $backupIdentityPath = Join-Path $backupKeyDirectory 'identity.agekey'
   if (Test-Path $backupIdentityPath) { throw 'Existing identity: do not overwrite it.' }
   age-keygen -o $backupIdentityPath
   age-keygen -y $backupIdentityPath
   ```

   Keep `identity.agekey` in secure offline/password-manager storage. The final command prints the **public recipient** beginning `age1`. Only that public recipient goes to GitHub. Never paste the private identity, DB password, dump or Auth tokens into chat, Issues, Git or browser-public configuration. Losing the private identity makes the encrypted backups unrecoverable.

2. Repository **Settings → Environments → production-backup**. Require review by `sugia279`; restrict deployment branches to `main`. Set:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Environment secret | `SUPABASE_DB_URL` | Full Session pooler connection string copied from this project's Supabase **Connect** screen; port5432, Singapore, username `postgres.eqxlywwvchmzuyqtxexu`, real DB password substituted/URL-encoded |
   | Environment variable | `BACKUP_AGE_RECIPIENT` | Public `age1…` recipient only |

   These values are not consumed by Pages or normal PR jobs. The workflow verifies TLS even if the supplied URI omits SSL options. Direct/transaction poolers, another project/region, extra URI options and private age identities are rejected. If the DB password is unavailable, the owner must recover/reset it directly in Supabase; the agent does not change it or inspect the resulting connection string. This is an **operator DB credential**, unrelated to members' GitHub sign-in.

   The deployed PR #32 CA correction bundles the public **Supabase Root 2021 CA** linked from this project's Database Settings. Both Node and pg_dump must use that same certificate while retaining peer/hostname verification; no additional owner secret is needed. `recovery-ca.mjs` validates the single-certificate bundle, CA/self-signature, expiry and pinned DER SHA256807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa before contacting hosted data. pg_dump receives a temporary public CA copy only in its disposable local container. The CA expires2031-04-26; rotation requires reviewing the official dashboard download and updating bundle/pin together. Do not disable verification, change system-wide trust or supply an arbitrary CA in an environment variable.

   Exact GitHub form steps on [this environment](https://github.com/sugia279/hiens-nha/settings/environments/27372203243/edit): **Add environment secret** → Name `SUPABASE_DB_URL` → Value = full private URI → **Add secret**. Then **Add environment variable** → Name `BACKUP_AGE_RECIPIENT` → Value = the single public line from `age-keygen -y` → **Add variable**. Do not use repository-public Pages variables for the DB URI. In the Supabase project, use **Connect → Connection String → Method: Session pooler**; confirm port5432, database `postgres`, username `postgres.eqxlywwvchmzuyqtxexu` and Singapore host `aws-<number>-ap-southeast-1.pooler.supabase.com`. Replace the password placeholder with the real URL-encoded password locally; do not send the string to chat or use an online encoder. The source guard requires a classic X25519 `age1…` recipient, not an SSH or post-quantum recipient; use the key-generation command above without `-pq`.

3. Check account artifact usage/budget before dispatch; do not enable paid overage. Standard public-repository runners are used; no paid runner/add-on is created. The workflow requires a free-storage confirmation, caps each ciphertext at10MiB and reserves11MiB within a300MiB active-repository artifact cap. Account allowance is shared with other repositories/Packages: the repository check does not establish account-wide free capacity.

   On **GitHub personal Settings → Billing and licensing → Overview → Actions**, check included Actions storage. Under **Budgets and alerts**, confirm Actions/Packages paid overage remains blocked. The 2026-11-15 inspection showed0/0.5GB (rounded) and existing$0 blocked budgets; recheck near dispatch rather than treating this as permanent free capacity. Confirm configuration presence by names only; secret values need not be revealed. Missing configuration or failed quota guards stop the workflow before reading hosted data.

## Historical fifth-attempt result and local correction — 2026-11-16

The owner corrected SUPABASE_DB_URL and verified a Windows verify-full SELECT1. [Hosted run#5/43793623781](https://github.com/sugia279/hiens-nha/actions/runs/43793623781) now completes authentication/read-only source snapshot/native dump, then fails **local-role-prerequisites /42501**. No completed local restore or encrypted artifact exists; cleanup passed. Do not request another credential change based on this local-stage failure. See [attempt5 evidence](backend-hosted-recovery-2026-11-16-attempt5.json).

The proposed correction performs missing owner/ACL role-name creation through the existing supabase_admin inside the designated loopback recovery container, matching the administrator already used by pg_restore. It copies no role capabilities/passwords/memberships and never alters an existing role: new names are NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOREPLICATION/NOBYPASSRLS. Hosted roles, runtime DB authority and the single application owner remain unchanged. Native CI must explicitly exercise missing names because its source and restore normally share cluster roles. This correction still needs CI/review/merge and a fresh hosted run; do not mistake it for verified recovery.

## Credential troubleshooting reference — 2026-11-16

PR #32 is merged; final post-merge Pages43764347833 and Backend43764347741 succeeded. [Hosted attempt4/run43784219380](https://github.com/sugia279/hiens-nha/actions/runs/43784219380), after owner-reported environment-secret correction, still failed source authentication with **28P01**. Configuration/pinned CA/quota/local setup and cleanup passed; artifact count0. See [numeric evidence](backend-hosted-recovery-2026-11-16-attempt4.json). All four production features remain Git/epoch0/writes=false. This supersedes the earlier proposed/deployment status below; offline recovery remains unverified.

To rebuild the private URI without putting a raw password in PowerShell history or displaying the URI, use PowerShell7 on the owner's Windows machine. Enter the **current database password in its original raw form**, not an API key, website password, already encoded value or literal placeholder. This helper only encodes that input once; it does not establish that the password is correct and does not change Supabase:

```powershell
$backupDbPassword = Read-Host 'Current DATABASE password (hidden)' -MaskInput
if ([string]::IsNullOrEmpty($backupDbPassword)) { throw 'Password is empty.' }
try {
    $backupDbUrl = 'postgresql://postgres.eqxlywwvchmzuyqtxexu:' + [Uri]::EscapeDataString($backupDbPassword) + '@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
    Set-Clipboard -Value $backupDbUrl
} finally {
    Remove-Variable backupDbPassword, backupDbUrl -ErrorAction SilentlyContinue
}
```

Go directly to the production-backup environment linked above → **Edit SUPABASE_DB_URL** → paste into **Value** → **Update secret**. Use the full URI; do not wrap it in quotes. After saving, run `Set-Clipboard -Value ''` and clear this URI from any enabled Windows clipboard history. Nothing from this process belongs in chat or a screenshot. Recover the current password from the owner's private records if uncertain; the agent does not reset it. A secret update is not authentication proof. Recheck quota and perform one fresh protected main run only after credential correction; do not repeatedly dispatch unchanged rejected credentials.

## First successful hosted recovery — 2026-11-16

PR#33 merged at79efa4764deeee02648e510fd8f4bcaffc0470a9 after explicit owner approval and final CI. [Run#6/43799403285](https://github.com/sugia279/hiens-nha/actions/runs/43799403285) succeeded: read-only hosted source → isolated restore/parity/permissions → age encryption → artifact retention30days.57tables/281rows verified; cleanup passed. Artifact `hiens-nha-encrypted-backup-43799403285-1` expires2026-12-16T03:41:05Z. See [manifest/evidence](backend-hosted-recovery-2026-11-16-attempt6.json). The local role correction above is deployed and hosted-source verified; earlier failure/proposed entries are historical. Owner offline decrypt/hash is still unverified. Content sources remain Git0/writers off; later release gates remain open.

## First real rehearsal

- Actions → **Hosted encrypted recovery** → Run workflow on **main**. Confirm the exact project ref and available artifact allowance. Approve the protected-environment job.
- Preflight validates configuration/recipient without contacting hosted DB. Snapshot source is a repeatable-read **read-only** transaction; pg_dump uses its exported snapshot, so admitted concurrent writes are consistently included/excluded. Supabase source remains unchanged.
- Native restore covers public/private/auth/supabase_migrations data, column/RLS/policy metadata, public comments/entities, private denial, owner binding and disabled writes on the restored copy. Missing object-owner/ACL role names may be created NOLOGIN/no elevated flags in the disposable cluster only. Existing cluster role capabilities/extensions are prerequisites; custom role passwords are not backed up.
- Only `application-auth.backup.age` and redacted `manifest.json` are uploaded, and only after verification. Raw dumps/private test identities never become artifacts. Failures remove newly created private/output paths; job cleanup also removes interrupted private scratch. The maximum dump bound is512MiB; ciphertext is capped10MiB and is not overwritten in place.
- Download the artifact ZIP to your computer. Extract it, decrypt locally with your private identity and compare the plaintext SHA256 to `manifest.dumpSha256`:

   ```powershell
   # Run in the extracted artifact folder; the identity stays outside the repo.
   age --decrypt -i $backupIdentityPath -o recovered.backup application-auth.backup.age
   Get-FileHash -Algorithm SHA256 recovered.backup
   ```

  Keep the decrypted dump private; it contains account/Auth data and potentially unpublished content. Share only whether the hash matches, or the checksum, never the dump/identity/password. The manifest intentionally reports `offlineDecryptionVerified:false` until this owner-side test is observed/reported. Synthetic CI age round trips alone do not prove the owner's offline key matches the first real artifact.

## Recovery limits and operations

First actual [hosted run43730402328](https://github.com/sugia279/hiens-nha/actions/runs/43730402328) failed at `source-transaction` with `HOSTED_RECOVERY_FAILED`; no dump/artifact was accepted, cleanup passed. This does not establish a password, DNS or TLS cause. A proposed diagnostic-only formatter distinguishes allowlisted connection/TLS errors and SQLSTATE without logging raw errors, URLs, tokens or private rows. It must pass review/CI and merge before a fresh main run. Never disable TLS checks, change credentials automatically, relax DB permissions or rerun unchanged code to hide the failure. Current numeric evidence is [retained separately](backend-hosted-recovery-2026-11-15-attempt1.json); offline decryption remains unverified until a real artifact exists and the owner tests it.

The owner approved PR #31; diagnostics merged atf6c8913 after all gates passed. [Second hosted run43732999756](https://github.com/sugia279/hiens-nha/actions/runs/43732999756) now identifies **HOSTED_TLS_UNTRUSTED_CHAIN** before dump. Configuration/reserve/local setup and cleanup passed; no artifact exists. The pinned official CA correction above was subsequently merged in PR #32 at cbcc4c1; both later runs passed TLS and reached authentication, but no successful dump/restore is yet verified. Preserve [second-attempt evidence](backend-hosted-recovery-2026-11-15-attempt2.json); do not request a password reset on the basis of this certificate failure.

This proves **hosted-source logical DB/Auth recovery into a local isolated target**, not a new hosted-project recovery or a guaranteed RPO/RTO. Provider secrets/callbacks, API/JWT configuration, SMTP, global role passwords, network settings and Storage object bytes require separate recovery procedures. Storage is disabled; existing assets remain in Git. A restored project may need re-authentication and owner-controlled OAuth/config deployment. Freeze restored writers before exposing it; reconcile every post-snapshot delta before enabling one canonical writer. Never return to stale Git JSON after API writes.

Manual dispatch plus30-day retention does **not** establish a daily RPO. No daily schedule is enabled by this change. The native source data snapshot can be consistent while sequence counters advance; imported sequences must remain at least above restored IDs before accepting writes. Native pg_dump/pg_restore preserve sequence state, but no zero-gap sequence guarantee is made. Keep at least one independently retained encrypted copy and its offline identity beyond artifact expiration if a longer recovery window is required.

Existing loopback import/restore commands remain unchanged. Local CI uses disposable fixtures only, a write after snapshot export, a native restore, a fresh synthetic age identity, decrypt/hash parity and tamper rejection. It uploads only numeric summaries. A successful local run does not imply a hosted backup exists; check the actual manual run, manifest and offline decrypt result.

Sources: [Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [database backup limits](https://supabase.com/docs/guides/platform/backups), [age installation/format](https://github.com/FiloSottile/age), [GitHub artifact billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
