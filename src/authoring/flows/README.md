# src/authoring/flows

## Purpose

`src/authoring/flows/` contains each market's editable form definition.

## Belongs Here

- One folder per authored area or market.
- `registry.ts` with named exports for authored flows.
- Flow-level content such as labels, slugs, and matching copy.
- Business context in `customVariables`, such as `areaCode` and `areaName`.

## Does Not Belong Here

- Reusable DSL builders or flow helper algorithms.
- Runtime route handling.
- Shared reference data such as US state catalogs.

## Change Safely

Keep public slugs stable once launched. Register public placement in `src/authoring/routes/registry.ts`; route mounts define runtime route keys such as `tn_custom`.
