# LEARNT.md — Hallazgos del desarrollo de plugins para DSH

Conocimientos extraídos de la construcción de
`@comecaramelos/dsh-collapse-multiline-paste` contra DSH 0.1.5-rc.2
(perfil live). Citas de línea referidas al bundle live:
`~/.npm/_npx/*/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js`.

---

## 1. Anatomía de un plugin

Un plugin es **dos mitades** que comparten un namespace:

| Mitad | Archivo | Formato | Qué ve |
|---|---|---|---|
| Host | `lib/index.js` (`main`) | ESM | composición cordis, listeners, settings, token/llm services |
| Client | `lib/client.js` (`./client`) | **CJS factory bundle** | solo el navegador: DOM, React, settingsScope, slots, locale |

El client es un **bundle a mano, sin bundler**:

```js
window.__ModuleLoader__.load({
  id: "@scope/plugin-name",
  factory: (require) => {
    var react = require("react");
    var reactJsx = require("react/jsx-runtime");
    var clientStore = require("@deepseek-ai/dsh-client-store");
    // …
    exports.apply = apply;
    exports.inject = inject; // servicios que el ctx debe proveer
  }
});
```

Hechos duros:

- La factory **no puede importar archivos del paquete** (no hay resolver de
  ESM en ese contexto). La lógica compartida con el host se **inlinea**
  en el bundle en el build (pattern TypeScript: `src/core.ts` lo escribe
  esbuild en el bundle, ver §8).
- `inject = ["slots", "locale", "settingsScope", …]` declara los servicios
  del fiber que el plugin exige; cordis valida que estén presentes.
- `ctx.effect(fn, label)` registra work con teardown (se re-ejecuta y limpia
  al desmontar el ctx). Todo listener va dentro de un effect.
- `ctx.slots.inject(slotName, thunk)` + `ctx.slots.register(spec, Component)`:
  el thunk se ejecuta dentro del slot; el `spec.inject` expone hooks React
  al componente (el nombre de prop debe ser `use<CamelCase>` del spec).

## 2. El composer es Lexical, NO un textarea

**El hallazgo que más importa.** La caja de chat del GUI Web no es un
`<textarea>`: es un editor **Lexical plain-text** contenteditable.

DOM verificado (0.1.5-rc.2):

```
div[data-composer-card]
└─ div[data-input-scroll]
   └─ div.grow
      └─ div[data-composer-input][role=textbox][contenteditable]   ← root
         ├─ div   ← párrafo (todos los párrafos son hijos div directos)
         ├─ div
         └─ …
```

Consecuencias:

- No existe `selectionStart`/`value` que manipular. Todo texto es
  `TextNode` dentro de párrafos.
- El handle del editor cuelga de `rootEl.__lexicalEditor`, pero **mutar el
  estado de Lexical desde un plugin es zona prohibida** en la práctica:
  chips (`@`), triggers (`/`), el pipeline de paste y la persistencia de
  draft dependen del estado interno.
- Para cualquier feature de "ver/comportarse con el texto del input" hay dos
  caminos: (a) mutar Lexical (raro, frágil) o (b) **observar el DOM y
  decorar con CSS/DOM externo** (lo que permite features visuales sin tocar
  la semántica).

### 2.1 La restricción dominante: la proyección del draft

`$composerLayout` (client.js :12325) reconstruye el texto del draft a partir
del estado de Lexical para `detectText` y `clipboardText` (lo que se ENVÍA y
lo que persiste). Su walk solo proyecta:

- `TextNode` → texto
- `LineBreakNode` → `\n`
- `ReferenceChipNode` → `@path` (el chip DOM muestra solo la **etiqueta**)
- `ElementNode` → recursión (con los gaps de línea entre párrafos)

**Un nodo de tipo desconocido se descarta: el texto se pierde del draft.**

Esto descarta de raíz dos enfoques tentadores:

