# Legal Content

This folder owns the Spanish legal documents and their shared link labels/paths. The public route registry mounts them as standalone `legal_page` actions; product templates opt into their links through `page.legalLinks`.

`terms-and-conditions.ts` contains the user-approved terms for Liderna Inc, with an authored last-updated date, sixteen sections and an important arbitration/liability notice. Keep the notice's numbered references aligned with the sections. Publishing text alone does not collect acceptance; do not silently change form consent behavior.

`privacy-policy.ts` contains the finalized fifteen-section privacy policy. Its authored effective date is `29 de octubre de 2026`; never generate that date dynamically. Privacy omits the optional notice; Terms retains its important notice. The policy describes allocation to one or more agents without promising exclusivity, no disclosure to participating agents before selection, commercial allocation factors, Meta activity information for advertising, and the current lack of automatic DNT/GPC processing. Contact details are `hello@liderna.com` (monitored by the operator) and the authored Conroe mailing address. Broader contact-consent review, other-state applicability, any required opt-out controls, downstream request handling and deployment remain separate checks; finalizing this copy does not implement or certify them. Do not invent legal commitments, retention periods or compliance claims. Both documents retain their existing no-store and noindex behavior.

Document sections use escaped Markdown, not raw HTML. Layout, safe return URLs and browser behavior belong to the platform rendering/routing layers. Changes should preserve unique section anchors and pass the legal-page unit and browser tests.
