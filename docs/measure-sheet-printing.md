# Measure sheet printing

Print Measure Sheet is available on inquiry details and inside job details. Job entry resolves the linked inquiry by ID; it never adds job data or guesses an inquiry from customer names. Jobs without a linked inquiry ask the user to link one first.

The original supplied PDF is retained at `assets/measure-sheet-template.pdf`. PDF generation happens in the signed-in browser from inquiry/contact records under existing access policies. The server receives no new customer data and no generated PDFs are stored publicly.

The output always contains exactly two Letter pages in the original order. Page 1 (measurements) is untouched. Page 2 contains only the existing lead-form answers. Job numbers, contract amounts, quoted prices, production notes, and additional pages are excluded. Missing answers stay blank. Long values shrink to 8 pt, then truncate visibly with an ellipsis; the print preview reports affected fields.

Print duplex, flip on the long edge. Browser/printer settings control actual printing. A PDF preview, Download PDF, and Open PDF are also provided.

Validation: `node tests/measure-sheet.test.cjs` creates a fictional output in scratch and checks fixed page count and long-field handling. Poppler rendering confirmed that the measurement page is pixel-identical to the original. The filled lead side was visually reviewed; extraction verified that price and notes were excluded.

Bundled dependencies: pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1, and DejaVu Sans; source licenses are in `vendor/`.