| Enfoche rechazado | Por qué falla |
|---|---|
| Nodo decorator custom (chip colapsable) | El texto pegado vive dentro del nodo → `$composerLayout` lo descarta → **el modelo no recibe lo pegado** |
| Envolver párrafos en element node (`<details>`, etc.) | Los `\n` entre los párrafos internos no se proyectan → draft corrupto |

Regla práctica: **lo que se envía se construye fuera del plugin, y el plugin
no puede permitirse crear nodos.** Una feature que "oculta" texto debe
ocultarlo en el render (CSS/classList), no en el grafo.

### 2.2 Chips y el fast-path de textContent

Los chips (`@file`) son spans `contenteditable=false` cuyo React face se
portaleariza dentro. El texto del chip en el DOM es la **etiqueta**, no el
`@path`. DSH además usa un fast-path de `textContent` y un mecanismo
`data-lexical-slot` para saltar chips. Cualquier inyección de DOM dentro de
párrafos arriesga romper ambos: otro motivo para que el plugin solo toque
clases de los párrafos y elementos **fuera** del root (badge en
`document.body`, `position: fixed`).

### 2.3 El contrato real de `updateDOM` del bundle (crash verificado)

El reconciler del bundle (`$reconcileNode` → `$updateDOM`) llama
`nextNode.updateDOM(prevNode, dom, config)`: el **primer argumento es el
nodo anterior, NO el elemento DOM**. Una cara `updateDOM(element)` que
trate arg1 como DOM revienta en cualquier commit que ensucie el nodo
(`host.children.length` sobre un nodo = `undefined.length`) — el crash
reportado pegando en la caja vacía. La cara del chip acepta las dos
formas: toma el argumento que sea elemento; si ninguno lo es, devuelve
`true` (el reconciler re-crea la cara con `createDOM`). Segundo detón:
`getWritable()` CLONA y ensucia el chip en cada pasada `reconcile` aunque
nada cambie — escribir el bit solo cuando de verdad cambia evita
reconciliaciones DOM vacías.
Tercer detón (la causa REAL de "no funciona si escribes antes"): el
texto de la región (`region.text` y el label) debe ser la franja del
run `[runStart, runEnd)`, NUNCA el texto completo de las hojas tocadas.
Con texto previo en la MISMA hoja del pegado, el `joined` de la región
incluía lo no doblado, `reconcile` lo leía como "editado" y retiraba el
chip silenciosamente (sin error ni warn). En caja vacía era inocuo porque
la hoja coincidía con la franja.

## 3. El pipeline de paste (verificado línea a línea)

```
DOM paste
 → Lexical PASTE_COMMAND (keymap DSH, prioridad 4)
 → handlers.pasteText
 → SessionInputShell.paste()            (client.js :12825)
 → sanitize PUA  /[\uE100-\uE11D\uFFFC]/gu   (REFERENCE_PLACEHOLDER_RE)
 → selection.insertText(clean)  (history tag "paste", update discrete)
```

Diseños correctos derivados:

1. **Nunca `preventDefault`**: DSH ya intercepta el paste; el plugin es
   espectador.
2. **Dos señales**: (a) listener de `paste` en `document` (fase **capture**)
   para leer `clipboardData.getData("text/plain")` y tomar el baseline del
   draft ANTES de la mutación; (b) `MutationObserver` en el root con ventana
   de quiet (~80 ms) para procesar el commit POST-mutación.
3. **El commit es asíncrono**: `applyEdit` corre dentro del propio update de
   Lexical y el DOM se materializa tras el evento; por eso el diff se hace en
   el quiet, no en el evento.
4. **El sanitize PUA debe espejar** el de `SessionInputShell.paste` para que
   el pre-filtro de umbral sea honesto.
5. **Collapse solo con flag de paste real**: el flag `pending` lo setea
   EXCLUSIVAMENTE el listener de paste. Seed de draft (`setDraft` al
   recargar sesión), undo, typing y menú nunca lo setean → es la única
   garantía de no colapsar contenido no-pegado.

## 4. Text space del diff: DOM ≠ draft

