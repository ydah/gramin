# Contributing

Work in the order defined by the contracts:

1. Keep Grammar IR and features types, schemas, validation, and documentation in
   `packages/core` and `docs`.
2. Preserve the dependency direction
   `core <- (frontend-* | analyzer | reporter) <- cli`; import packages only through
   their public entry points.
3. Add or update fixture-to-IR and IR-to-features golden tests with behavior changes.
4. Record unsupported or lossy source constructs as diagnostics.
5. Define every metric in `docs/metrics-catalog.md` before implementing it.

Before committing, run:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
scripts/fetch-corpus.sh
pnpm benchmark:corpus
```
