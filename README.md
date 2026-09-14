# @comecaramelos/dsh-collapse-multiline-paste

DSH plugin: when you paste multiline text into the Web GUI chat box, the
pasted block **collapses in place** to one inline pill — `X chars / Y
lines` — styled and handled exactly like selecting a file with `@`: the
same 22px pill, tokens, ellipsis and keyboard-atomic deletion. Click the
pill to expand (and re-collapse) the block. The input stays visually
clean; **the full text is sent to the model unchanged**.

## How it works

The composer is a Lexical plain-text editor and DSH's paste pipeline
commits the text first. The plugin only reacts:

1. a document-level `paste` listener snapshots the clipboard text and the
   pre-paste draft (never consumes the event);
2. once the composer settles (MutationObserver quiet), a prefix/suffix diff
   maps the insertion onto the document's text leaves;
3. the folded run stays in the document — its leaves are hidden **in
   place** with the state-level style `display:none` — and one inline chip
   node marks it, riding the draft right where the `@file` chip does;
4. a click folds/reveals the run; Backspace/Delete with the caret adjacent
   removes the whole pill in one keystroke (the `@` chip semantics);
   editing the hidden text expands it;

A registered inline decorator that contributes no text is a no-op for
DSH's draft projection, and text hidden in place still projects exactly
what was pasted — so what is submitted, what persists, and what the `/`
and `@` trigger pipeline see stays byte-identical to a stock paste. If
anything goes wrong the plugin disposes itself and the composer behaves
stock (fail-open).

## Install

Local sources link only in the `plugin-dev` profile (the live `web` profile
takes npm packages only).

```sh
dsh plugin --profile plugin-dev add link:/home/roberto/dev/dsh/dsh-collapse-multiline-paste
```

then **restart the plugin-dev host**.

Uninstall:

```sh
dsh plugin --profile plugin-dev remove @comecaramelos/dsh-collapse-multiline-paste
```

(+ restart).

## Settings

**Settings → Plugins → Plugin configuration → "Collapse multiline paste"**:

| Field | Default | Meaning |
|---|---|---|
| `active` | `true` | Master switch. Off → stock behaviour. |
| `minLines` | `3` | Pasted text with at least this many lines collapses (1–100). |
| `minChars` | `0` | Additionally require this many characters. `0` = lines only. |

Changes apply to the next paste. The collapse state itself is visual and
per-session: a reloaded session restores the plain draft.

## Behaviour notes

- A paste landing right against an existing collapsed run folds INTO it —
  touching runs merge into a single pill, never two side by side.
- Undo (or any external removal of the pill) just un-collapses: no hidden
  text is ever left stranded.
- Pasting files is unaffected (DSH attachment pipeline).

## Develop

TypeScript sources under `src/`; `lib/**` is build output.

```sh
npm install
npm run build     # host: tsc → lib/{index,core,host}/*.js + client: tsc check + esbuild → lib/client.js
npm test          # builds, then node --test: core units + bundle wiring + inline-chip engine
```

The pure DOM-free core lives in `src/core.ts`: `tsc` emits it to
`lib/core.js` for the node tests, and esbuild inlines the same source into
the browser bundle — one source of truth, no drift possible. See
`docs/INLINE-CHIP.md` for the chip design, `docs/PLAN.md` for the verified
architecture and `AGENTS.md` for the hard constraints.
