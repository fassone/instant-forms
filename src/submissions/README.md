# src/submissions

## Purpose

`src/submissions/` owns final submission validation and payload construction.

```mermaid
flowchart TD
  Request["answers JSON"] --> Validation["validation.ts"]
  Validation --> Steps["step adapters"]
  Steps --> Payload["SubmissionPayload"]
  Payload --> Logger["Route logger"]
```

## Belongs Here

- Final all-answers validation.
- Normalized submission payload shape.
- Submission-specific exported types.

## Does Not Belong Here

- Checkpoint cookie behavior.
- Hono response handling.
- Browser-side validation or masking.

## Change Safely

Payload shape changes are integration-sensitive. Update README examples, unit tests, and any downstream sink in the same change.
