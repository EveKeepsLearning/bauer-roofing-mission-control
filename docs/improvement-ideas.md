# Improvement Ideas

Shared BRO fixes and suggestions live in Improvement Ideas. Eve, Jonathan, and Roy's confirmed team accounts can add/edit ideas and set New, Planned, In progress, or Done. Authors and Eve can delete shared ideas with confirmation. The active filter hides completed items; All ideas and Completed retain access to them. Load More avoids silently hiding older ideas.

Eve's Today page includes a separate private Business Improvements panel immediately after My Quick Notes. Business ideas are protected by author-based database access policies, not merely hidden in the interface. Session changes clear drafts and loaded data; stale read responses are ignored. No notifications are sent.

The database schema is in `sql/improvement-ideas.sql`. Tests in `tests/improvement-ideas.sql` run inside a rolled-back transaction. Eve/Jonathan shared access and private-data isolation passed. Roy's account was unconfirmed at verification, so it correctly lacked shared workspace access until email confirmation; no account settings were changed.

The measure sheet now uses the earliest non-canceled, non-superseded initial appointment and a separately scheduled presentation/proposal appointment. The next proposal is preferred, or the most recent completed/past proposal when there is no upcoming one. Combined Measure & Presentation is not duplicated as a separate proposal appointment. No appointment is invented and no new page is added.
