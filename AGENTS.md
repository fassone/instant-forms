# AGENTS.md - Repository Guide

Scope: This file governs the entire repository by default. Deeper `AGENTS.md` files may be added in subdirectories later and override this file for their scope.

Read this first if you are contributing, reviewing, or acting as an automated coding agent.

## Instruction Scope And Precedence

Agents must discover and read every `AGENTS.md` that applies to files they will touch.

Rules:

1. Direct user/task instructions have highest precedence.
2. The deepest/nearest `AGENTS.md` governs its subtree.
3. When multiple `AGENTS.md` files apply, the more specific nested file overrides broader files on conflict.
4. This root `AGENTS.md` is the repository baseline when no deeper scoped instruction applies.
5. README and package docs provide implementation details, but they do not override applicable `AGENTS.md` instructions unless the user explicitly says so.

Current scoped guides:

- None.

## Reading Order

Use this bootstrap reading order:

1. `AGENTS.md`
2. Every nested `AGENTS.md` from repo root to the touched path, from broadest to deepest
3. `README.md`
4. Package or directory `README.md` files for touched areas, if added later
5. Linked issues, project boards, or task notes supplied by the user

## Intent And Principles

Core principles:

- SOLID, KISS, YAGNI
- Type safety end-to-end
- Security by default: least privilege, safe defaults, no secrets in code
- Testability: clear boundaries, deterministic behavior, fast checks first
- Developer experience: small changes, fast feedback, predictable tooling
- Simplicity over abstraction: avoid premature indirection
- Backward compatibility for public contracts where feasible; breaking changes must be explicit
- Useful diagnostics without leaking sensitive data

## Repository Overview

This is a small Bun + TypeScript project.

Runtime and tooling conventions:

- Use Bun as the runtime and package manager.
- Use ESM TypeScript consistently. `package.json` sets `"type": "module"` and `index.ts` as the module entry.
- Keep TypeScript strict. The current `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`.
- Prefer focused modules as the codebase grows. Avoid adding framework or build complexity before the project needs it.
- There are currently no nested packages or workspaces. If packages are added later, enforce clear package boundaries and expose shared code through explicit public entrypoints.

Current top-level files:

- `index.ts` - application entrypoint
- `package.json` - package metadata and dependency declarations
- `tsconfig.json` - TypeScript configuration
- `bun.lock` - Bun lockfile
- `README.md` - project overview and local workflow

## Workflow And Quality

Use available scripts from `package.json` when they exist. Until scripts are added, use these root commands directly:

```bash
bun install
bun run index.ts
bunx tsc --noEmit
```

Before finishing a task:

- Run `bunx tsc --noEmit` when TypeScript changed.
- Run relevant tests when tests exist or are added for the touched area.
- Add or update tests for meaningful behavior changes.
- Update `README.md` when setup, runtime behavior, commands, public usage, or environment variables change.
- Keep changes small, focused, and reversible.

Testing expectations:

- Prefer Bun's built-in test runner when introducing tests.
- Keep tests deterministic and environment-light.
- Avoid tests that require external services unless they are clearly documented and isolated.

## Coding Standards

- Follow the repository's configured TypeScript and Bun conventions.
- Prefer explicit exports for public behavior.
- Keep functions focused and single-purpose.
- Avoid dead code, stale scaffolding, and drive-by refactors.
- Use clear naming and predictable file organization.
- Do not hardcode secrets, credentials, or machine-specific absolute paths in source code.
- Use environment variables or explicit configuration for runtime settings.
- Document exported APIs and non-obvious behavior with concise comments or JSDoc when useful.
- Do not add noisy comments that restate syntax.
- Comments should explain intent, invariants, side effects, edge cases, or operational constraints.

## Environment Variables And Secrets

There are currently no required environment variables.

If environment variables are introduced, document them in `README.md` in the same change. Include the variable name, whether it is required, its default if any, and its purpose. Keep local secrets in an untracked `.env` file and provide a safe example file when useful.

## Logging And Errors

- Use structured, purposeful diagnostics as runtime code grows.
- Do not log secrets, tokens, credentials, or sensitive payloads.
- Do not swallow exceptions silently.
- Prefer typed error or result patterns at module boundaries when they make behavior clearer.
- Temporary local debugging logs should be removed before finishing unless they are intentional runtime diagnostics.
