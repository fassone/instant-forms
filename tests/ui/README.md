# tests/ui

## Purpose

`tests/ui/` contains Playwright coverage for real browser behavior and stable visual states.

## Belongs Here

- Browser Back/Forward tests.
- Mobile and desktop interaction smoke paths.
- Error modal, phone mask, autocomplete, and screenshot checks.

## Does Not Belong Here

- Pure validation tests.
- Source fixtures unrelated to browser behavior.
- Ad hoc manual screenshots.

## Change Safely

Use deterministic setup with checkpoint cookies. When screenshots fail, inspect the diff before running `bun run test:ui:update`.

Playwright starts `server.ts`, a loopback-only test server with dummy analytics credentials and mocked outbound analytics/lead delivery. It includes explicit GTM-opt-in and Meta-identifiers-only fixtures; it must never be used as a production entrypoint. Existing servers are not reused, so tests cannot accidentally submit real leads.

Run `bun run test:ui -- --grep "tracking delivery isolation|GTM follow-up"` for tracking coverage across desktop/mobile Chromium, Firefox and WebKit. Run once normally and again with `NODE_ENV=production` after `bun run build:forms` to cover production-minified pages and real transition assets. The production fixture server injects its current request configuration into prebuilt shells.

Run `bun run test:ui -- --grep "legal pages"` for standalone document scrolling, keyboard access, short-mobile footer placement, same-tab returns, unchanged checkpoint/attribution cookies and no-JavaScript links. Run in both development and production modes. Screenshots are written to the Playwright output directory for visual review, not committed as generated assets.
