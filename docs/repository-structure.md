# BRO repository structure

## Goal

Make it obvious which file owns each feature while keeping BRO a straightforward GitHub Pages application. Repository cleanup should reduce ambiguity without introducing a framework rewrite.

## Source-of-truth rules

1. One authoritative implementation per feature.
2. Git branches and pull requests replace copied test applications.
3. Do not preserve old implementations by adding `-fix`, `-v2`, `-rfp2`, date-stamped, or similar filenames.
4. Delete obsolete patch files once the working behavior has been folded into the authoritative file.
5. Keep Google Calendar integration isolated from CRM business logic: BRO appointments are CRM records; Google Apps Script is the Calendar bridge.
6. Keep Supabase schema/RLS changes in `sql/`, `supabase/`, and tests rather than embedding migration logic in UI files.

## Current ownership map

### Core / Today
- `index.html`
- `app.js`
- `today-enhancements.js`
- `today-messages.js`
- `task-handoff.js`
- `task-job-routing.js`

`app.js` is still large. New feature work should go into focused modules rather than making it larger. Existing areas should be extracted one capability at a time when that workflow has regression coverage or a repeatable acceptance test.

### Angi
- `angi-queue-import.js` — authoritative export reader/import compatibility layer
- `angi-inquiry-actions.js` — conversion/inquiry actions

Removed obsolete generations: `angi-import-contact-fix.js`, `angi-queue-import-rfp2.js`.

### Calendar
- `calendar-sync-client.js` — BRO ↔ Google Apps Script client
- `calendar-sync-recovery.js` — recovery behavior
- `calendar.js` — Calendar page behavior
- `calendar-google-view.js` — Google event view/matching behavior
- `calendar.html`

Removed obsolete generations: `calendar-v3.js`, `calendar-modern-links.js`, `calendar-modern-match.js`, `calendar-window-fix.js`, and the previous versioned Calendar client/page filenames.

### Contacts / Inquiries
Use the root `contacts-*`, `inquiry-*`, `contacts.js`, and `inquiry.js` modules. Inquiry number suggestions are owned by `inquiry-number-suggestions.js`.

### Sales
- `sales.html`
- `sales-board.js`
- `sales-type-colors.js`
- `sales-pipeline-cleanup.js`
- `sales-job-actions.js`
- `sales-missing-numbers.js`

The previous `sales-board-v2.js` / `sales-board-rfp2.js` generations are retired.

### Jobs / RFP
- `jobs.html`
- `jobs.js`
- `jobs-rfp.js`
- `jobs-payment-requests.js`
- `jobs-active-load.js`
- `jobs-stage.js`
- the other focused `jobs-*` modules
- `payment-request-print.html` / `payment-request-print.js`

The RFP code was renamed without changing its business logic. RFP cumulative calculations and printed output still require business acceptance tests against the legacy workbook before deeper refactoring.

## Release/version handling

`release.json` and `config.js` now use the same release value. `config.js` uses `BAUER_CONFIG.APP_VERSION` as the single cache key for dynamically loaded runtime modules. Key operational pages updated during this cleanup use the same release key for their direct dependencies.

Do not create feature-specific release names for future changes. Advance the canonical release value when a deployment needs cache invalidation.

## Test strategy

Use `tests/` for regression coverage. Priority tests remain:

- Angi export parsing, dedupe, archived-lead reappearance, and cadence assignment
- Appointment ↔ Google Calendar event identity and no-duplicate sync
- Inquiry → Job duplicate prevention
- Customer payment totals and balance due
- RFP multi-line and cumulative requisition math
- RLS/private Today data boundaries

`tests/repository-structure.test.cjs` prevents old compatibility filenames and release drift from creeping back into the runtime.

## Safe extraction strategy for `app.js`

Do not split `app.js` merely to make it smaller. Extract one business capability at a time when all of these are true:

1. Its DOM/API dependencies are understood.
2. Its current behavior has a regression test or a repeatable manual acceptance test.
3. The new module is loaded once from one place.
4. The old functions are removed from `app.js` in the same PR.

Angi import is the first completed example: tolerant export parsing now lives in `angi-queue-import.js` instead of a second runtime patch file. Future work should follow that same pattern.
