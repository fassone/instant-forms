# src/authoring/routes

## Purpose

`src/authoring/routes/` maps public URL folders and nested route groups to authored form flows.

## Belongs Here

- Public form folder placement, such as `/auto/tn`.
- Shared quote welcome/product selection copy and placement at `/` and `/producto`.
- Independent generic flow mounts at `/auto` and `/hogar`.
- Valid but unauthored state fallbacks to the generic flow with a pending state preselection.
- Global public form fallback content and CTA configuration.
- Placement of sample privacy and terms documents through `legal_page` actions; prose lives in `authoring/legal`.

## Does Not Belong Here

- Checkpoint or submission API routes.
- Flow step order, labels, validators, or conditional behavior.
- Platform route compiler internals.

## Change Safely

Add a new folder by mapping a static URL segment to a flow, or add a nested group when a route family needs its own fallback. Use `unavailable({ title, message, cta, status })` when a route should render a custom unavailable page. Do not add `__preview`; it is reserved by the platform as a preview mirror of the public form folders.

Groups can mount a generic flow at `index` alongside state children. Dedicated children take precedence. `queryPrefill` maps validated query hints to autocomplete answers without saving progress. `generic_state` redirects only recognized US state codes; invalid paths use its authored unavailable response.
