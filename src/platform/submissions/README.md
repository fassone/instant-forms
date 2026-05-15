# src/platform/submissions

## Purpose

`src/platform/submissions/` owns final submission validation and payload construction.

## Belongs Here

- Final all-answers validation against the visible step rules and `contract.answers`.
- Normalized submission payload shape.
- Typed delivery payload construction from each flow's Zod `contract.payload` and `payload.mapping({ context, answers })`.
- Top-level submission metadata such as TrustedForm certificate URLs, including authored requirements for consent steps.
- Submission-specific exported types.

## Does Not Belong Here

- Checkpoint cookie behavior.
- Hono response handling.
- Browser-side validation or masking.

## Change Safely

Payload shape changes are integration-sensitive. Update README examples, unit tests, and any downstream sink in the same change.
