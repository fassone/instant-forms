# src/platform/steps

## Purpose

`src/platform/steps/` owns reusable step-kind behavior that is independent of a specific authored form.

```mermaid
flowchart LR
  FlowStep["Form step"] --> Adapters["adapters"]
  FlowStep --> Phone["phone/us-phone.ts"]
  FlowStep --> Autocomplete["autocomplete/ranking.ts"]
  Adapters --> Persistence["checkpoint validation"]
  Adapters --> Submission["submission validation"]
```

## Belongs Here

- Step adapters for checkpoint/submission validation.
- Phone normalization.
- Autocomplete ranking algorithms.

## Does Not Belong Here

- Hono routes.
- Authored market flow files.
- HTML page shell or CSS.

## Change Safely

When changing a step kind, keep its adapter, DSL type, renderer contract, and tests aligned.
