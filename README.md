# Bauer Roofing Operations (BRO)

BRO is Bauer Roofing's internal operations CRM. The production site is served by GitHub Pages and uses Supabase for application data. Google Calendar integration is handled through Google Apps Script.

## Development rules

- `main` is production. Make changes on a branch and merge through a focused pull request.
- Do not create a second copy of the application for testing. Use branches and the existing `tests/` directory.
- Do not add new files named `*-fix.js`, `*-v2.js`, `*-rfp2.js`, or similar as a way to preserve an old implementation. Git already preserves history. Update the authoritative implementation instead.
- Keep one authoritative module per feature. If a temporary compatibility file is needed, remove it after callers are migrated.
- Preserve the integration boundaries: BRO/Supabase own CRM data; Google Apps Script is the Google Calendar bridge; OneDrive stores documents; QuickBooks remains the accounting system of record for actual subcontractor payments.
- Prefer small, reversible pull requests for operationally important workflows such as Angi import, Calendar sync, jobs, payments, and RFPs.

## Current authoritative runtime files

- Core application: `index.html`, `app.js`, `config.js`
- Angi import: `angi-queue-import.js`
- Shared lifecycle navigation: `lifecycle-navigation.js`
- Calendar client: `calendar-sync-client.js`
- Calendar page logic: `calendar.js`, `calendar-sync-recovery.js`, `calendar-google-view.js`
- Open Jobs: `jobs.html`, `jobs.js`, `jobs-rfp.js`, and the job feature modules loaded by `config.js` / `jobs.html`
- Sales Pipeline: `sales.html`, `sales-board.js`, and its supporting sales modules
- Subcontractors/RFP: `subcontractors.html`, `subcontractors.js`, `jobs-rfp.js`, `jobs-payment-requests.js`, and `payment-request-print.*`

## Release version

`config.js` and `release.json` use the same release identifier. Runtime-loaded scripts use `BAUER_CONFIG.APP_VERSION` as their cache key. When changing a directly referenced HTML asset, use the current release identifier rather than inventing a feature-specific version name.

## Testing

The repository's test home is `tests/`. Add focused regression tests there as BRO modules are simplified. Test copies of the entire application should not be committed.

See `docs/repository-structure.md` for the cleanup and module-ownership plan.
