/**
 * @comecaramelos/dsh-collapse-multiline-paste — host half, public surface.
 *
 * Collapse multiline paste: a multiline paste in the Web composer collapses
 * to one clamped line plus an expandable `X chars / Y lines` badge,
 * configured from a Settings → Plugins card.
 *
 * The whole feature lives browser-side (the emitted `lib/client.js`): it
 * watches the composer's DOM after DSH's own paste pipeline commits and
 * never touches session state. This half only serves the
 * `collapse-multiline` settings namespace (master switch + thresholds) so
 * the client card and the paste watcher read the same values.
 *
 * Persistence boundary: the only durable state is the `collapse-multiline`
 * settings namespace — `active`, `minLines`, `minChars` — every field
 * defaulting so stored snapshots from earlier builds resolve unchanged.
 *
 * One plugin instance per dsh host: the settings namespace is fixed.
 *
 * Everything behind this surface lives in ./host/*:
 *
 *   ./host/apply.ts        the wiring (settings section only)
 *   ./host/settings.ts     namespace install (base layer = the row config)
 *   ./host/schema.ts       the settings-section schema
 *   ./host/plugin-meta.ts  row identity (name + inject)
 *   ./host/constants.ts    fixed identifiers
 *   ./host/types/          shared type sections
 */

// ── identity ────────────────────────────────────────────────────────────────
export { inject, name } from "./host/plugin-meta.js";

// ── fixed identifiers ───────────────────────────────────────────────────────
export { PLUGIN_ID, SETTINGS_NAMESPACE } from "./host/constants.js";

// ── the settings section ────────────────────────────────────────────────────
export { Config, SettingsSchema } from "./host/schema.js";

// ── the wiring ──────────────────────────────────────────────────────────────
export { apply } from "./host/apply.js";

// ── the shared views ────────────────────────────────────────────────────────
export type { Settings } from "./host/schema.js";
