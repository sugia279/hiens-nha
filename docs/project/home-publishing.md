# Home publishing — first delivery

Home reuses the existing publication editor: verified owners can save a private draft, preview the safe Markdown subset, then use **Đăng bài / Publish post**. Publishing saves the current payload, submits the exact revision and invokes existing owner-only moderation with the returned version/revision. Each step stops on failure or identity change. An approved unchanged revision is not submitted twice; retry keys for submit/approval are retained for ambiguous network responses.

The composer is hidden from guests/members and client mutations are guarded by the verified owner role. The existing API/DB owner requirement still authorizes approval/publication; this PR does **not** revoke members’ draft creation on other existing routes. Closing those global legacy submission flows is a separate backend change in Phase 6B, as recorded in the plan.

Home lists only published posts authored by the configured owner UUID (`src/config/home-feed.ts`, verified from production role assignments). This UUID is public display configuration, not an authorization credential. Public pagination uses the existing cursor; a page containing only excluded legacy authors can be empty but retains More if another page exists. The reader link opens the existing post discussion. Old unclaimed imports are not reassigned. Owner changes require updating this display configuration.

This delivery supports text/Markdown posts and the existing media-link editor. Uploading photos/video attachments into a post and automatic tag navigation remain Phase 6C/6D. It does not execute arbitrary HTML/MDX or create a Storage bucket.

Verification: unit regressions cover member composer exclusion, save → submit → approve version binding and owner-only feed filtering. Existing backend tests cover JWT/DB owner moderation. No synthetic content is posted on production.
