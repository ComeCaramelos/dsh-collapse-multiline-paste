# dsh-collapse-multiline-paste — Plan (v2 — recon verificado)

Plugin para DeepSeek Harness (DSH) que comprime el pegado de texto multilínea en la caja de chat del GUI Web dentro de una **etiqueta colapsable** con resumen `X chars / Y lines` para mantener el input visualmente limpio. El texto completo sigue enviándose tal cual al modelo.

Estado: **Fase 0 ✔ (recon estático, DSH 0.1.5-rc.2) · Fase 1 ✔ (implementación + tests 21/21)** · Fase 2 pendiente (deploy + E2E manual).

> ⚠️ La v1 de este plan asume un `<textarea>` con `selectionStart`. **Erróneo**: el composer es un editor **Lexical** (`contenteditable`). Esta v2 sustituye toda la arquitectura basada en textarea.

---

## 1. Objetivo

1. Al pegar texto multilínea (>= umbral configurable) en el composer del GUI Web, las líneas se **colapsan visualmente**: el input muestra una primera línea recortada + una etiqueta `X chars / Y lines` (badge) en vez de N líneas.
2. La etiqueta es **colapsable**: clic → expande el contenido completo en el mismo sitio.
3. El **texto íntegro sigue en el draft**: lo que se envía al modelo, la persistencia de draft y el trigger pipeline (`/` y `@`) funcionan sin cambios.
4. **Configurable desde Settings → Plugins**: master switch + umbrales de líneas/chars.
5. **Fail-open total**: si algo falla, el composer stock queda intacto.

Fuera de scope (v2): persistencia del estado colapsado entre recargas, auto-colapso de texto escrito (solo paste), formato Markdown de la etiqueta.

---

## 2. Recon verificado (contra `0.1.5-rc.2`, todo citado a línea en §11)

### 2.1 El composer es Lexical, no un textarea

- El composer es un editor **Lexical plain-text** (`@lexical/plain-text`, `@lexical/history`, `@lexical/clipboard`, `lexical@0.49.0` inline en el bundle de `@deepseek-ai/dsh-client-ui-conversation`).
- El root editable es un `<div>` React con **`data-composer-input="true"`**, `role="textbox"`, `aria-multiline="true"`, `contenteditable` (componente `ComposerContentEditable`): **no hay `<textarea>` en ninguna parte**.
- El contenido del draft son **nodos Lexical**: cada línea = un nodo `Paragraph` (renderizado como `<div>` hijo del root, sin clases CSS).
- **El editor vive en el DOM**: `rootEl.__lexicalEditor` → instancia `LexicalEditor` completa (verificado en los internos de Lexical: asignación en `setRootElement` y accessor `getEditorFromElement`).

### 2.2 Flujo de paste completo (todo interceptado por DSH ya)

```
DOM `paste` (sobre el root contenteditable)
  → listener de Lexical ["paste", onPaste]
    → dispatch PASTE_COMMAND
      → handler registrado por DSH (registerComposerKeymap, prioridad 4)
        → clipboardData.getData("text/plain") + files
        → handlers.intakeFiles(files)  (si hay archivos)
        → handlers.pasteText(text)
          → InputBar: if (!machineBusy && !locked) keyboard.paste(text)
            → SessionInputShell.paste(text):
                clean = text.replace(/[\uE100-\uE11D\uFFFC]/gu, "")   // saneado PUA
                applyEdit(() => $getSelection().insertText(clean), tag: "paste")
```

Consecuencias:

- **El texto pegado siempre entra como nodos de texto reales** (paragraphs por línea), con `discrete: true` y tag de historia `"paste"` (1 undo = 1 paste).
- DSH ya **consume el evento paste** (preventDefault + retorno `true`). El plugin **no debe** `preventDefault` ni competir: deja pasar el paste y trabaja **después** del commit.
- El saneo PUA (`REFERENCE_PLACEHOLDER_RE`) puede alterar levemente el texto vs. el clipboard; la detección de región debe comparar contra el texto **ya insertado** (diff del DOM), no contra el raw del clipboard.

