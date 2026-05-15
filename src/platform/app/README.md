# src/platform/app

## Purpose

`src/platform/app/` owns the Hono application boundary and route registration.

## Belongs Here

- Hono app creation.
- Route modules.
- App-layer HTTP helper usage.
- Registration of the compiled public form route tree.
- Registration of selected-script proxy and Partytown asset routes.

## Does Not Belong Here

- Authored form content.
- Step validation implementation.
- Rendering templates or static data catalogs.

## Change Safely

Public form route placement should change in `src/authoring/routes`, not here. Keep this folder as orchestration over platform and authoring APIs.
