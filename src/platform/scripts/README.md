# src/platform/scripts

## Purpose

`src/platform/scripts/` owns the reusable mechanics for selected third-party script delivery.

## Belongs Here

- Allowlisted script proxy validation.
- Upstream URL construction from safe query aliases.
- Partytown static asset serving helpers.

## Does Not Belong Here

- Area-specific flow choices.
- Arbitrary open-proxy behavior.
- Step rendering or form validation.

## Change Safely

Add proxy capabilities here only when they can be expressed as allowlisted script keys and explicit query parameters. Authored script selections belong in `src/authoring/scripts`.
