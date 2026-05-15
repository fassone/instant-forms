# src/authoring/flows

## Purpose

`src/authoring/flows/` contains each market's editable form definition.

## Belongs Here

- One folder per authored area or market.
- `registry.ts` with named exports for authored flows.
- Flow-level content such as labels, slugs, and matching copy.
- Zod-backed flow contracts for authored `context`, produced `answers`, and outbound payload fields.
- Business context in `context`, such as `areaCode`, `areaName`, and `product`.
- Answer-producing steps whose `key` values, choice options, and `showWhen` conditions match `contract.answers`.
- Typed payload mappings that build the logged delivery payload from `{ context, answers }`.

## Does Not Belong Here

- Reusable DSL builders or flow helper algorithms.
- Runtime route handling.
- Shared reference data such as US state catalogs.

## Change Safely

Keep public slugs stable once launched. Register public placement in `src/authoring/routes/registry.ts`; route mounts define runtime route keys such as `tn_custom`. When adding business context, declare it in `contract.context` before using it in authored `context`, template placeholders, or `payload.mapping`. When adding an answer-producing step, declare the same key exactly once in `contract.answers`; for choice steps, keep option keys equal to the answer enum values.
