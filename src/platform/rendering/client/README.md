# src/platform/rendering/client

## Purpose

`src/platform/rendering/client/` owns the serialized client contract used by the inline browser controller.

## Belongs Here

- Client-facing config shapes.
- Server-to-browser mapping helpers.
- Browser controller ownership markers.

## Does Not Belong Here

- Hono routes.
- CSS-only layout rules.
- Authored flow definitions.

## Change Safely

Treat config keys as a browser API. If a field changes, update render tests and Playwright interactions together.
