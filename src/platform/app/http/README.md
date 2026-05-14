# src/platform/app/http

## Purpose

`src/platform/app/http/` contains Hono-facing helpers for response creation and checkpoint cookie headers.

## Belongs Here

- Hono context cookie read/write/delete helpers.
- HTML, JSON, redirect, and asset response helpers.
- HTTP cache-control behavior.

## Does Not Belong Here

- Cookie payload validation.
- Flow guard algorithms.
- Form or step definitions.

## Change Safely

Keep helpers thin. If logic can be tested without Hono context, it belongs in `src/platform/persistence` or another platform domain.
