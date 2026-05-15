# src/authoring/scripts

## Purpose

`src/authoring/scripts/` declares which third-party scripts are allowed to be served through first-party proxy routes.

## Belongs Here

- Selected script keys such as `tfc`.
- Upstream script URLs.
- Safe query aliases that authors want to expose.

## Does Not Belong Here

- Proxy request handling.
- Open URL forwarding.
- Step rendering or consent copy.

## Change Safely

Only add scripts that are intentionally allowed for this app. Every script must have a static key, an HTTPS upstream URL, and a small list of accepted query parameters.
