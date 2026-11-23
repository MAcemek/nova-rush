# Contributing

Bug reports and pull requests are welcome.

## Setup

Use Node 24 (see `.nvmrc`), then:

```
npm install
npm run dev
```

## Before opening a pull request

```
npm test
npm run build
```

For changes to spawning, scoring or collisions, also run `npm run fuzz -- --runs 500`.

## Rules for `src/core/`

The server replays runs with the same simulation code as the client, so `src/core/` must stay deterministic:

- No DOM, three.js or Node APIs.
- No `Math.random`, `Date` or `performance`. Use the seeded RNG streams.
- No `Math.sin`, `Math.pow` and similar functions, which can differ between engines. Use the helpers in `src/core/fmath.ts`.

`tests/imports.test.ts` and `tests/determinism.test.ts` guard these rules.
