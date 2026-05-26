# src/authoring/proxies

## Purpose

`src/authoring/proxies/` declares the low-level first-party request proxies that authored integrations are allowed to use after their initial script loads.

## Belongs Here

- Vendor follow-up request proxy routes.
- HTTPS host/path allowlists for request rewriting.
- Special first-party beacon routes such as Meta Pixel `/tr`.
- Timeout and method policies for proxied vendor requests.

## Does Not Belong Here

- Selected initial script URLs; those belong in `src/authoring/scripts`.
- Form-specific tracking event choices or pixel IDs.
- Open proxy behavior or visitor-cookie forwarding.

## Change Safely

Keep each proxy allowlist narrow and vendor-specific. Every request proxy must use HTTPS upstreams, explicit methods, finite timeouts, and first-party routes under `/_instant/`.
