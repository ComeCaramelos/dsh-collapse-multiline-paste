/**
 * Browser half — identity and the services the shell must resolve.
 *
 * The identifiers are contracts with the host half: the settings namespace
 * key is also the card's slot key, the locale namespace is the lookup root
 * for every string this half renders, and the plugin id tags the injected
 * styles. The browser half is emitted as its own bundle and cannot import
 * ./host/constants.ts, so they are mirrored here — keep both sides in step.
 */

/** Fixed settings namespace served by the host half; also the slot key. */
export const SETTINGS_NAMESPACE = "collapse-multiline";

/** Locale dictionary namespace this half registers and renders from. */
export const LOCALE_NAMESPACE = "collapseMultiline";

/** npm id of this bundle; tags the injected `style` elements. */
export const PLUGIN_ID = "@comecaramelos/dsh-collapse-multiline-paste";

/**
 * Services the shell must resolve before `apply` runs: the slots service
 * (where the card is registered), the locale service (copy) and the
 * settings scope (the card's and the DOM engine's whole data source).
 */
export const inject = ["slots", "locale", "settingsScope"];
