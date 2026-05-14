# src/steps/adapters

## Purpose

`src/steps/adapters/` owns server-side behavior for each step kind.

```mermaid
flowchart TD
  Index["index.ts dispatcher"] --> Choice["choice.ts"]
  Index --> Text["text.ts"]
  Index --> Phone["phone.ts"]
  Index --> Autocomplete["autocomplete.ts"]
  Index --> Interstitial["interstitial.ts"]
```

## Belongs Here

- Checkpoint validation per step kind.
- Submission validation and normalization per step kind.
- Answered-state checks.

## Does Not Belong Here

- Client-side masks.
- Route-level guard code.
- Rendering templates.

## Change Safely

Adapters are the server source of truth. Keep error messages stable unless tests and UI copy are intentionally updated.
