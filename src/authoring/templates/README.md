# src/authoring/templates

## Purpose

`src/authoring/templates/` contains reusable form factories for markets that share the same flow structure.

## Belongs Here

- `defineFormTemplate(...)` instances with typed variable contracts.
- Shared authored flow structure, copy, contracts, and payload mappings.
- Template-level constants that are reused by multiple market instantiations.

## Does Not Belong Here

- Route placement for a concrete market.
- Platform DSL implementation.
- Runtime rendering, checkpoint, or submission code.

## Change Safely

Templates are authoring-time factories only. A template should validate its variables, then return a normal flow through `defineFormFlow(...)`. Keep market-specific values explicit in the template variables so each instantiation shows exactly what changes.
