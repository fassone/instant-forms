# src/platform/app

## Purpose

`src/platform/app/` owns the Hono application boundary and route registration.

## Belongs Here

- Hono app creation.
- Route modules.
- App-layer HTTP helper usage.

## Does Not Belong Here

- Authored form content.
- Step validation implementation.
- Rendering templates or static data catalogs.

## Change Safely

Public route changes need route tests. Keep this folder as orchestration over platform and authoring APIs.
