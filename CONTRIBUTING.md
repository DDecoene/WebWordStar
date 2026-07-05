# Contributing to WebWordStar

Thanks for your interest! WebWordStar is a clean-room, browser-based reimplementation of
WordStar with real-time collaborative editing. Contributions are welcome — bug reports,
fixes, features, and documentation alike.

## Getting started

```bash
git clone https://github.com/DDecoene/WebWordStar.git
cd WebWordStar
nvm use            # Node 22 (see .nvmrc)
npm install
npm run dev        # Vite on http://localhost:5273 + WS server on :5274
```

Open `http://localhost:5273` — you'll be redirected to a fresh document. Visit
`/demo` for a seeded feature-showcase document.

## Running tests

```bash
npm test                # Vitest unit + integration tests
npx playwright test     # Playwright end-to-end browser tests
```

Both suites must pass before a PR can merge (CI enforces this).

## Branching model — GitFlow with milestone release branches

- **`main`** holds only released, tagged code. Never target `main` with feature PRs.
- **`release/vX.Y.Z`** is the integration branch for a milestone. All work scoped to
  that milestone lands here.
- **`feature/<name>`** branches off the open `release/vX.Y.Z` branch and PRs back
  into it.
- **`hotfix/vX.Y.(Z+1)`** branches off `main` for urgent fixes.

So: base your PR on the current open `release/vX.Y.Z` branch, not `main`.

## Definition of done

A PR is ready when:

1. It's based on the correct release branch (see above).
2. `npm test` and `npx playwright test` are green. **Every user-facing command or
   feature ships with a Playwright e2e case in the same PR** — unit coverage alone
   is not enough.
3. `CHANGELOG.md` has an entry under the milestone's version heading.
4. `README.md` command tables and the feature list reflect what was built.
5. Screenshots in `docs/screenshots/` are retaken if the UI changed.

## Filing issues

Use GitHub issues. For bugs, include the steps to reproduce, what you expected, and
what happened — a document URL pattern and the keystrokes involved help a lot for a
keyboard-first editor.

## License

By contributing you agree that your contributions are licensed under the
[AGPL-3.0-only](LICENSE) license that covers the project.
