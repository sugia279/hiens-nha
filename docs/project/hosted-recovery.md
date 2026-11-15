# Hosted backup and recovery — encrypted GitHub artifact

Approved destination: GitHub Actions artifact, encrypted with age, retained **30 days**. Workflow: **Hosted encrypted recovery**, manual/main only. It reads Supabase `eqxlywwvchmzuyqtxexu` through its Singapore session pooler, restores the consistent snapshot into a disposable local DB, checks parity/permissions, and publishes ciphertext only. No content source/epoch or hosted role/control update.

## One-time owner configuration

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

3. Check account artifact usage/budget before dispatch; do not enable paid overage. Standard public-repository runners are used; no paid runner/add-on is created. The workflow requires a free-storage confirmation, caps each ciphertext at10MiB and reserves11MiB within a300MiB active-repository artifact cap. Account allowance is shared with other repositories/Packages: the repository check does not establish account-wide free capacity.

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

This proves **hosted-source logical DB/Auth recovery into a local isolated target**, not a new hosted-project recovery or a guaranteed RPO/RTO. Provider secrets/callbacks, API/JWT configuration, SMTP, global role passwords, network settings and Storage object bytes require separate recovery procedures. Storage is disabled; existing assets remain in Git. A restored project may need re-authentication and owner-controlled OAuth/config deployment. Freeze restored writers before exposing it; reconcile every post-snapshot delta before enabling one canonical writer. Never return to stale Git JSON after API writes.

Manual dispatch plus30-day retention does **not** establish a daily RPO. No daily schedule is enabled by this change. The native source data snapshot can be consistent while sequence counters advance; imported sequences must remain at least above restored IDs before accepting writes. Native pg_dump/pg_restore preserve sequence state, but no zero-gap sequence guarantee is made. Keep at least one independently retained encrypted copy and its offline identity beyond artifact expiration if a longer recovery window is required.

Existing loopback import/restore commands remain unchanged. Local CI uses disposable fixtures only, a write after snapshot export, a native restore, a fresh synthetic age identity, decrypt/hash parity and tamper rejection. It uploads only numeric summaries. A successful local run does not imply a hosted backup exists; check the actual manual run, manifest and offline decrypt result.

Sources: [Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [database backup limits](https://supabase.com/docs/guides/platform/backups), [age installation/format](https://github.com/FiloSottile/age), [GitHub artifact billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
