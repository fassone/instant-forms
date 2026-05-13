# instant-forms

A small Bun + TypeScript app for ultra-fast progressive lead forms.

The first form is a Spanish Tennessee auto-insurance lead flow for Seguros Aseguranza. Forms are selected by lowercase state code, so future states can be added as new registry entries without changing the page shell.

## Current Status

- Runtime/package manager: Bun
- Language: TypeScript using ESM modules
- Entrypoint: `index.ts`
- First route: `/tn`
- Type checking: strict TypeScript via `tsconfig.json`
- Tests: Bun test runner
- Required environment variables: none
- Persistence: none; valid submissions are logged to the server console

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
│   ├── render.ts
│   ├── server.ts
│   └── validation.ts
├── tests
│   └── instant-forms.test.ts
└── tsconfig.json
```

## Routes

| Route | Purpose |
|---|---|
| `GET /` | Redirects to `/tn`. |
| `GET /tn` | Renders the Tennessee progressive form. |
| `GET /:stateCode` | Renders a matching state form or a Spanish unavailable page. |
| `POST /api/forms/:stateCode/submissions` | Validates and logs completed submissions. |

## Form Flow

The Tennessee form asks one question per step. It does not gate or disqualify visitors; every visitor sees every question.

Question order:

1. `belongs_to_state`
2. `has_license`
3. `has_insurance`
4. `is_clean_title`
5. `number_of_registered_cars`
6. `first_name`
7. `last_name`
8. `phone_number`

Contact labels are shown in Spanish: `Nombre`, `Apellido`, and `Número de teléfono`.

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

Valid submissions are logged to the server console with:

- `stateCode`
- `formId`
- `formName`
- `pageId`
- `pageName`
- `submittedAt`
- `answers`

## Development Notes

- Use Bun as the runtime and package manager.
- Keep TypeScript strict and prefer explicit, typed boundaries.
- Keep changes small and focused; avoid adding framework or build complexity before it is needed.
- Add future state forms in `src/forms.ts` with lowercase state-code keys.
- Add tests with Bun's test runner when meaningful behavior changes.
- Update this README when setup, commands, runtime behavior, public usage, or environment variables change.
- Do not commit secrets. If configuration becomes necessary, use environment variables and document them here.

## Agent And Contributor Guidance

See `AGENTS.md` for repository-wide coding-agent and contributor instructions, including instruction precedence, reading order, quality gates, coding standards, and documentation expectations.
