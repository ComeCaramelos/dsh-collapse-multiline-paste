# AGENTS.md

Collapse-multiline-paste plugin for DeepSeek Harness (DSH): a multiline paste
in the Web composer collapses into an inline `X chars / Y lines` pill — a
registered chip marker that rides the draft exactly like the `@file` reference
chip, click-to-expand/collapse. Configurable from a UI card.

TypeScript sources (`src/*.ts`, same anatomy as `dsh-chrome-mcp` /
`dsh-hover-information`); `lib/**` is build output, never hand-edit. Build:
`npm run build` (host `tsc` + client `tsc -p src/client/tsconfig.json`
typecheck → esbuild bundle); `npm test` builds then runs `node --test`.

## Layout

Sources (TypeScript):

- `src/index.ts` — host half entry (built to `lib/index.js`, ESM `main`).
  Re-exports identity (`name`, `inject = []`), `PLUGIN_ID`,
  `SETTINGS_NAMESPACE` (`collapse-multiline`), `Config` / `SettingsSchema`
  (schemastery) and `apply`. Host services: none — the whole feature is
  browser-side.
- `src/host/` — host half: `apply.ts` (wiring: settings section only),
  `settings.ts` (namespace install, base layer = the row config),
  `schema.ts` (the section schema + `Settings` view), `plugin-meta.ts`
  (row id), `constants.ts` (fixed identifiers), `types/` (structural
  service faces).
- `src/core.ts` — pure core (no DOM, no deps): `sanitize`, `countLines`,
  `meetsThreshold`, `diffPaste`, `locateLeaves` + their views. One source of
  truth: `tsc` also emits it to `lib/core.js` for the node tests (`./core`
  export), and esbuild INLINES it into the browser bundle — no embedded copy
  to keep in step any more.
