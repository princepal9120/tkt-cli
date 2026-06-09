# Contributing to tkt-cli

Thanks for your interest. All contributions welcome — bug fixes, new commands, better fingerprinting, docs.

## Setup

Requires [Bun](https://bun.sh) ≥ 1.0.

```bash
git clone https://github.com/princepal9120/tkt-cli
cd tkt-cli
bun install
bun run dev -- --help   # run from source
bun test                # run tests
```

## Project layout

```
src/
  index.ts          # CLI entry, registers all commands
  models.ts         # shared types
  config.ts         # ~/.tkt/config.json read/write
  metrics.ts        # analytics computations (pure, tested)
  auth/
    browser.ts      # cookie extraction from Chrome/Brave/Firefox
  client/
    index.ts        # TikTok API client
    endpoints.ts    # API URLs + base params
    fingerprint.ts  # Chrome headers, X-Bogus signing, jitter
  commands/         # one file per command group
  output/           # table/JSON formatters
```

## Making changes

- **New command:** add a file in `src/commands/`, register it in `src/index.ts`.
- **API endpoint:** add to `src/client/endpoints.ts`, implement method in `src/client/index.ts`.
- **Bug fix:** reproduce with a test in `src/metrics.test.ts` (or a new test file) first, then fix.

## Code style

- TypeScript strict mode (`tsconfig.json`).
- No comments unless the *why* is non-obvious.
- Run `bunx tsc --noEmit` before opening a PR — CI will reject type errors.

## Pull requests

1. Fork → branch off `main` → open PR against `main`.
2. One logical change per PR. Keep diffs small.
3. If you're adding a command, update `README.md` with a usage example.
4. Don't commit the `tkt` binary — it's in `.gitignore`.

## Reporting issues

Use the GitHub issue tracker. For bugs, include:
- OS and browser
- `tkt --version` output
- The exact command and error
- Whether `tkt login` succeeded (`tkt status` output)

## License

MIT. By contributing you agree your code will be released under the same license.
