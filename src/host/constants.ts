/**
 * Host half — fixed identifiers.
 *
 * These strings are contracts with the browser half (mirrored in
 * `src/client/plugin-meta.ts` — the browser bundle cannot import this file)
 * and with the bundle patch (the row id equals the settings namespace).
 */

/** npm id of this bundle. */
export const PLUGIN_ID = "@comecaramelos/dsh-collapse-multiline-paste";

/** Settings namespace served by this half; also the card's slot key. */
export const SETTINGS_NAMESPACE = "collapse-multiline";
