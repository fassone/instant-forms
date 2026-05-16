# src/platform/flow/dsl

## Purpose

`src/platform/flow/dsl/` owns the TypeScript-first form definition language used by authored flows.

## Belongs Here

- Shared form and step types.
- Step builders for `choice`, `text`, `phone`, `autocomplete`, `interstitial`, and `trusted_form_consent`.
- Zod-backed contract typing for authored context, produced answers, and outbound payloads.
- Compile-time and runtime checks that answer-producing step keys, choice option keys, and `showWhen` conditions match prior `contract.answers`.
- Typed payload mappings that receive grouped `{ context, answers }` input.

## Does Not Belong Here

- Specific market questions.
- Renderer-specific HTML attributes.
- Route guards or cookie code.

## Change Safely

Adding a step kind requires updating DSL types, builders, adapters, rendering contracts, and tests together. Contract changes must keep TypeScript inference and runtime validation aligned so authored flows fail early when context, answer keys, choice values, conditional visibility, answer ordering, or payload mappings drift.
