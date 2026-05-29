# Contributing

Thanks for improving `cxstatusline`.

## Local Setup

```sh
npm install
npm run lint
npm test
```

## Development Notes

- Keep runtime dependencies minimal.
- Keep hook commands fast; the generated Codex hook timeout is one second.
- Treat transcript parsing as best-effort because Codex does not guarantee the
  transcript format as a stable hook interface.
- Prefer adding a widget to `src/widgets.js` with a focused test when exposing a
  new status value.
- Update `README.md` and `docs/roadmap.md` when adding user-facing behavior.

## Release Checklist

```sh
npm run lint
npm test
npm pack --dry-run
```
