# src/shared

## Purpose

`src/shared/` contains neutral runtime resources used by both authoring and platform code.

## Belongs Here

- Static assets served by the app.
- Stable reference catalogs and normalizers.
- Resources with no dependency on authoring or platform internals.

## Does Not Belong Here

- Area-specific flow content.
- App routes or rendering logic.
- Step adapters or feature implementations.

## Change Safely

Shared modules must not import from `authoring` or `platform`. Keep assets optimized and data changes covered by tests.
