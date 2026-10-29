# Legal Content

This folder owns the Spanish legal documents and their shared link labels/paths. The public route registry mounts them as standalone `legal_page` actions; product templates opt into their links through `page.legalLinks`.

`terms-and-conditions.ts` contains the user-approved terms for Liderna Inc, with an authored last-updated date, sixteen sections and an important arbitration/liability notice. Keep the notice's numbered references aligned with the sections. Publishing text alone does not collect acceptance; do not silently change form consent behavior.

`sample-documents.ts` still contains the unapproved privacy sample. Keep its sample notice and unconfirmed details until replacement copy is supplied. Do not invent legal commitments, contact channels, retention periods or compliance claims. Both documents retain their existing no-store and noindex behavior.

Document sections use escaped Markdown, not raw HTML. Layout, safe return URLs and browser behavior belong to the platform rendering/routing layers. Changes should preserve unique section anchors and pass the legal-page unit and browser tests.
