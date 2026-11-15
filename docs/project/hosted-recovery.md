# Hosted backup and recovery — encrypted GitHub artifact

Approved destination: GitHub Actions artifact, encrypted with age, retained **30 days**. Workflow: **Hosted encrypted recovery**, manual/main only. It reads Supabase `eqxlywwvchmzuyqtxexu` through its Singapore session pooler, restores the consistent snapshot into a disposable local DB, checks parity/permissions, and publishes ciphertext only. No content source/epoch or hosted role/control update.

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

   The proposed CA correction bundles the public **Supabase Root 2021 CA** linked from this project's Database Settings. Both Node and pg_dump must use that same certificate while retaining peer/hostname verification; no additional owner secret is needed. `recovery-ca.mjs` validates the single-certificate bundle, CA/self-signature, expiry and pinned DER SHA256807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa before contacting hosted data. pg_dump receives a temporary public CA copy only in its disposable local container. The CA expires2031-04-26; rotation requires reviewing the official dashboard download and updating bundle/pin together. Do not disable verification, change system-wide trust or supply an arbitrary CA in an environment variable.

   Exact GitHub form steps on [this environment](https://github.com/sugia279/hiens-nha/settings/environments/27372203243/edit): **Add environment secret** → Name `SUPABASE_DB_URL` → Value = full private URI → **Add secret**. Then **Add environment variable** → Name `BACKUP_AGE_RECIPIENT` → Value = the single public line from `age-keygen -y` → **Add variable**. Do not use repository-public Pages variables for the DB URI. In the Supabase project, use **Connect → Connection String → Method: Session pooler**; confirm port5432, database `postgres`, username `postgres.eqxlywwvchmzuyqtxexu` and Singapore host `aws-<number>-ap-southeast-1.pooler.supabase.com`. Replace the password placeholder with the real URL-encoded password locally; do not send the string to chat or use an online encoder. The source guard requires a classic X25519 `age1…` recipient, not an SSH or post-quantum recipient; use the key-generation command above without `-pq`.

3. Check account artifact usage/budget before dispatch; do not enable paid overage. Standard public-repository runners are used; no paid runner/add-on is created. The workflow requires a free-storage confirmation, caps each ciphertext at10MiB and reserves11MiB within a300MiB active-repository artifact cap. Account allowance is shared with other repositories/Packages: the repository check does not establish account-wide free capacity.

   On **GitHub personal Settings → Billing and licensing → Overview → Actions**, check included Actions storage. Under **Budgets and alerts**, confirm Actions/Packages paid overage remains blocked. The 2026-11-15 inspection showed0/0.5GB (rounded) and existing$0 blocked budgets; recheck near dispatch rather than treating this as permanent free capacity. Confirm configuration presence by names only; secret values need not be revealed. Missing configuration or failed quota guards stop the workflow before reading hosted data.

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

The owner approved PR #31; diagnostics merged atf6c8913 after all gates passed. [Second hosted run43732999756](https://github.com/sugia279/hiens-nha/actions/runs/43732999756) now identifies **HOSTED_TLS_UNTRUSTED_CHAIN** before dump. Configuration/reserve/local setup and cleanup passed; no artifact exists. The pinned official CA correction above is prepared, not yet deployed or hosted-verified. Preserve [second-attempt evidence](backend-hosted-recovery-2026-11-15-attempt2.json); do not request a password reset on the basis of this certificate failure.

This proves **hosted-source logical DB/Auth recovery into a local isolated target**, not a new hosted-project recovery or a guaranteed RPO/RTO. Provider secrets/callbacks, API/JWT configuration, SMTP, global role passwords, network settings and Storage object bytes require separate recovery procedures. Storage is disabled; existing assets remain in Git. A restored project may need re-authentication and owner-controlled OAuth/config deployment. Freeze restored writers before exposing it; reconcile every post-snapshot delta before enabling one canonical writer. Never return to stale Git JSON after API writes.

Manual dispatch plus30-day retention does **not** establish a daily RPO. No daily schedule is enabled by this change. The native source data snapshot can be consistent while sequence counters advance; imported sequences must remain at least above restored IDs before accepting writes. Native pg_dump/pg_restore preserve sequence state, but no zero-gap sequence guarantee is made. Keep at least one independently retained encrypted copy and its offline identity beyond artifact expiration if a longer recovery window is required.

Existing loopback import/restore commands remain unchanged. Local CI uses disposable fixtures only, a write after snapshot export, a native restore, a fresh synthetic age identity, decrypt/hash parity and tamper rejection. It uploads only numeric summaries. A successful local run does not imply a hosted backup exists; check the actual manual run, manifest and offline decrypt result.

Sources: [Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [database backup limits](https://supabase.com/docs/guides/platform/backups), [age installation/format](https://github.com/FiloSottile/age), [GitHub artifact billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
