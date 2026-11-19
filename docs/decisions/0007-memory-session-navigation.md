# ADR0007 — Same-tab navigation with memory-only Auth

Session lifetime superseded by [ADR0013](0013-device-session-social-composer.md) on 19 November 2026; page lifecycle/navigation boundaries remain.

Keep Astro static/GitHub Pages and the existing PKCE/Auth runtime. On backend-enabled documents use Astro ClientRouter so internal navigation preserves the JavaScript realm and its single in-memory session. Disabled builds retain native navigation. Reload, a new tab and navigation outside the site end local session continuity; no token/verifier is written to cookies, localStorage, sessionStorage or IndexedDB. OAuth callback is a fresh popup document.

Route changes must unmount controllers, subscriptions, timers and global listeners before swap, then mount each new document once. Late async initialization must observe cancellation. Photo uploader credentials and object URLs are cleared on unmount. No DOM or user content is persisted across routes. Recheck menu/VI–EN/back-forward, forms, photo viewer, search/graph, logout and API views in browser tests. API/DB continue to verify identity and permissions; retained browser state never grants authority.

This changes navigation/session lifecycle only: no source/epoch switch, schema, grants, paid service or hosted user/content creation. Browser-public build budgets remain unchanged. Real OAuth was verified previously; this navigation change needs local real-JWT browser rehearsal and hosted verification before claiming production continuity.

Reference: https://docs.astro.build/en/guides/view-transitions/#script-behavior-with-view-transitions
