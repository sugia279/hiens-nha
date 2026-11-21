# Navigation/category verification — 20 November 2026

## Authorized database rollout

The owner subsequently authorized build, test, deployment and merge into main. The agent continues on `codex/verify-content-categories`, preserving the user's main commit. The following database rollout supersedes the read-only migration checkpoint below; frontend delivery is tracked by the resulting PR and Pages workflow, not inferred from DB success.

| Migration | Staging provider version | Production provider version |
| --- | --- | --- |
| `20261119160000_immediate_comments.sql` | `20261120030809` | `20261120030836` |
| `20261119170000_content_categories.sql` | `20261120030814` | `20261120030841` |

Both exact repository migrations were applied staging-first, verified, then applied to production. Before rollout, a newly added regression identified and corrected an owner-author edit branch that could restore a hidden/rejected comment without explicit moderation; the deployed migration and ADR0014 now require explicit moderation for every author, including the owner. The targeted migration/comments/category/admission suites passed 27 tests after that correction.

Post-rollout structural checks confirmed eight default categories, enabled private-table RLS, denied direct anonymous SELECT/authenticated INSERT, public invoker wrappers, anonymous read allowed/create denied and authenticated create granted. Rolled-back staging role checks also exercised public catalogue reads, anonymous execute denial and authenticated calls without an actor failing PT401. Actual Data API POST checks on both projects returned 200/eight labels for anonymous reads and 401 for anonymous create using the existing `Family` label; no test category was inserted. Those checks do not replace real-JWT mutation/visibility tests in disposable CI.

The existing comments' ID/status/version fingerprint stayed unchanged on both projects. Production retained four approved comments, five publications, one request and one owner; the rollout does not update those records. All four production features remain API/epoch1/writers enabled; staging retains writers disabled. No owner grants, source switches, Edge redeployments, imported rows, photo assets or Storage objects were changed. Neither migration remains pending on these targets.

