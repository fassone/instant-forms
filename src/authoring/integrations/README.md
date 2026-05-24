# src/authoring/integrations

## Purpose

`src/authoring/integrations/` contains typed authoring presets for third-party integrations used by authored flows.

## Belongs Here

- Reusable integration config helpers that keep repetitive operational wiring out of flow templates.
- Author-facing presets for integrations such as TrustedForm Certify and Google Tag Manager.
- Schema helpers for integration identifiers, such as GTM container IDs and Meta Pixel IDs.

## Does Not Belong Here

- Network proxy route handlers.
- Runtime SDK execution code.
- Flow-specific copy, questions, or payload mappings.

## Change Safely

Keep presets explicit and typed. They should centralize stable low-level settings while leaving market-level choices visible in the flow or template that uses them.

GTM is transport configuration only. The flow/template declares the actual `dataLayer` events through `tracking.events`, and Meta Pixel IDs belong on the individual authored event mapping that should produce a Meta event.