### 2.3 Proyección del draft — LA restricción dura

`SessionInputShell.onEditorUpdate()` → `$projectComposer()` → `$composerLayout()`, un walk del árbol Lexical que construye dos proyecciones de texto:

| Nodo en el tree | `detectText` (triggers/caret) | `clipboardText` (draft/submit) |
|---|---|---|
| `TextNode` (incl. subclass `TextRefNode`) | texto completo | texto completo |
| `LineBreakNode` | `\n` | `\n` |
| `ReferenceChipNode` (decorator inline) | `U+FFFC` (1 char) | `chip.getTextContent()` |
| `ElementNode` | recursión | recursión |
| **cualquier otro nodo** | **NADA** | **NADA** |

Las gaps `\n` entre párrafos solo se añaden a nivel root. **Todo lo que no sea text/linebreak/chip/element se pierde del draft.**

→ **Consecuencia de diseño:** el texto pegado DEBE seguir viviendo en nodos `TextNode`/`Paragraph`. El colapso **no puede** ser un nodo custom (decorator: texto perdido; element-wrapping: se pierden los `\n` entre párrafos internos). **El colapso debe ser 100% DOM/CSS, sin modificar el estado de Lexical.**

### 2.4 `data-lexical-slot` (viable pero NO elegido)

Lexical salta DOM children con `data-lexical-slot` en sus cálculos de anclaje (insert-after y first-child anchor). Se consideró inyectar un `<details>`/badge dentro del contenteditable; **descartado**: en párrafos text-only, Lexical actualiza el texto por fast-path (`__lexicalTextContent`) que puede reescribir `textContent` del contenedor y borrar el elemento inyectado; y el índice heurístico de inserción se desincroniza con slot-hijos ajenos al estado. **Cero DOM ajeno dentro del contenteditable** es la postura final.

### 2.5 Anclas DOM del composer

```
div[data-composer-card].card
├─ div.overlayAnchor            (slot conversation.input.overlay — menú de triggers)
├─ div.accessory?
├─ [slot conversation.input.attachments]
├─ div.scroll[data-input-scroll]
│  └─ div.grow
│     ├─ div[data-composer-input][role=textbox][contenteditable]   ← ROOT LEXICAL
│     │   ├─ div                  (párrafo 1)
│     │   ├─ div                  (párrafo 2)
│     │   └─ ...
│     ├─ div.placeholder[data-composer-placeholder]?   (solo draft vacío)
│     └─ [DecoratorPortals → chips]
└─ div.row (tools + send)
```

Selectors estables del plugin: `[data-composer-input]`, `[data-composer-card]`, `[data-input-scroll]`. Los párrafos son `[data-composer-input] > div` (todo hijo `div` del root es párrafo en plain-text).

### 2.6 Patrón de settings (verificado en `@comecaramelos/dsh-ask-before-compact`)

- **Host** (`lib/index.js`): `installSection(ctx, NAMESPACE, SettingsSchema, baseConfig, { setSource, validate, onChange })` sobre el service `settings`; `Config = SettingsSchema` (row config = base layer).
- **Client** (`lib/client.js`): `inject = ["slots", "locale", "settingsScope"]`; `ctx.settingsScope.bind({ namespace })` → `getSnapshot() / subscribe(fn) / set(field, val) / unset(field)`; card registrada en el slot **`settings.plugin.item`** con `key = NAMESPACE`; `ctx.locale.register(NS, { en, zh })`.
- CSS de plugins: `<style data-plugin-css="..." data-plugin="name">` en `document.head`.

### 2.7 Identidad del paquete

- Nombre npm: **`@comecaramelos/dsh-collapse-multiline-paste`** (scope de autor, como `@comecaramelos/dsh-ask-before-compact`; los `@roberto/*` son la familia antigua).
- Cordis row id: `collapse-multiline` (id estable de la row, sin prefijo de scope).

---

## 3. Arquitectura final: "colapso CSS post-paste + badge externo"