Security advisors retained the existing informational deny-first RLS/no-policy findings (the new private category table adds one such informational finding) and production's pre-existing leaked-password-protection warning. No new security warning was introduced; Auth settings were not changed. See the provider's [RLS lint explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [password-protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Staging's unrelated `media_resources_layouts` migration was not replayed or removed.

## Frontend delivery and live follow-up

[PR59](https://github.com/sugia279/hiens-nha/pull/59) passed exact-head Linux CI: 259 unit tests, 159 backend tests, 97 smoke tests, native JWT/Storage/concurrency/import/recovery checks, the full 10/20/50 RPS load profile (zero failures/drops, cleanup passed), and 29 browser tests. It merged as `39404a4773e1165800f5ddaec7fcd26b813c96cb`; [Pages deployment](https://github.com/sugia279/hiens-nha/actions/runs/44677238013) succeeded. The deployed Graph VI/EN JS measured 598,774 bytes under the unchanged ceiling. These Linux results resolve the earlier local Windows test limitations as release evidence; they do not repair the Windows installation.

A public read-only Chrome smoke then exposed an intermittent locale-link race: after client navigation from an album to its upload form, the new static language link could be clicked before the page-load callback copied `?album=...`. The wrong URL reset the selected album. A subsequent slower check passed, confirming why ordinary waits could hide it. The follow-up prepares incoming language links with the destination query/hash during capture of `astro:before-swap`, before the old page scope is disposed or the new DOM becomes clickable. Initial loads still synchronize from the current URL. The handler remains scoped/disposable and does not change token storage, routes or upload rights. Unit coverage dispatches the swap while the old URL is still current and verifies disposal; the browser regression now follows an album into upload and switches locale with the selected album retained. No further DB migration is required.

## Initial local verification checkpoint

Continued from the user's commit `a5275f50379f328f376891c0b2839e0987ea9ed0`. The initial worktree was clean, with one checkout on main. Fetching origin confirmed that HEAD and origin/main matched. At this earlier checkpoint follow-up source changes were uncommitted and the user controlled commit/push. No production deployment, DB mutation, real submission or asset replacement had been performed at that time.

## Bundle correction

The committed `src/lib/i18n.ts` already permits the client build to remove the translation tables; the emitted JS contained neither the navigation-copy nor full UI-copy table probes. That change was preserved. Nevertheless, the clean baseline build exceeded the unchanged 600,000-byte route ceiling: Graph VI/EN each reached **601,330 bytes**, including lazy dependencies.

The follow-up moves gallery DOM behavior to the Photos entry and editable combobox behavior to the `CategoryPicker` entry. The global menu retains Enter/blur/Escape/error handling. All three controllers reuse the existing in-memory catalogue and release subscriptions/listeners before page swaps. Labels remain inert text and uploads keep the existing tag, permission and source/epoch contracts. A regression covers selected custom albums, duplicate refresh, disposal and original-language labels; the browser test now visits a custom album from Graph and switches VI/EN before checking upload/post pickers.

Final local fixture: maximum route JS **598,824 / 600,000 bytes** (Graph in both locales), total emitted CSS **87,819 / 100,000 bytes**. All **2,102** static budget/metadata checks passed. These are raw artifact measurements, not a browser Lighthouse performance score. The backend-enabled policy is per route; total emitted JS across separate routes is 760,053 bytes. No ceiling or dependency accounting was weakened.

## Completed checks

| Check | Local result |
| --- | --- |
| Astro check | 365 files, 0 errors, 0 warnings, 12 existing vendor hints |
| Content validation | 87 published entries |
| Related unit/backend regressions | 15 files, 70 tests passed: categories, localization, sidebar, photo upload, page lifecycle, route budgets, publications UI, social posts, comments, admission and device storage |
| Full unit/backend run | 410 passed, 4 failed, 3 skipped; 5 of 68 files failed, including one suite setup failure; see baseline limits below |
| Build including Pagefind | Passed with public loopback fixtures and the Windows permission workaround; 264 generated pages plus the existing static HTML file; Pagefind indexed 248 pages in VI/EN |
| Smoke | 11 files, 97 tests passed |
| Artifact verification | 26/26 passed |
| Links | 20,822 links checked in 265 HTML files, 0 broken |
| HTML validation | Exit 0, 0 errors; 4 existing Home VI/EN warnings for nested header/footer elements inside a header; these templates were not changed here |
| Edge typecheck | Passed through the installed Deno npm launcher |
| Chrome / Playwright | 3 tests passed: shared categories, restored-session/navigation/logout, menu/photo viewer/search lifecycle |

Chrome tests use mocked Auth/API, including category creation and draft submissions. They do not establish hosted OAuth/JWT/RLS/Storage authority. Docker's Linux engine was unavailable, so native local-stack integration and real-JWT/Storage browser suites were not run. No hosted fixtures were created.

## Baseline environment/dependency failures

The full suite was run on the clean user commit before any source edit: 406 passed, 7 failed, 3 skipped, with 6 failing files. The following failures already existed in that run; none is reported as a new category regression or silently skipped:

- Node **26.13.0** is installed; `.nvmrc` pins **22.23.4**. Node's experimental global Web Storage shadows happy-dom storage, breaking three `device-session` tests. Running test processes with `NODE_OPTIONS=--no-experimental-webstorage` restored all three without persisting credentials or changing source. The final full-suite counts above use that flag and include the new gallery regression.
- `legacy-features-freeze`: Windows denies the fixture's directory symlink. No archive worker, marker or test assertion was changed.
- `hosted-recovery`: Windows reports file mode 0666 where the POSIX private-file test requires 0600. This check remains failing; the security assertion was not weakened.
- `recovery-roles`: the test supplies a Unix executable shim and colon-delimited PATH, which does not run as intended on Windows.
- `recovery-ca`: OpenSSL was initially absent from PATH. Adding Git's OpenSSL exposed a separate fixture-certificate command failure; the complete suite remains unverified here.
- `picomatch-hardening`: the existing installed `anymatch/node_modules/picomatch` resolves to upstream `picomatch`, whereas the lockfile requires the reviewed local fork. This is installed-dependency drift, not a change to the lockfile or hardening code. A clean lockfile install and Linux CI rerun are still required before claiming all gates green.

Build initially failed before application verification because Astro telemetry tried to write outside the workspace. Set `ASTRO_TELEMETRY_DISABLED=1` for this local run. API source markers also require public backend build configuration: the successful build used the existing loopback fixture values from `scripts/backend-build-pilot.mjs`, targeting `dist` for the smoke checks. It is not a production-configured release artifact.

Pagefind then indexed successfully but panicked writing its outputs with Windows `PermissionDenied`/OS error 5 inside the sandbox. The same installed Pagefind binary and unchanged source completed outside the sandbox; the final full `npm run build` also passed with that permission. Git fetch needed the same permission boundary for `.git/FETCH_HEAD`. Chrome's loopback web server/browser tests completed outside the sandbox. No ACLs were broadened and no build or test check was bypassed.

## Hosted migration status — read only

Supabase migration histories were read on both production `eqxlywwvchmzuyqtxexu` and staging `hitsdflorbqvoltsytxe`. Both record the profile, cover-layout and social-post-attachments migrations (provider-assigned versions differ from repository filenames). Neither records the following required migrations:

1. `20261119160000_immediate_comments.sql` — ADR0014's immediate comments; verify on staging, then apply to production before rolling out this UI. Existing RPC signatures remain compatible; no Edge redeployment is needed for this migration.
2. `20261119170000_content_categories.sql` — ADR0015's shared catalogue/RPCs; verify on staging, then apply to production before rolling out the category client. No Edge redeployment is needed for this migration.

No migrations were applied. Staging additionally lists `media_resources_layouts` (provider version `20261119142837`), which is absent from this checkout and from production history; its provenance/scope needs separate reconciliation, not automatic replay or deletion during this work. The observed histories do not establish hosted tests for the two pending migrations. Existing application rows, writers, ownership and source/epoch controls were untouched.