- `src/client/` — browser half (emitted by esbuild to `lib/client.js`, CJS
  **factory bundle**, `./client` export). Modules the bundle collapses:
  `index.ts` (surface: `apply` + `inject`), `plugin-meta.ts` (identifiers
  mirrored from the host half — the bundle cannot import `src/host/*`),
  `constants.ts` (DOM selectors/timings, field specs), `apply.ts` (mount:
  stylesheets, locales, inline-chip engine, card controller, slot registration),
  `engine/` (`chip.ts` (the registered inline chip node + its DOM face),
  `doc.ts` (state-level leaf hide/show, line-break folding, leaf-span
  location), `engine.ts`, `config.ts` — the composer
  watcher), `card/` (`controller.ts`, `card.ts` — the card composed exactly
  like the `dsh-docker-desktop-mcp` / `dsh-chrome-mcp` reference cards,
  `toggle.ts` (the `active` switch block in the reference `LogOutputToggle`
  shape), `field-row.ts` (the two numeric two-row fields, composing into
  one catalog block), `icons.ts` — the Settings card), `locales/` (`en-US.ts`, `zh-CN.ts`),
  `styles/` (CSS as TS strings, DOM-checked per document; the card sheet
  copies the reference cards' shared stylesheet byte-for-byte), `types.ts`,
  `shell-modules.d.ts` (structural views for the shell-seeded modules).
  The bundle keeps `react`, `react/jsx-runtime`,
  `@deepseek-ai/dsh-client-store` and `@deepseek-ai/dsh-client-ui-primitives`
  external; everything else is inlined.
- `scripts/build-client.mjs` — esbuild: CJS output, `platform: "neutral"`,
  the baseline ids external, wrapped in the
  `window.__ModuleLoader__.load({ id, factory: (require) => … })` prologue
  and epilogue.
- `tsconfig.json` — host emit (`src/index.ts` + `src/host/**` +
  `src/core.ts` → `lib/`, NodeNext, declarations).
  `src/client/tsconfig.json` — browser typecheck only (noEmit; DOM lib;
  imports resolve against `shell-modules.d.ts` + `src/core.ts`).
- `cordis.patch.yml` — inserts the `collapse-multiline` row with `config {}`
  (schema defaults are the base layer). Applied as a bundle patch via
  `dsh.bundle.patch` in `package.json`.
- `test/core.test.mjs` — `node --test` unit tests over `lib/core.js`
  (no DOM needed).
- `test/client.test.mjs` — loads the emitted `lib/client.js` bundle over a
  `__ModuleLoader__` + DOM stub: export surface, stylesheet injection,
  dictionary registration and the slot/engine wiring.
- `test/chip-engine.test.mjs` — drives the full collapse cycle against a
  Lexical-shaped document stub (node model + `__lexicalEditor` surface):
  fold, face anatomy/CSS parity, merge, click toggle, whole-chip Backspace.
- `docs/PLAN.md` — architecture, verified recon (DSH 0.1.5-rc.2), risks.
- `docs/LEARNT.md` — DSH plugin development findings (anatomy, composer/Lexical
  constraints, paste pipeline, settings, deploy, risk checklist).

## Hard constraints (do not break)

- **No DOM surgery under the root; state-level mutations only.** The
  composer is a Lexical plain-text editor and DSH's draft projection
  (`$composerLayout` in `dsh-client-ui-conversation`) silently drops any
  node type it does not know. The chip therefore rides the editor's OWN
  decorator-node registration (one inline node, type `cm-collapse`, with
  `getTextContent()` === `""`), and the folded text is NEVER removed — it
  stays in ordinary `TextNode` leaves, hidden only with the state-level
  style `display:none` (`setStyle`). So the submitted draft stays
  byte-identical to a stock paste: unknown inline decorators contribute
  nothing to the projection, hidden-in-place text still projects exactly
  what was pasted. Every node write (hide/show style, field writes, chip
  insert/remove) happens inside one `editor.update` commit — mutating a
  node outside the update context throws or is silently dropped. Never
  `preventDefault` the paste: DSH's own pipeline must commit the text
  first; the collapse happens after, in the MutationObserver quiet window.
- **Let DSH's paste pipeline run first.** DSH already intercepts
  `PASTE_COMMAND` (keymap, priority 4) → `facade.paste()` →
  `selection.insertText(clean)`. The plugin only OBSERVES (document
  capture `paste` for the clipboard text + pre-edit baseline,
  MutationObserver quiet for the post-edit commit).
- **Collapse only on a real paste.** `engine.pending` is set exclusively
  by the document-capture `paste` listener (threshold pre-filter). Draft
  seeds (`setDraft`), undo, typing and menu edits never set it — that is
  the only guard against collapsing non-pasted content.
- **Fail-open.** `quiet()` runs in try/catch → `failOpen(error)` disposes
  everything (observers, regions, chips) and the plugin stays inert.
  Missing selectors / missing settings / any exception = stock composer.
- **Core: one source.** `src/core.ts` is the single source of truth for
  both halves (esbuild inlines it into the browser bundle; `tsc` emits it
  to `lib/core.js` for the node tests). Keep it dependency-free — no DOM,
  no browser globals, no imports — and never copy functions anywhere.
- **Fixed identifiers**: namespace/slot key `collapse-multiline`, locale ns
  `collapseMultiline`, hook prop `useCollapseMultilineCard`, root selector
  `[data-composer-input]`, chip node type `cm-collapse`, chip host DOM
  attribute `data-collapse-chip`, classes `cm-chip` / `cm-chip-icon` /
  `cm-chip-label` (plus `cm-expanded` on the face while expanded).
- **schemastery has no `z.enum`/`.optional`** — every field carries a
  `.default` so the resolved snapshot is always complete.
- The PUA sanitize (`/\uE100-\uE11D\uFFFC/gu`) must mirror
  `SessionInputShell.paste`'s `REFERENCE_PLACEHOLDER_RE` — the diff runs in
  DOM-text space where chips render their label, and pastes never contain
  PUA, but the mirror keeps the pre-filter honest.

## Deployment (link profile)

Local sources under `/home/roberto/dev/dsh/` mount only in the `plugin-dev`
profile — never in the live `web` profile, which consumes npm packages only.

```sh
dsh plugin --profile plugin-dev add link:/home/roberto/dev/dsh/dsh-collapse-multiline-paste
# restart the plugin-dev host
```

Uninstall: `dsh plugin --profile plugin-dev remove @comecaramelos/dsh-collapse-multiline-paste`
(+ restart). No row to disable: with the bundle layer gone the composer is
stock by construction.
