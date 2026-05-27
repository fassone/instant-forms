# src/authoring/flows

## Purpose

`src/authoring/flows/` contains each market's editable form definition.
Concrete market files may directly call `defineFormFlow(...)` or instantiate a reusable template from `src/authoring/templates/`.

## Belongs Here

- One folder per authored area or market.
- `registry.ts` with named exports for authored flows.
- Concrete template instantiations for markets that share a reusable flow.
- Flow-level content such as labels, slugs, and matching copy.
- Flow-level `locale` and `ui` copy for platform-owned actions, progress labels, error modal text, validation/failure messages, and native thank-you/error pages.
- Zod-backed flow contracts for authored `context`, produced `answers`, and outbound payload fields.
- Business context in `context`, such as `areaCode`, `areaName`, and `product`.
- Answer-producing steps whose `key` values, choice options, and `showWhen` conditions match prior `contract.answers`.
- Typed payload settings that declare the downstream HTTPS URL and build the logged delivery payload from `{ context, answers, submission, request, cookies, browser }`.

## Does Not Belong Here

- Reusable DSL builders or flow helper algorithms.
- Reusable cross-market flow templates.
- Runtime route handling.
- Shared reference data such as US state catalogs.

## Change Safely

Keep public slugs stable once launched. Register public placement in `src/authoring/routes/registry.ts`; route mounts define runtime route keys such as `tn_custom`. When adding business context, declare it in `contract.context` before using it in authored `context`, template variables, or `payload.mapping`. When adding an answer-producing step, declare the same key exactly once in `contract.answers`; for choice steps, keep option keys equal to the answer enum values. Conditions in `showWhen` may reference only answer-producing steps that appear earlier in the flow.

When targeting a new language, author both the step text and the required flow-level `ui` block in that language. The platform reads modal copy, action labels, progress text, and fallback errors from `ui`; it does not provide a language-specific default.
