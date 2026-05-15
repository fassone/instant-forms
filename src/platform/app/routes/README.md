# src/platform/app/routes

## Purpose

`src/platform/app/routes/` owns small Hono route modules that are not authored public form pages.

## Belongs Here

- Static asset routes.
- Built production transition-bundle routes under `/_instant/forms/...`.
- Allowlisted selected-script proxy routes under `/_instant/scripts/...`.
- Partytown static runtime files under `/~partytown/...`.
- Checkpoint and submission API routes.
- Request body parsing at API boundaries.
- Wiring between HTTP helpers and domain modules.

## Does Not Belong Here

- Step-specific validation branches.
- Authored public form folder placement.
- Inline CSS or client JavaScript.
- Area-specific flow definitions.

## Change Safely

Keep API and asset route changes covered by unit tests. Public form page placement belongs in `src/authoring/routes`, and its compiler belongs in `src/platform/routing`.