El diff entre snapshots debe correr en **DOM-text space** (innerText por
párrafo, joinado con `\n`), no en draft space:

- El diff solo compara dos snapshots del plugin (mismo proyección) → los
  chips no lo rompen (su etiqueta es constante entre snapshots).
- Los contadores del badge (chars/lines) **no** se calculan del diff: con
  selection-replacement el diff incluye texto que no era pegado. Se usan los
  datos del clipboard (`pending.clean`).

Bugs reales encontrados en la implementación del diff:

| Bug | Síntoma | Fix |
|---|---|---|
| `diffInsertion` puro (prefix/suffix, null en replace) | Select-all + paste no se detectaba (es replace: `prev = A+R+B`, `next = A+I+B`) | `diffPaste`: decomp. **total** `prev=A+R+B`, `next=A+I+B`; nunca null; el filtrado es `I !== ""` + umbral |
| Región estricta `paraEnd > start` | Paste que se funde al final de un párrafo dejaba ese párrafo fuera (visible, sin colapsar) | Inclusiva en el borde: `paraEnd >= start`… |
| …pero la inclusiva rompedora | Paste con `\n` inicial después de un párrafo colapsaba también el párrafo del usuario | Distinguir: un párrafo entra por el borde SOLO si el texto insertado **no** empieza con `\n` |
| Paridad byte-a-byte entre archivos | El factory re-indenta el core → test siempre rojo | Normalizar whitespace inicial por línea en el test de paridad |

Espacio plano: párrafo i ocupa `[pos_i, pos_i+len_i)` y el gap `\n` no
pertenece a ningún párrafo.

## 5. Settings (mitades conectadas por namespace)

**Host** — publica el namespace:

```js
ctx.inject(["settings"], (sc) =>
  sc.settings.installSection(ctx, NS, Schema, config, {
    setSource(source) { /* requerido: guardar la fuente de user-layer */ },
    onChange() { /* requerido: re-resolver/repintar */ }
  })
);
```

- `SettingsSectionHooks` **exige** `setSource` y `onChange` (faltar uno lanza).
- **schemastery no tiene `z.enum` ni `.optional`**: uniones cerradas = union
  de `z.const`; cada campo lleva `.default` (snapshot siempre completo).
- Row en `cordis.patch.yml` con `config: {}` → las defaults del schema son la
  capa base; el user-layer (Settings UI) se pisa encima.

**Client** — lee/escribe:

```js
const scope = ctx.settingsScope.bind({ namespace: NS });
scope.getSnapshot() // { status: "ready", value, user, base, writable, revision }
scope.subscribe(cb)
scope.set(field, v)  // → Promise<boolean>  (revision-fenced)
scope.unset(field)
```

Snapshot `status` puede no ser `"ready"` al arrancar: el plugin debe tolerar
settings aún no resueltos (fall-open al default).

### 5.1 El patrón de card con staged-save

Clonado de `@comecaramelos/dsh-ask-before-compact` (referencia canónica de
card en `settings.plugin.item`):

- **Drafts locales** en un `Map` (staged); el snapshot publicado =
  projection(drafts + scope).
- `clientStore.createSnapshotStore(projection())` + `store.set(...)` en cada
  cambio; el componente consume vía hook.
- `plan()` traduce staged → writes (`set`/`unset`); un draft inválido **veto**
  el save (no se desecha silenciosamente).
- Cada write se re-lee tras caer (`user[field] === val`) y la cadena se
  **revision-fencea**: si alguna write no cayó, los drafts se conservan y el
  card muestra error.
- Campo numérico: staged como **string** (input), parseado solo en `plan()`;
  draft vacío = clear del override.

## 6. Locale

```js
ctx.effect(() => ctx.locale.register(LOCALE_NS, { en, zh }), "…: dictionaries");
const t = ctx.locale.bind(LOCALE_NS);
t("label", { chars: n, lines: m })  // interpolación {param}
```

- `register` dentro de effect (idempotente); `bind` devuelve `t` que traduce
  **en el momento del uso** (puede crearse antes que el register ejecute).
