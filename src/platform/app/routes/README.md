# src/platform/app/routes

## Purpose

`src/platform/app/routes/` owns public HTTP route behavior while delegating domain work to platform and authoring APIs.

## Belongs Here

- URL patterns.
- Route guards and redirects.
- Request body parsing at API boundaries.
- Wiring between HTTP helpers and domain modules.

## Does Not Belong Here

- Step-specific validation branches.
- Inline CSS or client JavaScript.
- Area-specific flow definitions.

## Change Safely

Keep public route changes covered by unit tests. For new route families, add a new route module and register it from `src/platform/app/server.ts`.