```
┌────────────────────────── BROWSER (bundle client) ──────────────────────────┐
│  lib/client.js (ModuleLoader, inject: slots/locale/settingsScope)          │
│                                                                             │
│  1. PASTE SIGNAL                                                            │
│     document.addEventListener("paste", h, {capture:true})                   │
│       target.closest('[data-composer-input][contenteditable="true"]') ?     │
│         pending = { text: clipboardData.getData("text/plain"),              │
│                     baseline: rootText() }                                  │
│         (NUNCA preventDefault: el pipeline DSH corre intacto)               │
│                                                                             │
│  2. COMMIT WATCH                                                            │
│     MutationObserver(root, {childList, characterData, subtree})             │
│       debounce ~80ms (quiet):                                               │
│         a) si pending && thresholdOK: detectRegion → collapseRegion         │
│         b) auto-expand: mutación de contenido en párrafo de región colapsada│
│         c) cleanup: párrafo de región eliminado → destruir región/badge     │
│                                                                             │
│  3. REGION STATE (Map<firstParaEl, Region>)                                 │
│     Region = { paras: El[], chars, lines, badgeEl, collapsed: true }        │
│     collapseRegion: classList.add("cm-p","cm-p-first") en los párrafos      │
│     expandRegion:  classList.remove + badge.remove()                        │
│                                                                             │
│  4. BADGE (portal body, position:fixed)                                     │
│     div.cm-badge "N chars / M lines ▾" anclado al rect del 1er párrafo     │
│     re-posiciona: scroll(capture) + resize + quiet del observer             │
│     click → expandRegion (toggle)                                          │
│                                                                             │
│  5. SETTINGS (namespace "collapse-multiline")                               │
│     active / minLines / minChars — leídos en cada paste (scope.subscribe    │
│     solo invalida caché); card en settings.plugin.item, key = namespace    │
│                                                                             │
│  6. CSS  <style data-plugin-css>  .cm-p / .cm-p-first / .cm-badge          │
│                                                                             │
│  Fail-open: try/catch global → si lanza: disconnect observers, inerte.      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Por qué esta arquitectura (descartes documentados)

| Enfoque | Veredicto | Motivo (verificado) |
|---|---|---|
| Manipular `<textarea>.value` (plan v1) | ❌ | No existe textarea; es Lexical contenteditable |
| Nodo decorator custom en Lexical | ❌ | `$composerLayout` descarta decoradores ajenos → **texto perdido del draft** |
| Element-node wrapper `<details>` | ❌ | Los `\n` entre párrafos internos no se proyectan (gaps solo a nivel root) → contenido corrompido |
| Slot-DOM inyectado en contenteditable | ❌ | Fast-path `__lexicalTextContent` puede reescribir `textContent`; desincronización de índices |
| **CSS post-paste + badge externo** | ✅ | Cero mutación del estado Lexical; el texto es 100% real (draft/undo/submit/persistencia intactos); fail-open trivial |

### 3.2 Detección de región

Tras el commit quiet con `pending`:

1. `paras = root.querySelectorAll(":scope > div")` → array de elementos párrafo (orden document).
2. `texts = paras.map(p => p.innerText)` (innerText de un div = su texto; los gaps `\n` entre párrafos se añaden al unirse).
3. Región = **máxima corrida contigua** de `texts[i..j]` tal que `join("\n") === pending.textSaneado`, donde `pending.textSaneado = pending.text.replace(PUA_RE, "")` (mismo saneo que `facade.paste`). Fallback (si el saneo/IME lo desajusta): la corrida más larga cuyo join sea sub-secuencia contigua del diff `inserted = diffInsertion(baseline, current)` y cumpla umbral.
4. Umbral: `lines = join.split("\n").length >= minLines` **y** `chars = join.length >= minChars` (default `minChars=0` → solo importa líneas).

`diffInsertion(prev, next)`: common-prefix/suffix → sub-secuencia insertada (pure, testeable).

### 3.3 Reglas de interacción

- **Expandir**: clic en badge → `expandRegion` (retira clases, borra badge). El contenido queda como texto normal (editable, seleccionable).
- **Auto-expand**: cualquier mutación de contenido (characterData/childList) dentro de un párrafo de una región colapsada → expandir esa región. (Quien edita el bloque debe verlo.)
- **Eliminar**: párrafo de región eliminado (subtree removal) → si >=1 párrafo restante, la región queda expandida (clases en los sobrevivientes sin badge = simplemente texto); si todos, limpiar entrada.
- **Undo**: restaura el estado Lexical; las mutaciones resultantes disparan auto-expand o cleanup. Peor caso: la región se ve expandida (fail-open).
- **Múltiples regiones**: independientes (Map por 1er párrafo); cada una su badge.
- **Workspace-trigger state** (editor null / no contenteditable): el listener de paste no aplica (guard `contenteditable="true"`).
- **Draft seed** (recarga de sesión, `setDraft`): sin `pending` → nunca colapsa. ✔

### 3.4 Qué se conserva intacto (requisitos)

- Draft enviado = `clipboardText` proyección → texto completo, líneas intactas. ✔
- Trigger pipeline (`/`, `@`): opera sobre `detectText`/caret → el texto pegado participa normal. ✔
- Undo/redo: history tags de DSH intactos (el plugin no hace `editor.update`). ✔
- Persistencia de draft (Conversation store mirror): texto plano intacto. El estado colapsado es visual, por sesión. ✔
- Paste con archivos: DSH lo gestiona (`intakeFiles`); si solo hay archivo (sin texto), no hay `pending` multiline → nada. ✔

---

## 4. Diseño de módulos (`lib/client.js`)

> **Actualización (migración TypeScript):** las fuentes son ahora
> `src/**/*.ts` (`src/core.ts` es la única fuente del core; esbuild lo
> **inlinea** en el bundle, ya no se duplica entre `core-begin/end`);
> `lib/client.js` es ahora salida de `scripts/build-client.mjs` (tsc-check
> + esbuild, idéntica anatomía a `dsh-chrome-mcp`/`dsh-hover-information`);
> el test de parity desaparece por construcción. Lo que sigue describe la
> estructura *runtime*, invariante.

```
lib/client.js (ModuleLoader lazy-CJS, tabs, strict-undefined style del resto)
├── CSS: string + tag <style data-plugin-css data-plugin> (guard querySelector)
├── pure/  (sin DOM — exportadas para test vía lib/core.js)
│   ├── PUA_RE = /[\uE100-\uE11D\uFFFC]/gu
│   ├── sanitize(text)
│   ├── countLines(text)  // "a\nb".split("\n").length ; "" → 0
│   ├── meetsThreshold(text, {minLines, minChars})
│   ├── diffInsertion(prev, next)  // {start, text} | null  (common prefix/suffix)
│   ├── findRegion(paragraphTexts, pasted)  // [i, j] | null
│   └── formatLabel(chars, lines, t)  // t("label", {chars, lines})
├── dom/
│   ├── composerRoot()       // querySelector + guards
│   ├── pasteSignal(rootEl)  // doc capture listener → {text, baseline}
│   ├── commitWatch(rootEl)  // MutationObserver + debounce quiet
│   ├── RegionStore          // Map + collapse/expand/destroy
│   └── BadgeFactory         // fixed el, rect anchoring, reposition listeners
├── settings card (React, patrón ask-before-compact)
└── apply(ctx)
    ├── css inject
    ├── scope = ctx.settingsScope.bind({namespace: NS})
    ├── DOM wiring (con re-scan ligero si el composer monta tarde:
    │   MutationObserver en document.body filtrando data-composer-input
    │   — el InputBar puede montar/desmontar por sesión)
    ├── locale.register(NS, {en, zh})
    └── slots.inject("settings.plugin.item", register card)