- El `spec.locale` del slot register liga el dictionary al card.
- Idiomas soportados por el shell: `en` y `zh` (copiar las dos en toda card).

## 7. CSS de plugin

- Se inyecta como `<style data-plugin-css="id" data-plugin="name">` en
  `document.head`, con guard `querySelector` contra duplicados (el bundle
  puede cargarse dos veces).
- Selectores del composer: anclar a `[data-composer-input] > div.cm-…`
  (hijos directos = párrafos). Usar **variables CSS** para lo medido en
  runtime (p. ej. `--cm-line` con el `line-height` computado, fallback
  `1.5em`).
- Elementos flotantes (badge): `position: fixed` + `z-index`, **fuera** del
  root editable, con cadena de fallbacks de posicionamiento (derecho →
  izquierda → clamp; abajo → arriba → clamp 8 px) y re-posicionamiento en
  `scroll` (capture en window cubre el contenedor de scroll interno) y
  `resize`.
- Tokens del diseño: variables `--dsw-alias-*` (bg, label, border, brand) —
  no hardcodear colores.

## 8. Core puro (fuente única: `src/core.ts`)

Pattern que hace el plugin testeable sin DOM ni DSH live:

- `src/core.ts`: funciones puras sin dependencias (sanitize, count, umbral,
  diff, región). Fuente única de verdad: `tsc` lo emite a `lib/core.js`
  (testeado directo con `node --test`) y esbuild lo **inlinea** en el
  bundle browser — con TypeScript ya no hay bloque duplicado que mantener
  en paso (el parity test desapareció por construcción).
- Regla de estilo del core: igual que antes — sin DOM, sin globals, sin
  imports; así cualquiera de las dos mitades puede consumirlo.

## 9. Cordis, deploy, entorno

- `cordis.patch.yml` (insert de row con `id` = namespace) se aplica como
  bundle patch vía `"dsh.bundle.patch": "./cordis.patch.yml"` en
  `package.json`. La row no necesita disable: al desaparecer la capa del
  bundle, el feature desaparece (no hay estado residual).
- Deploy: `dsh plugin --profile web add link:/path` **y restart del GUI Web**
  (127.0.0.1:3080). El perfil live vive en `~/.dsh/profiles/web`
  (`package.json` deps `file:`/`link:` + lista de plugins).
  ⚠️ Restart del GUI corta sesiones corriendo en ese GUI — coordinar.
- HMR de client-plugin existe pero **solo** con `pnpm run dev:web` corriendo
  desde el checkout de DSH; para cambios de plugin en perfil live, la vía es
  restart.
- Sandbox workspace-write: el perfil live está fuera del workspace → el
  deploy necesita aprobación o ejecutarlo el usuario.
- Convenciones del repo (sin `.editorconfig`; siguiendo a los siblings):
  tabs en JS, LF, final newline; el bundle client usa `var` (CJS legacy
  intencional) + JSDoc; npm scope `@comecaramelos/`; commits en español
  simples ("Commit inicial: …").

## 10. Checklist de riesgo al planear un plugin

1. **¿Dónde vive el estado que la feature toca?** Si es el draft/composer →
   leer §2.1 antes de dibujar nada.
2. **¿Qué pipeline de DSH ya toca ese evento?** (paste :12825, submit
   `clipboardText`, triggers `/`/`@`.) El plugin se sube como espectador.
3. **¿Qué necesita sobrevivir al submit?** El texto → nunca crear nodos.
   ¿El look visual? → CSS/DOM externo es seguro.
4. **Fail-open por defecto**: un `try/catch` en el camino de mutación que
   dispose todo y deja el shell stock.
5. **Umbral/sinflag**: definir la señal única que habilita la feature (p. ej.
   "solo paste con flag"), para no dispararla en seed/undo/typing.
6. **Testeabilidad sin live**: core puro + paridad + tests de host con
   ctx fake; el E2E manual contra el GUI va en el PLAN con checklist.
