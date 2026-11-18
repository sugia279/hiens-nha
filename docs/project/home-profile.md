# Home profile editor — 2026-11-19

Home removes the large repeated name and places the two introduction lines beside the overlapping owner avatar below the inset banner. Header search, HN logo and the Home writing strip remain. A hidden accessible H1 retains the page heading.

Verified owners see **Sửa ảnh và lời dẫn** at the lower-right of the cover. The modal supports 1–4 cover images, avatar, both VI/EN headline and introduction, and three frame styles: rounded, square mosaic and white photo borders. Use existing gallery images via the suggestion list or paste HTTPS image URLs. New local-file uploads are not included and Storage remains unchanged. The dialog previews changes without changing the live page; Cancel/Escape discard the form. Save publishes the complete profile to the database and applies it to the banner and composer avatar. Text is inserted with textContent; image URLs reject executable schemes and credentials.

`private.home_profile` is a singleton with versioned compare-and-swap writes. `private.home_profile_audit` retains operator recovery history. Both have RLS enabled and no direct browser table privileges. The public invoker wrappers call narrow private definer functions with empty search_path; reads expose only public settings, writes require the existing owner role and exact expected version. No new owner/member grants or feature source/epoch changes.

The frontend calls the project’s Data API directly (same configured Supabase project, publishable key and current access token):

- `POST /rest/v1/rpc/home_profile_read` with `{}` returns `{version, value}`. `value: null` means use shipped defaults.
- `POST /rest/v1/rpc/home_profile_save` with `{p_value, p_expected_version}` returns the next snapshot. Requires owner. HTTP409 means reload before saving; the dialog keeps the unsaved input.
- Value keys: `images` (1–4 safe URLs), `avatarUrl`, `frame` (`rounded|square|polaroid`), `leadVi`, `leadEn` (1–160 chars), `introVi`, `introEn` (1–600 chars). Unknown keys are rejected. No credentials, private drafts or image bytes belong in this record.

The initial migration adds only empty configuration/history, preserving current fallback content. Apply the reviewed migration to staging, then production before deploying frontend. Schema-wide public/private recovery snapshots automatically include these tables. Revert the frontend to use shipped defaults if necessary; keep audit/history for recovery rather than deleting it.

The Home sign-in action now invokes the existing PKCE GitHub popup from the current page. The parent URL remains unchanged; API /me still verifies the user/owner. No account navigation or session-persistence changes are part of this delivery.

Verification includes PGlite permission/validation/version/audit tests, client image validation, and a disposable local-browser test for in-place login, dialog cancellation, save and public reload persistence. Never create test profile settings on hosted production.
