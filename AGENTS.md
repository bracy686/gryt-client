# Repository guidance

This is the Chinese adaptation of Gryt Client: React, TypeScript, Vite and Electron.

## Branch boundaries

- Check `git status --short --branch` before editing or committing.
- `main` mirrors `Gryt-chat/client`'s `main` exactly. Only fast-forward it from `upstream/main`; do not commit fork changes or merge `zh-cn` into it.
- Make all Chinese adaptations, fork documentation and workflow changes on `zh-cn` (or a topic branch based on it).
- `origin` is `bracy686/gryt-client`; `upstream` is `Gryt-chat/client`. Push fork work to `origin`.
- The fork's default branch is `zh-cn` so its manual Chinese packaging workflow remains available.
- See `zh/README.md` for the authoritative branch synchronization and packaging procedure.

## Development and validation

- Install dependencies: `npx yarn@1.22.22 install --frozen-lockfile --ignore-engines`.
- Start the web app: `yarn dev` (port 3666).
- Chinese desktop build: `npx cross-env GRYT_ZH=1 ELECTRON=1 vite build`.
- For translation changes, run `node --test zh/rewrite.test.mjs`, `node zh/selftest.mjs` and `node zh/check.mjs --require-ui --min-coverage 98`.
- For interactive UI changes, also run the browser check described in `zh/README.md`; choose upstream checks appropriate to application changes.
- Keep translation rules and dictionaries in `zh/`; document necessary integration changes in `zh/README.md`.
- Credentials and downloaded installers belong outside the inner Git repository. Never print or commit credentials.
