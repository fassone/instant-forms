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

The browser controller remains inline in both development and production. Keep source readable here; the rendering asset builder handles production compaction so visitors still receive a small inline payload with no extra request.
