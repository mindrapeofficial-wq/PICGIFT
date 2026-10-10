# Database beta optimization — 2026-10-10

Applied `beta_database_performance` to PicGift (`uimrvgrpenccijumyiek`).
Source: `supabase/migrations/20261010144500_beta_database_performance.sql`.
This is an incremental migration for the existing PicGift schema, not a bootstrap.

The seven affected tables had 0–11 live rows and were each at most 81,920 bytes
before migration. A transaction with a 3-second lock timeout and 30-second statement
timeout added seven foreign-key indexes and altered only the expressions of the
two existing content-report policies. Roles and commands remain unchanged.

## Validation

- All seven new indexes are valid and ready.
- Supabase performance advisors no longer report `unindexed_foreign_keys` or
  `auth_rls_initplan` (checked at 14:35:42 UTC).
- `tests/database-report-ownership.sql` passed against the real database both
  before and after migration. As `authenticated`, the owner inserted and read a
  report; a second user could neither read it, report the owner's photo, nor
  impersonate the owner. The transaction rolled back; report count remained zero.
- The test requires two users with photo jobs and an unreported photo. It does
  not create users or return private IDs. There were no custom report triggers.
- The advisor retains informational unused-index findings, including newly
  created indexes. With a tiny beta dataset this does not justify removing them.

No throughput or latency improvement is claimed from this small dataset. These
changes address query structure and indexing ahead of growth, not a load test.

## Remaining beta checks

Internal tables with RLS and no client policy remain inaccessible by default.
Leaked-password protection remains disabled in the security advisor; this change
does not change authentication configuration. Organization capacity, real-device
installation, Google Play approval, and a license-test purchase followed by photo
delivery remain separate checks. Purchases remain disabled. No new AAB is needed
for this database-only change.

References: [RLS performance](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations),
[foreign-key indexing](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
