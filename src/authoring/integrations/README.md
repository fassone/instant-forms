# src/authoring/integrations

## Purpose

`src/authoring/integrations/` contains typed authoring presets for third-party integrations used by authored flows.

## Belongs Here

- Reusable integration config helpers that keep repetitive operational wiring out of flow templates.
- Author-facing presets for integrations such as TrustedForm Certify and Google Tag Manager.

## Does Not Belong Here

- Network proxy route handlers.
- Runtime SDK execution code.
- Flow-specific copy, questions, or payload mappings.

## Change Safely

Keep presets explicit and typed. They should centralize stable low-level settings while leaving market-level choices visible in the flow or template that uses them.
