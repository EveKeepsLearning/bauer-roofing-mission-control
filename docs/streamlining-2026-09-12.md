# BRO workflow improvements — September 12, 2026

- Unified date/time entry in task, inquiry appointment, and appointment edit forms. Existing datetime controls remain; date-only contracts/payments/production dates remain date-only. Tasks support Any time that day and preserve null due_time. Task handoffs, edit, duplicate and repeating-task anchors retain their date/time semantics.
- New Inquiry sales lane loads current inquiries independently of appointments, with pagination. Appointment results remain a path to jobs; direct Create Job stays available. Old appointment cleanup uses the actual year, rather than parsing a yearless display label.
- Requested work appears early. Mailing/insurance and roof/home details are expandable. Existing populated inquiry details remain expanded. Separate first/last-name fields are optional. Contact name entry has a person/company selector and a preview.
- Restored editable quoted price in the full inquiry sheet, including validation and saving. Clarified requested deposits versus received payments.
- Job-number-shaped types display as Needs type review if no actual category is available. No historical type was guessed or overwritten. New jobs use Awarded and the old Needs Production Review label displays as Awarded.
- Removed Back to Operations links from Contacts, Sales Pipeline, and Open Jobs.
- Added Delete Inquiry with customer/number confirmation. A SECURITY INVOKER RPC honors existing RLS, locks and checks the inquiry revision, and blocks deletion with linked jobs, appointments, or estimate history. Customer, tasks/messages, and original MarketSharp archive are retained. No real inquiry was deleted during verification.

## Verification

`TZ=America/New_York node tests/streamline.test.cjs` checks timed and date-only tasks, timezone/DST appointment round trips, appointment-free pipeline stages, and complete pagination beyond 1,000 records.

`tests/delete-inquiry.sql` runs under authenticated Eve access inside a rolled-back transaction, confirming mistaken-inquiry removal, stale-edit protection, and linked-job protection. Temporary fixtures are not retained.

All changed JavaScript passed syntax checks. Supabase advisor found no warning on the new invoker function; existing unrelated advisories remain.
