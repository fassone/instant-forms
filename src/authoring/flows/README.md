# src/authoring/flows

## Purpose

`src/authoring/flows/` registers authored area flows and groups each market's editable form definition.

## Belongs Here

- One folder per authored area or market.
- `registry.ts` mapping lowercase area codes to authored flows.
- Flow-level content such as labels, slugs, and matching copy.

## Does Not Belong Here

- Reusable DSL builders or flow helper algorithms.
- Runtime route handling.
- Shared reference data such as US state catalogs.

## Change Safely

Keep public slugs stable once launched. Register new flows in `registry.ts` and add route/structure tests for the new area.
