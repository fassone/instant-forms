# src/app

## Purpose

`src/app/` owns the Hono application boundary: app creation, route registration, and HTTP concerns.

```mermaid
flowchart LR
  Server["server.ts"] --> Assets["routes/assets.ts"]
  Server --> Preview["routes/preview.ts"]
  Server --> Forms["routes/forms.ts"]
  Forms --> Cookies["http/cookies.ts"]
  Forms --> Responses["http/responses.ts"]
```

## Belongs Here

- Hono app setup.
- Route modules.
- HTTP response and cookie helpers.

## Does Not Belong Here

- Form definitions.
- Step validation adapters.
- HTML templates or visual styling.
- Business-specific submission sinks beyond route orchestration.

## Change Safely

Register new routes in `server.ts`, keep route-specific logic in `routes/`, and reuse `http/` helpers for response/cookie behavior.
