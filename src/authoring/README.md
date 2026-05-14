# src/authoring

## Purpose

`src/authoring/` contains content and configuration that form authors are expected to change when adding or editing markets.

## Belongs Here

- Area-specific form definitions.
- Area-to-flow registration.
- Market copy, slugs, order, and authored conditional flow choices.

## Does Not Belong Here

- Hono routes, rendering internals, checkpoint logic, or validation engines.
- Shared catalogs used by more than authored flows.
- Platform step-kind implementations.

## Change Safely

Adding a market should normally touch this folder, tests, and documentation. Import DSL builders from `src/platform/flow/dsl`; do not reach into platform app internals.
