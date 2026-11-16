# ADR 0009 — Shared application read admission

Date: 2026-11-16. Source implementation authorized by owner for PR35; not a production deployment or content cutover.

## Trigger and decision

Direct Data API SELECT and stable GET RPCs can bypass the Edge worker limit. Replace application reads with POST-only, volatile RPCs that charge a shared DB budget before accessing data. Revoke direct table SELECT from browser roles. Public wrappers remain SECURITY INVOKER; only private pinned-search-path functions access data. New comment projections explicitly enforce the existing entity/author/owner/public-root rules; publication/request authority remains in existing private functions. No service-role CRUD, forwarded-IP trust, owner change, public pending content or frontend route change.

Four fixed counter rows (global/anon/member/owner) bound retained storage regardless of traffic/users. Each admitted read or mutation/replay RPC locks global then caller class, using DB time and a one-second fixed window; limits default to 300/200/240/120 respectively. These are initial RPC-call budgets, not users, client request rates, capacity results or per-IP fairness. All workers and direct POST RPCs share them. Write wrappers also charge admission so idempotent replay cannot bypass the read budget. Missing/invalid budget configuration fails closed. Never accept budget or role claims from arguments/user metadata. Existing mutation quotas30/member and120/owner per minute are unchanged.

A transaction that later fails rolls back its admission charge. Thus these counters bound successful read transactions, not all attempted gateway invocations, unauthorized/error traffic, Auth or bandwidth. Fixed-window boundary bursts can reach twice the configured limit. Shared locks can add contention; test native concurrency and hosted latency before rollout. No threshold relaxation or hosted load rerun is authorized. Gateway/WAF volumetric protection and origin bypass remain a separate unresolved gate.

## Compatibility and deployment

HTTP GET routes and browser DTOs stay unchanged: Edge translates to POST RPC with caller JWT. Direct REST table SELECT and GET/HEAD RPC are deliberately denied; migrate such consumers to bounded RPCs. Internal import/shadow verification uses paginated anonymous RPC projections (replies included through the dedicated shadow pagination) instead of table SELECT. No raw export endpoint is added. Existing RLS stays enabled as defense in depth, not as justification to bypass explicit private-function checks.

Apply/review DB migration and Edge adapter together while all content writers remain disabled; old Edge would fail table reads after migration. Deploy updated Edge before marker changes, verify real anonymous/member/owner reads and direct bypass denials without fake production accounts/content. Reviewed migration/deployment is still pending. After API writes, never restore stale Git markers. Source-only rollback must keep the metered DB adapter; do not regrant unmetered reads as a rollback shortcut.

## Operations boundary

ChatGPT hourly checks and08:00 backup reminders are read-only. Backup remains protected/manual; do not silently convert a reminder to an automatic secret-bearing job or assert account quota approval. Daily backup/RPO24h/RTO1h remain proposals pending owner choice and measurement. Monitoring first execution has a read-only report; notification delivery on an actual actionable alert is unproven. No schedule/service/billing/production control changes are part of this source checkpoint.

PostgREST transaction-end settings must commit successful requests. The gate rejects client `Prefer: tx=rollback` before returning data and fails closed when an in-DB default-rollback configuration is visible. Verify the effective gateway config at rollout as environment-only settings may not be visible through SQL. No request headers are emitted or retained; only the rollback preference is inspected inside the DB function. See [PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html).
