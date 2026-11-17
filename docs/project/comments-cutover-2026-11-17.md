# Comments cutover window — 2026-11-17

Owner selected the documented free V1 scope and delegated continued Phase5 execution. This packet changes **comments only** to API/epoch1. The legacy maintenance marker stays true; posts/media/requests stay Git0. A frontend marker does not enable the DB writer.

## Fresh preflight

- Exact frozen main: `a5820785d6a01ae436d0fe837ac3f02f69b677c4` (PR38). Pages43894224497 and Backend43894224732 both completed successfully. Live VI/EN guestbook returned200 with maintenance and no Git submission form or CI fixture origin.
- 2026-11-17T00:55:28Z coherent nine-request inventory: stable main, active archive workflow415729576, zero queued/in_progress/waiting/pending/requested runs. Freeze was deployed on2026-11-16T15:15:38Z, before this observation. No older admitted archive remains active. The inventory helper deliberately does not declare drain itself; the deployed freeze plus this coherent observation establish the selected application's publication drain. GitHub edits remain possible.
- Fresh paginated all-state Issues/comments capture completed00:57:45Z against stable main:2guestbook issues,0replies. Exactly the same identities as the archived inputs; both semantic projections match. Only issue3 contextPath parser enrichment and issue5 updatedAt differ. Raw capture is private ignored scratch, not a published artifact. Preserve both import receipts and original provenance; no import SQL or timestamp rewrite.
- Hosted DB comparison:2comments/2matching receipt checksums and raw records/2matching typed semantic rows, both legacy authors unclaimed;1owner;0API comment write events. Production still fourGit0/writers=false at preflight.
- Protected recovery43881272412 succeeded after admission deployment. Ciphertext artifact14233685030,312891bytes, created2026-11-16T14:04:34Z, expires2026-12-16T14:04:33Z, not expired; approximately11hours old at preflight. No intervening application writes or reviewed content delta. Retain its original restore evidence and the separate older owner offline decryption attestation; this is not a new offline decryption claim.

## Guarded execution

1. Build/test the comments-only API1 marker and review exact-head CI. Keep all other markers/writers unchanged.
2. Apply the existing control-model semantics in one hosted transaction: lock comments settings, assert exact Git0/disabled expected state, require matching2receipts/2rows and no API writes, advance only comments to API1/disabled, and append previous/next/reason to private.control_events. Do not weaken the loopback-only CLI to accept hosted credentials.
3. Normal expected-head merge, observe successful Pages deployment and bounded runtime source/epoch/content checks. A source mismatch is a stop condition; no Git fallback.
4. Only after agreement, perform a second audited CAS from API1/disabled to API1/enabled. Verify state and public/private access without submitting synthetic production content. Keep legacy comments frozen.
5. Record actual user/owner activity only when observed. No real-content write/moderation is implied by successful read-only checks. Other feature cutovers remain separate gates.

## Late input and rollback

Re-snapshot live issues before activation and after deployment. Any substantive late create/edit/reply or approval removal blocks activation for explicit reconciliation; do not let a frozen archive silently overwrite receipts. Metadata-only differences above are reviewed and retained. GitHub itself is not locked by the application marker.

Before the first API write, any rollback requires a new increasing epoch, matching frontend deployment and audited expected-state control. After any API write, freeze the API writer and reconcile a fresh private delta/recovery snapshot before changing source; the stale Git snapshot cannot be restored as the active writer. Never decrement epoch, reopen legacy submission blindly, reset audit or fabricate an owner test comment.
