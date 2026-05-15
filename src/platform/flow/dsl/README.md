# src/platform/flow/dsl

## Purpose

`src/platform/flow/dsl/` owns the TypeScript-first form definition language used by authored flows.

## Belongs Here

- Shared form and step types.
- Step builders for `choice`, `text`, `phone`, `autocomplete`, `interstitial`, and `trusted_form_consent`.
- Flow-level custom variables used by authored copy and display.

## Does Not Belong Here

- Specific market questions.
- Renderer-specific HTML attributes.
- Route guards or cookie code.

## Change Safely

Adding a step kind requires updating DSL types, builders, adapters, rendering contracts, and tests together.
