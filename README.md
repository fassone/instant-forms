# instant-forms

A small Bun + Hono + TypeScript app for ultra-fast progressive lead forms.

The first form is a Spanish Tennessee auto-insurance lead flow for Seguros Aseguranza. Forms are selected by lowercase state code, so future states can be added as new registry entries without changing the page shell.

## Current Status

- Runtime/package manager: Bun
- HTTP router: Hono
- Language: TypeScript using ESM modules
- Entrypoint: `index.ts`
- First route: `/tn`
- Type checking: strict TypeScript via `tsconfig.json`
- Tests: Bun test runner
- Required environment variables: none
- Persistence: short-term checkpoint answers in an HttpOnly cookie; valid submissions are logged to the server console

## Quickstart

Install dependencies:

```bash
bun install
```

Run the app:

```bash
bun run dev
```

Open `http://localhost:3000/tn`.

Typecheck the project:

```bash
bun run typecheck
```

Run tests:

```bash
bun test
```

## Project Structure

```text
.
├── AGENTS.md
├── README.md
├── bun.lock
├── index.ts
├── package.json
├── src
│   ├── forms.ts
│   ├── checkpoints.ts
│   ├── render.ts
│   ├── server.ts
│   ├── us-states.ts
│   └── validation.ts
├── tests
│   └── instant-forms.test.ts
└── tsconfig.json
```

## Routes

| Route | Purpose |
|---|---|
| `GET /` | Redirects to `/tn`. |
| `GET /tn` | Redirects to the next unanswered Tennessee step. |
| `GET /tn/:stepSlug` | Renders a specific guarded Tennessee step, for example `/tn/vive-en-tennessee`. |
| `GET /tn/*` | Redirects unknown paths under Tennessee back to `/tn`. |
| `GET /__preview/tn/buscando-oferta` | Local no-store preview for iterating on the matching transition. |
| `GET /:stateCode` | Redirects a matching state form or returns a Spanish unavailable page. |
| `POST /api/forms/:stateCode/checkpoints` | Validates one answer, saves it to the checkpoint cookie, and returns the next allowed URL. |
| `POST /api/forms/:stateCode/submissions` | Validates and logs completed submissions. |

## Form Flow

The Tennessee form asks one question per step. It does not disqualify visitors; every visitor continues through the flow. If a visitor answers that they do not live in Tennessee, the form inserts one extra step asking which state they live in.

Question order:

1. `belongs_to_state`
2. `residence_state` when `belongs_to_state` is `no`
3. `has_license`
4. `has_insurance`
5. `is_clean_title`
6. `number_of_registered_cars`
7. `matching_offer`
8. `first_name`
9. `last_name`
10. `phone_number`

The `matching_offer` step is a checkpoint-only branded loading moment before contact information. It rotates short benefit lines, uses the visitor's real state in the coverage message, then unlocks the `Siguiente` button after the success message. Contact labels are shown in Spanish: `Nombre`, `Apellido`, and `Número de teléfono`.

Step URLs use explicit Spanish slugs while submissions and cookies keep the stable internal question keys:

- `/tn/vive-en-tennessee`
- `/tn/estado-donde-vive` when `belongs_to_state` is `no`
- `/tn/tiene-licencia`
- `/tn/tiene-seguro`
- `/tn/titulo-limpio`
- `/tn/autos-a-asegurar`
- `/tn/buscando-oferta`
- `/tn/nombre`
- `/tn/apellido`
- `/tn/telefono`

Visitors can use browser Back/Forward across steps. Direct URLs are guarded: a visitor cannot open a step beyond the first unanswered required question. Legacy English slugs redirect to the Spanish URLs.

## Checkpoints

Each valid partial answer is saved in an HttpOnly cookie named `instant_forms_<stateCode>_answers`, using a 7-day max age, `SameSite=Lax`, `Path=/`, and `Secure` on HTTPS. The cookie stores a base64url JSON answer map and is validated/sanitized on every request before it is used.

Phone checkpoint values preserve the visitor's visible input, such as `+1 (615) 555-1234`, so refresh and resume can prefill naturally. Final submissions still normalize phone answers to E.164.

Residence-state checkpoint values accept state names or codes, such as `Texas` or `TX`, and store the normalized two-letter code.

The matching step first stores `matching_offer: "completed"` when the loading transition finishes, so refreshes return to the success state instead of replaying the animation. It stores `matching_offer: "seen"` only when the visitor presses `Siguiente`, so contact steps remain guarded until that explicit click. Once `seen` is saved, the matching route is removed from server and client step navigation, so Back/Next skip it. It is omitted from final submission payloads.

## Submissions

The client posts JSON to `POST /api/forms/tn/submissions`:

```json
{
  "answers": {
    "belongs_to_state": "yes",
    "has_license": "yes",
    "has_insurance": "no",
    "is_clean_title": "yes",
    "number_of_registered_cars": "1",
    "first_name": "Ana",
    "last_name": "Lopez",
    "phone_number": "+16155551234"
  }
}
```

Server validation requires all answers, checks choice answers against configured option keys, and accepts common US phone formats that can normalize to E.164, for example `+16155551234`.

When `belongs_to_state` is `no`, submissions must include `residence_state`, normalized to a two-letter US state code. When `belongs_to_state` is `yes`, `residence_state` is ignored if present.

Valid submissions are logged to the server console with:

- `stateCode`
- `formId`
- `formName`
- `pageId`
- `pageName`
- `submittedAt`
- `answers`

After a successful submission, the checkpoint cookie is cleared.

## Development Notes

- Use Bun as the runtime and package manager.
- Use Hono routes for HTTP behavior.
- Keep TypeScript strict and prefer explicit, typed boundaries.
- Keep changes small and focused; avoid adding framework or build complexity before it is needed.
- Add future state forms in `src/forms.ts` with lowercase state-code keys.
- Add tests with Bun's test runner when meaningful behavior changes.
- Update this README when setup, commands, runtime behavior, public usage, or environment variables change.
- Do not commit secrets. If configuration becomes necessary, use environment variables and document them here.

## Agent And Contributor Guidance

See `AGENTS.md` for repository-wide coding-agent and contributor instructions, including instruction precedence, reading order, quality gates, coding standards, and documentation expectations.
