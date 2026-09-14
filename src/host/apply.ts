/**
 * Host half — the wiring.
 *
 * Mounts one thing behind the `collapse-multiline` plugin row: the
 * `collapse-multiline` settings namespace (`./settings.ts`) — base layer =
 * the bundle row's config, edited by the Settings → Plugins card. Every
 * field defaults, so stored snapshots from earlier builds resolve unchanged.
 *
 * Everything else — the whole collapse feature — lives browser-side in the
 * emitted bundle: it watches the composer's DOM after DSH's own paste
 * pipeline commits and never touches session state.
 */
import { installSettingsSection } from "./settings.js";
import type { Settings } from "./schema.js";
import type { PluginContext } from "./types/index.js";

/**
 * Install the settings section.
 *
 * @param ctx - plugin context.
 * @param config - validated base layer (the bundle row's config).
 */
export function apply(ctx: PluginContext, config: Settings): void {
    installSettingsSection(ctx, config);
}
