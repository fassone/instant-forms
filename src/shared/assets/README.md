# src/shared/assets

## Purpose

`src/shared/assets/` stores source-owned static assets served by the Bun app.

## Belongs Here

- Small, committed assets required by the runtime UI.
- Brand images served directly by app routes.

## Does Not Belong Here

- Large raw design files.
- Generated screenshots.
- User uploads or runtime files.

## Change Safely

When replacing assets, keep public URLs stable unless route and rendering code change together. Prefer optimized assets to protect page speed.
