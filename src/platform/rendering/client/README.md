# src/platform/rendering/client

## Purpose

`src/platform/rendering/client/` owns the serialized client contract used by the inline browser controller.

## Belongs Here

- Client-facing config shapes.
- Server-to-browser mapping helpers.
- Browser controller ownership markers.
- Client-side behavior that must stay compatible with production inline JS compaction.

## Does Not Belong Here

- Hono routes.
- CSS-only layout rules.
- Authored flow definitions.

## Change Safely

Treat config keys as a browser API. If a field changes, update render tests and Playwright interactions together.

`tracking.events`, `tracking.context` and `tracking.serverEvents` are shared metadata, not GTM settings. Only the optional `tracking.googleTagManager` enables `dataLayer` delivery. A Meta event mapping without a server callback or GTM delivery keeps browser-ID capture available but must not trigger extra tracking requests. Initial and remounted TrustedForm substep views are deduplicated independently of GTM.

The browser controller remains inline in both development and production. Keep source readable here; the rendering asset builder handles production compaction so visitors still receive a small inline payload with no extra request.

`initialPrefill` contains validated, unconfirmed autocomplete hints. Hydration prefers checkpoint answers over those hints; only normal answer confirmation saves them. `prefillQuery` retains the hints during document and history navigation so refresh does not erase a pending preselection.
