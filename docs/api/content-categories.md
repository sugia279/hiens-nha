# Content category RPC contract

Deployment recorded 20 November 2026: the category migration is applied to staging and production; see the [rollout record](../project/navigation-categories-verification-2026-11-20.md). The ordering requirement below still applies to additional targets.

Additive to the existing Edge HTTP API. No Edge redeployment is required. Apply `supabase/migrations/20261119170000_content_categories.sql` before client rollout. Call Supabase Data API `/rest/v1/rpc/` with the project's public API key and, for mutations, the verified caller's bearer token. Never use service-role credentials in the browser. POST only; successful calls participate in shared DB read admission. No direct table grants.

| RPC | JSON input | Authentication | Result |
| --- | --- | --- | --- |
| `content_categories_read` | `{}` | Anonymous or signed in | Array of `{id, scope, label, label_en}` |
| `content_category_create` | `{p_scope: "photos" / "media" / "posts", p_label: string}` | Signed in | One category with the same shape |

The read result contains at most 300 labels and no author IDs/draft data. Existing normalized labels or default English aliases return the existing row. Custom IDs are `cat-UUID`; labels use NFC normalization and collapsed whitespace, case-insensitive uniqueness within a scope, 1–40 characters and no control characters. Default IDs are `family/scenery/moments`, `video/music` and `projects/series/novels`. Names are plain text; original user language is preserved in VI and EN.

Creation is idempotent by scope/name, with a transactional 100-label cap per scope and 10 new labels per actor/minute across scopes. Anonymous execute/direct table access is denied by PostgreSQL. The private function also checks `auth.uid()` independently of grants. PT401 is unauthenticated; PT422 invalid input; PT429 catalogue/quota/admission limit. PostgREST may return 401/403 for denied execute grants before the private function runs. Clients keep unsaved text and surface errors; they do not insert optimistic fake labels.

The selected label is an ordinary existing `tags` entry (maximum 12 tags including the category). Posts also use the existing `category` label. Media retains the existing technical `music/video` category and safe provider URL validation. Photo metadata keeps the original three album IDs and optionally accepts `cat-UUID` with a required `albumLabel`, plus optional tags. No record rewrite, bulk publish or source/epoch change occurs. A Home attachment album tag does not create a public gallery asset.
