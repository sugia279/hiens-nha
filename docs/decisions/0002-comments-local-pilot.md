# ADR 0002 — Phase 1 completion and Phase 2 local comments pilot

Accepted scope: owner requested continuing Phase 1 and Phase 2 on 2026-11-14. Continue PR #21 from `6182057`; main remains `f3efbf3`. No production merge/cutover or cloud/billing provisioning.

- Ship a local/staging-capable comments composer, one-level replies, author edit/delete, own pending visibility and owner moderation queue. No posts/media/requests rewrite.
- `config/comments-source.json` is the repository source marker. Default `git`, epoch 0 preserves existing writers/readers. A loopback-only `api-local` build override exercises the pilot against an isolated local DB. Hosted mode requires the explicit versioned marker; environment variables cannot silently switch a hosted Git feature to API.
- DB retains its write kill switch, plus source/epoch. A write requires API source in DB. Before eventual cutover: freeze archiver, final delta import, reconciliation, set DB/repository source+epoch together, then enable DB writes. Existing archive workflow name/deploy coupling stays intact; its guestbook adapter skips only comments when the marker changes to API.
- Canonical page normalization is shared by legacy guestbook, browser, API and migration. Register existing static routes by stable collection/key UUID; VI/EN and trailing slash share an entity. Resolve only operator-registered paths. No client registration or ownership by URL.
- Imported comments keep legacy attribution and provenance, with nullable auth author until provider identity is verified. Matching username/display name grants no ownership. SQL ownership checks use `IS DISTINCT FROM` to deny edits of unclaimed records. Import is operator-only, idempotent, transactional and refuses an API/writable DB; dry-run/reconciliation is mandatory. This does not perform production import or claim old authors.
- Browser auth stays memory-only; use one runtime per page and lazy-load Auth SDK on sign-in. Logout immediately removes private pending UI and stale fetches cannot restore it. Real GitHub OAuth still needs owner app/configuration. CI may use isolated local email fixtures solely to obtain real Auth-issued JWTs; production Auth config remains GitHub-first/email disabled.

## Measured bundle gate

The old 600,000-byte all-assets sum counted mutually exclusive routes together (graph, upload, admin/auth). Keep that aggregate check for the default Git/disabled backend build. For the enabled pilot additionally enforce the **same 600,000-byte ceiling per route**, including every reachable static AND dynamic JS import, and 100,000 bytes CSS. No budget number increases. Record total emitted bytes as inventory, not as a passing legacy aggregate. A Vite manifest supplies dependency edges; missing files or unknown dependency IDs fail. Tests must prove dynamic chunks count and shared chunks deduplicate. No page may evade the gate by lazy-loading a counted import. This is a documented measurement change, not proof of Lighthouse or network performance.

## Gates

Embedded SQL/HTTP/DOM tests locally; enabled/default build gates; Docker-backed Supabase integration and browser flow in non-deploying CI. Exercise anonymous/A/B/owner real JWT roles and direct Data API/RPC bypass, version/idempotency races, immediate pending/approval without rebuild, VI/EN identity, XSS-as-text and unavailable API. OAuth provider is separately unverified until a real app is configured. Targets 10–20 steady RPS, 50 burst and p95 <2s remain a load plan unless measured. No production source switch in this change.

The byte gate covers emitted Vite JS/CSS and the manifest's static/literal-dynamic edges, plus linked local script/style assets. Runtime-computed fetches outside that graph (for example Pagefind data/WASM or provider traffic), inline HTML/text and actual network timing require separate browser/load measurements. The gate is not a complete network-transfer budget or p95 benchmark.
