# ADR 0001 — Backend foundation, local only

Date: 2026-11-14. Accepted for Phase 0–1 by owner in this session.
Base: `main@f3efbf33bc3f4dd75421b77762a96ab8bf1d5736`.
Plan source: PR #19 (draft/open, unmerged), `docs/backend-api-db-plan@c05ef1967098646ae125e0927c64c4ea0328da0e`.

## Decision and boundary

Keep Astro/GitHub Pages, existing routes, Git/Issues archives and all business contracts. Add local Supabase PostgreSQL/Auth and TypeScript Edge foundation. No cloud provisioning, deployment, billing or production cutover. [backend-plan.md](../project/backend-plan.md) remains the roadmap, not a description of production.

Phase 1 includes migrations, deny-first grants/RLS, caller-scoped API, owner bootstrap, audit, memory-only browser auth, account/callback/admin shells and automated permission tests. Comments RPC/API is the permission exercise for the future pilot; no comment composer, legacy import or authoritative API writer on existing pages yet. Posts/media/requests/storage are deferred.

## Data and permission freeze for this slice

| Table | Identity / relationship / retention | Client access |
| --- | --- | --- |
| `profiles` | `auth.users.id` PK/FK; only UUID, no email or provider tokens | Own/owner read; no direct writes |
| `role_assignments` | User PK/FK, role `owner` only; no moderator assignment | Own role read; operator SQL bootstrap only |
| `content_entities` | UUID PK, unique stable `(collection, legacy_key)`; canonical route unique | Public registered entities read; operator registration only |
| `legacy_mappings` | `(source, key)` PK → entity FK | Operator only until import design |
| `comments` | UUID PK, entity/author FKs; optional parent same entity, one reply level; integer version; pending/approved/rejected/hidden; tombstone | Approved + own + owner read through RLS; writes only through RPC |
| `comment_revisions` | `(comment_id, version)` PK; immutable text/status/actor snapshot | Own/owner history; no public historical text |
| `audit_events` | UUID PK, actor/entity/version/action/time; no tokens or body | Owner read; transaction inserts only |
| `private.mutation_keys` | Actor + idempotency UUID PK; request JSON + comment FK | Private, no exposed schema/grants |
| `private.write_windows` | Actor/window PK; atomic mutation quota | Private |
| `private.backend_settings` | Singleton kill switch; comments writes disabled initially | Operator only |

Soft delete clears current body, leaves revisions for operator review. No automatic retention purge in Phase 1; deletion/erasure retention policy must be agreed before real personal data is imported. Auth user deletion is restricted when authored records exist; no accidental cascading content loss. Immutable audit/revision writes are not granted to browser roles. No pending body in public DTOs or request logs.

Member A may edit/delete A's comments only. Owner moderates others; does not rewrite their text. New member comment is pending; owner's own text may be approved immediately. Editing approved text makes it pending and removes public visibility atomically. A parent must be a visible, undeleted root on the same entity; replies are one level. An approved reply is public only while its root is public. Expected-version locks apply to every update/moderation/delete; same-key create replay returns current state, different payload with the same key is 409. DB quotas apply even through direct RPC. API CORS is not a permission boundary.

## Authentication

GitHub OAuth first; stable verified `auth.uid()` author identity and operator-assigned owner UUID. Never trust `user_metadata.role`, display name or request authorId. No password API. Browser session/refresh tokens and PKCE verifier stay in memory. OAuth uses a popup and same-origin callback/code handoff to the originating page; no tokens in localStorage/sessionStorage. Reload/navigation loses the session in this foundation. Multi-tab session persistence is deliberately deferred; each page signs in independently. Real OAuth, popup policies and refresh/revocation remain staging gates.

## Source and rollback

All current features remain `git`. Backend writes additionally require the DB kill switch (default false); setting public frontend flags alone cannot enable writes. Never enable backend comment writes against the same authoritative production discussion while Git archiving writes it. Local tests use isolated fixtures, not repository archives. Phase 2 must register stable entities using the existing page-context normalizer (VI/EN, encoded paths, trailing slash), import/shadow-read, freeze legacy writer, import final delta, then change exactly one feature's source. Registration never accepts arbitrary client URLs.

Before any DB writes: discard local DB/revert this branch safely. After real DB writes: maintenance/read-only → private export → reconcile delta/counts/versions → validated rollback; never fall back silently to stale JSON. No destructive down migration is included.

## Future request acceptance examples (unchanged)

- Public approval without acceptance: visible request remains submitted, not accepted.
- Member/collaborator attempts progress update: forbidden; only owner may transition.
- Completed without nonempty result: invalid.
- Concurrent scope edit vs complete using stale revision: one transaction conflicts; never complete an unaccepted scope.

## Exit gates and outstanding decisions

Phase 0: current/proposed split, inventory, schema/permission/API contracts, request examples and rollback documented. Phase 1: fresh migrations and negative permissions verified locally; full local Supabase and staging/OAuth gates must be reported separately. Cloud owner account, region, Free/Pro, provider app/callback and verified owner UUID are not selected/provisioned. No performance SLA: use the [load plan](../project/backend-load-test.md).
