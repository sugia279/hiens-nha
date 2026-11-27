# ADR0020 — Social identity controls and owner comment deletion

27 November 2026. Owner-requested follow-up to ADR0019, after PR64 production rollout. Candidate until the checkpoint records release evidence.

All modal social dialogs are centered in the viewport with bounded height and scrolling on narrow screens. Reaction pickers stay anchored to their post; they are not modal dialogs.

The existing authenticated owner may soft-delete a visitor's comment using the existing delete API and version check. This includes named/anonymous guests and verified visitors. Editing another author's text remains forbidden. Preserve the original author, revisions, moderation audit, writer/source/epoch gates, quotas and shared admission. Update only the preserved comment writer's delete authorization; do not add raw-table grants, impersonate authors or change role assignments. The UI asks for confirmation before deleting.

Public comment surfaces and Home offer an identity control after an identity exists. A guest may revise their own display name through the existing caller-JWT guest identity RPC; this updates the display name of that guest's existing interactions. Guests and verified visitors can explicitly sign out to use a new guest identity on their next interaction. Existing content is retained, while a discarded guest session cannot regain authorship by reusing its name. Google account switching uses the existing PKCE flow with Google's account chooser. Failed/canceled transitions retain the original session and interactions. Existing proof-based guest transfer and deduplication remain unchanged.

Reset/sign-out is disabled during a mutation or identity transition. The UI clears stale private selections/drafts on an actor change, disposes dialogs/listeners on navigation and never signs a visitor back in automatically. Owner logout remains available; guest names confer no authority.

The requested future URL is https://suduyhien.github.io/. That requires a GitHub account or organization named suduyhien and its user/organization Pages repository. The owner does not yet control such an account. This change does not rename sugia279, transfer repository ownership, alter the current base URL, deploy to another host or change OAuth callbacks. Prepare a separate reviewed hosting/redirect/Auth/session-scope plan after destination ownership is established.
