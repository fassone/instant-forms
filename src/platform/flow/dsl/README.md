# src/platform/flow/dsl

## Purpose

`src/platform/flow/dsl/` owns the TypeScript-first form definition language used by authored flows.

## Belongs Here

- Shared form and step types.
- `defineFormTemplate(...)` for reusable typed authoring-time flow factories.
- Step builders for `choice`, `text`, `phone`, `autocomplete`, `interstitial`, and `trusted_form_consent`.
- Zod-backed contract typing for authored context, produced answers, and outbound payloads.
- Required flow-level `locale` and `ui` copy for platform-owned labels and error surfaces.
- Compile-time and runtime checks that answer-producing step keys, choice option keys, `showWhen` conditions, and step-level resolver dependencies match prior `contract.answers`.
- Typed payload mappings that receive grouped `{ context, answers }` input.
- Safe authored copy helpers: `text(...)` for submitted/plain values, `phoneDisplay(...)` for explicit human-readable US phone display, `stateDisplay(...)` for explicit US state-name display, and `md(...)` / `markdown(...)` for rendered display prose.

## Does Not Belong Here

- Specific market questions.
- Renderer-specific HTML attributes.
- Route guards or cookie code.

## Change Safely

Adding a step kind requires updating DSL types, builders, adapters, rendering contracts, and tests together. Contract changes must keep TypeScript inference and runtime validation aligned so authored flows fail early when context, answer keys, choice values, conditional visibility, answer ordering, dynamic copy dependencies, or payload mappings drift.

Flow `locale` and `ui` are required. The renderer, client runtime, checkpoint/submission validation, and native submission pages all read platform-owned copy from that `ui` object, so multilingual support is per-flow and explicit rather than inherited from hidden defaults.

Templates declare a Zod `variables` object and expose `.create(input)`. The helper rejects missing, invalid, or undeclared template variables, then calls the authored factory with parsed variables. Templates return normal `InstantForm` values; there is no runtime template object in routing, rendering, or submissions.

Dynamic authoring happens at the step boundary: a step is either static, or the builder receives one dependency list and one resolver that returns that step's dynamic display/body props. Nested `resolve(...)` calls inside fields are intentionally rejected so dependency ownership stays obvious.

Page `presentation.desktopHeightPx` is static form-shell config for desktop-only form height. Step `presentation.chrome` is static presentation config, not dynamic copy. It accepts `"visible"`, `"hidden"`, or `"hidden_on_mobile"`. TrustedForm review/consent substep overrides use the explicit `substeps.review.presentation` and `substeps.consent.presentation` shape; `review` and `consent` themselves stay focused on content.

TrustedForm display copy can be static strings or `md(...)` values, and dynamic display copy must be returned from the step-level resolver with `md(...)`. Native controls, route slugs, keys, review field labels, and submitted values stay plain text; resolver-produced submitted values use `text(...)`, with `phoneDisplay(...)` or `stateDisplay(...)` only when an authored field or consent tag should show formatted display text.