```

**Reconexión de composer**: el InputBar es por sesión y el root contenteditable puede montar tarde o re-montarse. Un `MutationObserver` en `document.body` (childList, subtree, filtro `data-composer-input`) re-ancla: al aparecer un root nuevo → attach paste-signal + commit-watch; al desaparecer → detach y limpiar regiones.

### 4.1 `lib/core.js`

Exporta las funciones pure para `node --test` (sin ModuleLoader): `sanitize, countLines, meetsThreshold, diffInsertion, findRegion, formatLabel`. El `client.js` las re-declara inline (el bundle client no puede `require` archivos del plugin — el ModuleLoader solo carga el módulo registrado; por eso el core se **duplica** en client.js y se comparte vía test: `test/core.test.mjs` importa `lib/core.js`; un test de parity verifica que client.js contiene la misma implementación — o, más simple, client.js no duplica: se define el core una vez en `core.js` y `client.js` lo re-exporta **embeddado** vía build step… **Decisión**: duplicar el core en client.js (es ~60 líneas) y `test/parity.test.mjs` hace AST/string-diff del bloque `/*core-begin*/…/*core-end*/` entre `core.js` y `client.js`. Simple, cero build step.

Hmm — alternativa más limpia: `client.js` es un CJS lazy en el browser; no puede importar ESM del paquete. Sí, decisión: **bloque core idéntico entreparado en ambos archivos** + test de paridad por extracción de sub-strings. (Misma filosofía que los locales inline.)

## 5. CSS (injected)

```css
/* clases del plugin: prefijo cm- para no chocar */
[data-composer-input] > div.cm-p          { display: none; }
[data-composer-input] > div.cm-p.cm-p-first {
  display: block;
  max-height: calc(1.5 * 1em);           /* una línea al alto de fuente */
  overflow: hidden;
  white-space: nowrap;                    /* anula pre-wrap de Lexical */
  text-overflow: ellipsis;
}
.cm-badge {
  position: fixed; z-index: 100;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 10px; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-bg-subtle);
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
  font-size: 11px; line-height: 1.6; user-select: none;
  box-shadow: var(--dsw-shadow-lv1);
}
.cm-badge:hover { background: var(--dsw-alias-bg-subtle-strong); }
.cm-badge .chev { transition: transform .12s ease; }
.cm-badge.expanded .chev { transform: rotate(90deg); }
```

Posición del badge: rect del 1er párrafo colapsado → `left = rect.right + 8` si cabe, si no `left = rect.left`, `top = rect.bottom + 4` (debajo de la línea). Clamp viewport 8px. Re-calc en: `scroll` (window, capture), `resize`, y cada quiet del commitWatch.

Nota `max-height: calc(1.5em)` → ajustar al `line-height` real del input en spike visual (var del composer). Fallback `1.5em`.

## 6. Settings (namespace `collapse-multiline`)

```js
const SettingsSchema = z.object({
  /** Master switch. false → pipeline stock (sin colapsos). */
  active: z.boolean().default(true),
  /** Líneas mínimas para colapsar (1–100). */
  minLines: z.number().step(1).min(1).max(100).default(3),
  /** Chars mínimos adicionales (0 = solo importa líneas). */
  minChars: z.number().step(1).min(0).max(10000).default(0),
});
export const Config = SettingsSchema;   // base layer = row config
```

Card (slot `settings.plugin.item`, key `collapse-multiline`): toggle `active` + dos numeric steppers + descripción. Semántica: cambios aplicados en vivo al siguiente paste (scope.subscribe → caché de config invalidada). Host: `installSection` estándar (setSource/validate/onChange sin efectos extra).

## 7. Estructura del repo

```
dsh-collapse-multiline-paste/
├── package.json               # @comecaramelos/dsh-collapse-multiline-paste
├── cordis.patch.yml           # row: collapse-multiline (config {})
├── lib/
│   ├── index.js               # host: apply() + SettingsSchema + installSection
│   ├── core.js                # funciones pure (fuente de verdad)
│   └── client.js              # bundle browser (ModuleLoader; core embeddado entreparado)
├── test/
│   ├── core.test.mjs          # node --test sobre lib/core.js
│   └── parity.test.mjs        # bloque core idéntico core.js ↔ client.js
├── docs/PLAN.md
├── AGENTS.md
└── README.md
```

`package.json` (patrón ask-before-compact):
- `type: module`, `main: lib/index.js`, exports `.` / `./core` / `./client`.
- `dsh.bundle.patch: ./cordis.patch.yml`.
- `dsh.client: { platform: "web", inject: ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings"] }` — **verificar en implementación**: si `inject` declara paquetes requireables (patrón skills-in-directories) vs. el `["slots","locale","settingsScope"]` de ask-before-compact (que es `inject` **export** del módulo, distinto). Hay dos `inject`: el del `dsh.client` en package.json (paquetes a meter en el bundle) y el export `inject` del módulo (services ctx). El plugin necesita **ninguno** de los paquetes adicionales: todo es DOM + ctx estándar. `dsh.client.inject: []`.
- `dependencies`: `@deepseek-ai/schemastery` (host schema). peer: `@deepseek-ai/cordis`.

`cordis.patch.yml`:

```yaml
- insert:
    - id: collapse-multiline
      name: '@comecaramelos/dsh-collapse-multiline-paste'
      config: {}
```

## 8. Criterios de aceptación

1. Pegar bloque ≥3 líneas → input muestra 1ª línea recortada + badge `X chars / Y lines`.
2. Clic en badge → se expande en el sitio (clic otra vez → vuelve a colapsar solo si el contenido no cambió… **regla**: re-colapso manual permitido; el auto-expand solo responde a mutaciones de contenido).
3. Enviar mensaje con región colapsada → el modelo recibe el texto completo con líneas.
4. Undo del paste → texto desaparece sin artefactos de badge.
5. Pegar 1–2 líneas → stock (sin colapso). Pegar archivo → stock attachments.
6. `/` y `@` triggers funcionan antes/después/debajo de una región colapsada.
7. Settings → Plugins → "Collapse multiline paste": master + umbrales; `active=false` → stock inmediato.
8. Recarga de sesión: draft persiste íntegro (sin colapso — estado visual por sesión).
9. `npm test` verde sin DSH live.
10. Fail-open: forzar error interno → composer stock (test unitario del guard).

## 9. Riesgos

| # | Riesgo | Prob. | Mitigación |
|---|---|---|---|
| R1 | `innerText` de párrafo ≠ proyección DSH (edge: linebreaks, chips en el rango) | baja | Fallback de detección por `diffInsertion` + umbral; si nada encaja → no colapsar (fail-open) |
| R2 | DSH cambia `data-composer-input` / estructura | baja | Selectores centralizados en 1 const; guard de ausencia → inerte; test de paridad de selectors en docs |
| R3 | El badge fixed desincroniza con scroll del composer | media | Re-posicion en scroll-capture + resize + quiet; clamp viewport; oculto si el root no es visible (IntersectionObserver opcional v2) |
| R4 | Lexical re-recrea DOM del párrafo al editar → clases/badge huérfanos | media | Auto-expand por mutación + cleanup por removal; región se define por elementos vivos re-consultados en cada quiet |
| R5 | IME/Safari: paste compuesto (composition) altera detección | baja | pending solo en evento `paste`; debounce 80ms > commit de IME típico; worst case = sin colapso |
| R6 | Dos pastes en <80ms: pending se sobrepone | baja | pending guarda baseline propio; la región se detecta contra el baseline del propio paste |
| R7 | `max-height` de una línea ≠ line-height real | baja | Medir `getComputedStyle` del párrafo en collapse (line-height → px); fallback 1.5em |

## 10. Fases

### Fase 0 — Recon ✔ (esta revisión)
- ✔ Composer = Lexical; paste flow; proyección; editor handle; anclas DOM; patrones settings/distribución.

### Fase 1 — Core + client ✔
1. ✔ `git init` + scaffold repo (package.json, cordis.patch.yml, .gitignore).
2. ✔ `lib/core.js` + `test/core.test.mjs` (pure functions). Nota: `diffInsertion`
   (solo-insert) quedó sustituido por `diffPaste` (decomposición total
   `prev = A + R + B`, `next = A + I + B`): un select-all paste es una
   replacement, no una inserción; el guard contra contenido no-pegado sigue
   siendo el flag `pending` (solo el evento paste lo setea).
3. ✔ `lib/client.js` (ModuleLoader; core entreparado; DOM wiring; badge; settings card)
   + `test/parity.test.mjs` (normaliza whitespace de línea: el factory re-indenta).
4. ✔ `lib/index.js` (host: schema + installSection; `setSource`/`onChange` requeridos
   por `SettingsSectionHooks`).
5. ✔ `AGENTS.md` + `README.md`.

### Fase 2 — Deploy y E2E (ejecuta el usuario)
1. `dsh plugin --profile web add link:/home/roberto/dev/dsh/dsh-collapse-multiline-paste` + restart GUI.
2. Verificación manual — checklist:
   - [ ] Pegar bloque ≥3 líneas → 1ª línea recortada + badge `X chars / Y lines`.
   - [ ] Clic badge → expande en el sitio; clic otra vez → re-colapsa.
   - [ ] Enviar con región colapsada → el modelo ve el texto completo con líneas.
   - [ ] Editar dentro de un bloque colapsado → se expande solo.
   - [ ] Undo del paste → sin artefactos de badge.
   - [ ] Pegar 1–2 líneas → stock (sin colapso); pegado de archivo → attachments stock.
   - [ ] Triggers `/` y `@` funcionan alrededor de una región colapsada.
   - [ ] Recarga de sesión → draft íntegro (sin colapso, por diseño).
   - [ ] Settings → Plugins → "Collapse multiline paste": master + umbrales; `active=false` → stock.
3. Ajuste fino de CSS (line-height, posición badge) contra el GUI real — si hace falta,
   tocar `COMPOSER_CSS` en `lib/client.js` (es el único sitio).
4. Uninstall: `dsh plugin --profile web remove @comecaramelos/dsh-collapse-multiline-paste` + restart.

## 11. Referencias de código (verificadas, DSH 0.1.5-rc.2)

| Tema | Ruta / línea |
|---|---|
| Composer root (`data-composer-input`) | `@deepseek-ai/dsh-client-ui-conversation/lib/client.js` :15146-15168 (`ComposerContentEditable`) |
| Editor en DOM (`__lexicalEditor`) | ibid. :8554, :8698, :9294 |
| PASTE_COMMAND handler DSH (pasteText) | ibid. :15259-15273 (`registerComposerKeymap`) |
| `facade.paste()` (insertText + tag "paste") | ibid. :12825-12838 |
| `setDraft` / `onEditorUpdate` / projection | ibid. :12727-12774 |
| `$composerLayout` (walk de proyección) | ibid. :12325-12400 |
| `ReferenceChipNode` (patrón decorator + getTextContent) | ibid. :11875-12016 |
| `TextRefNode` (patrón TextNode subclass + clase CSS) | ibid. :12234-12282 |
| Slot-skip DOM (`data-lexical-slot`) | ibid. :3352-3353, :3424, :4068 |
| InputBar JSX (anclas card/scroll/grow) | ibid. :16065-16128 |
| `InputBar.pasteText` wiring | ibid. :16000-16003 |
| Patrón client plugin + card settings | `~/dev/dsh/dsh-ask-before-compact/lib/client.js` :642-671, :29, :190-340 |
| Patrón host installSection + schema | `~/dev/dsh/dsh-ask-before-compact/lib/index.js` :44-78, :250 |
| Patrón package.json (scope @comecaramelos) | `~/dev/dsh/dsh-ask-before-compact/package.json` |
| Patrón cordis.patch.yml | `~/dev/dsh/dsh-skills-in-directories/cordis.patch.yml` |
| Patrón ModuleLoader seed words | `~/dev/dsh/dsh-skills-in-directories/lib/client.js` |
