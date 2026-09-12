# BRO contact → inquiry → job walkthrough

Reviewed September 12, 2026 in the live interface, signed in as Eve, using a fictional contact named **BRO TEST Lifecycle**.

## Result

Created a contact, created inquiry TEST-LIFECYCLE-0912, and created a linked repair job. Followed the job's Contact and Inquiry links back to the source records. Repeated job creation after improvements and verified the saved data.

The final sample inquiry and job are archived, with zero active sample inquiries or jobs. The initial discarded test job was removed. No appointments, real contact details, payments, invoices, document links, or customer communications were created. The appointment form was inspected but its live scheduling/sync path was deliberately not submitted.

## Fixed during this walkthrough

| Finding | Change | Verification |
|---|---|---|
| Inquiry had no obvious route to a job unless the user knew sales/appointment shortcuts. | Added visible Create Job on the inquiry. Existing linked jobs show Open Job. Unsaved inquiry edits must be saved first. | Used the button in the live browser to create the sample job. |
| New-contact inquiries defaulted to Repeat Business. | Default is Choose; source must be explicitly selected. | Reopened the live inquiry form and checked the new prompt. |
| Secondary phone details did not carry into a new inquiry. | Copy secondary phone and its label from the linked contact. | Reviewed the actual insert payload change; no real phone numbers used in testing. |
| Large advanced-search form dominated Contacts. | Quick Find is expandable; quick search stays visible. Refined modal borders and backdrop. | Inspected live contact layout and screenshot. |
| Date-only values displayed one day early. | Parse calendar dates without a UTC day shift and display month, day, and year. | Eastern-time and daylight-saving-date checks; verified live contact dates. |
| Work requested was lost between inquiry and job. | Prefill a reviewable Work description / production notes field from inquiry description and notes. | Live second pass plus database verification of saved production notes. |
| Empty money fields became zero; invalid amounts could silently become missing. | Preserve blank as unknown; reject invalid/negative amounts and deposits above the contract total. | Money parsing checks and live job saved with deposit_amount null. |
| A failure to mark the inquiry Sold after creating a job was ignored. | Display a specific partial-success error with an Open created job link. | Source review; no production failure deliberately induced. |

## What worked well

- Saving a contact automatically opened its detail card.
- Contact address populated the inquiry's job-site address.
- Inquiry type selected the work category automatically.
- Appointment scheduling was optional after creating an inquiry.
- Job handoff populated customer, inquiry number, address, job type, salesperson, and default No for insurance.
- Job creation marked the linked inquiry Sold.
- Job detail offered direct Contact and Inquiry links and separate payment/document actions.

## Remaining improvements, in priority order

1. **Make unscheduled inquiries visible in the sales workflow.** The sample could not be found in Sales Pipeline before an appointment; the page describes itself as a cleanup view. Consider a New Inquiry / Awaiting Appointment lane and a clear route to estimate tracking.
2. **Shorten the inquiry page.** Move Work Requested near the top. Make roof/home, mailing, insurance, and detailed attribution sections expandable, keeping populated sections visible. Preserve all existing information.
3. **Simplify name entry.** First name, spouse, last name, company, and a full display-name field are visually repetitive. Use a clear person/company choice and make the generated display name a preview.
4. **Clarify deposit entry.** Explain the difference between a requested deposit and an actual payment; the production job correctly offers Add Payment as a separate action.
5. **Review imported job-type data.** Open Jobs' type filter includes values that look like job numbers. This is a data-cleanup issue; no historical customer data was altered during this review.
6. **Unify stage wording.** The contact link says Needs Production Review while the production dialog displays Awarded for the same new job. Use one user-facing label.

## Sample records

- Contact: 67a5d0e5-8920-4e93-b1e9-405c1d81c6e4
- Archived inquiry: 6ed267f2-bdde-4d34-8b10-c4e75011db9b
- Archived final job: 28372780-fe11-40cd-a32b-43cd10a29daa

The sample is fictional and must not be treated as a real sale. Archive-aware active-work checks confirmed zero active sample records. This was not a full audit of every report's treatment of archived records.
