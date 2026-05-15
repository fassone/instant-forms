# scripts

## Purpose

`scripts/` contains local maintenance commands for the form app. These scripts support development and release checks, but they are not part of the request-time server.

## Belongs Here

- Build and verification scripts that run from `package.json`.
- One-off project maintenance scripts that are safe to run locally.

## Does Not Belong Here

- Runtime Hono routes.
- Authored form flow definitions.
- Browser controller code that ships to visitors.

## Change Safely

Keep scripts deterministic and side-effect-light. `build-forms.ts` is allowed to rewrite `/_dist/forms`; it should not change source files, cookies, public routes, or authored flow behavior.

## Production Build

`bun run build:forms` renders every authored public form step, minifies the HTML/CSS/JS with the rendering platform, and writes the result to `/_dist/forms`. The generated files keep a small config placeholder so production requests can inject checkpoint-specific answers without running HTML minification during the request.

The build also creates a hashed transition bundle for each public form route. That bundle contains static step templates and non-PII step metadata only; request-specific answers stay in cookies and the per-request config injection.
