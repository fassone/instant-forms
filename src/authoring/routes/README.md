# src/authoring/routes

## Purpose

`src/authoring/routes/` maps public URL folders and nested route groups to authored form flows.

## Belongs Here

- Public form folder placement, such as `/tn/custom`.
- Group-level fallbacks, such as redirecting `/tn` or `/tn/*` to `/tn/custom`.
- The default root redirect for the public form experience.
- Global public form fallback content and CTA configuration.

## Does Not Belong Here

- Checkpoint or submission API routes.
- Flow step order, labels, validators, or conditional behavior.
- Platform route compiler internals.

## Change Safely

Add a new folder by mapping a static URL segment to a flow, or add a nested group when a route family needs its own fallback. Use `unavailable({ title, message, cta, status })` when a route should render a custom unavailable page. Do not add `__preview`; it is reserved by the platform as a preview mirror of the public form folders.
