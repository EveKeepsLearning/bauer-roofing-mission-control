# BRO repository structure and cleanup plan

## Goal

Make it obvious which file owns each feature, while avoiding a risky framework rewrite. BRO remains a straightforward GitHub Pages application.

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

`app.js` is still large. New feature work should go into focused modules rather than making it larger. Existing areas should be extracted only when a workflow is already under active maintenance and can be regression-tested.

### Angi
- `angi-queue-import.js` — authoritative export reader/import UI compatibility
- `angi-inquiry-actions.js` — conversion/inquiry actions

The retired `angi-import-contact-fix.js` and `angi-queue-import-rfp2.js` patch generations are intentionally removed.

### Calendar
Keep:
- `calendar-sync-client-v2.js`
- `calendar-sync-recovery.js`
- `calendar-v4.js`
- `calendar-google-view.js`
- `calendar.html`

Retired old generations:
- `calendar-sync-client.js`
- `calendar-v3.js`
- `calendar-modern-links.js`
- `calendar-modern-match.js`
- `calendar-window-fix.js`

The active Calendar filenames should be renamed to non-versioned names only in a dedicated Calendar PR after the Google Apps Script flow has a regression checklist for create/update/delete/no-duplicate behavior.

### Contacts / Inquiries
Use the non-test root files only. Prefer extending the current `contacts-*`, `inquiry-*`, `contacts.js`, and `inquiry.js` modules instead of adding patch generations.

### Sales
`sales.html` currently loads the active sales modules. `sales-board-rfp2.js` is still an active compatibility-era filename and should be renamed only together with the HTML reference in a focused no-behavior-change PR.

### Jobs / RFP
`jobs.html` currently loads `jobs-rfp2.js` and the payment-request modules. Because RFP behavior is operational and still being validated against the legacy workbook, rename/consolidation should be done after the cumulative calculation and print acceptance tests are in place.

## Release/version handling

`release.json`, `config.js`, and individual HTML cache-busting query strings currently represent different generations. Do not add additional release identifiers. The target state is one canonical release value used by the runtime loader and release marker. Until that migration is complete, change cache-busting strings only when the underlying asset changes.

## Test strategy

Use `tests/` for regression coverage. Priority tests:

- Angi export parsing, dedupe, archived-lead reappearance, and cadence assignment
- Appointment ↔ Google Calendar event identity and no-duplicate sync
- Inquiry → Job duplicate prevention
- Customer payment totals and balance due
- RFP multi-line and cumulative requisition math
- RLS/private Today data boundaries

## Safe extraction strategy for `app.js`

Do not split `app.js` merely to make it smaller. Extract one business capability at a time when all of these are true:

1. Its DOM/API dependencies are understood.
2. Its current behavior has a regression test or a repeatable manual acceptance test.
3. The new module is loaded once from one place.
4. The old functions are removed from `app.js` in the same PR.

Angi import is the first example: its tolerant file-reading behavior now lives in `angi-queue-import.js` rather than another runtime patch file.
