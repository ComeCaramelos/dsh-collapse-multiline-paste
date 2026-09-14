/**
 * Browser half — the wiring.
 *
 * Mounts the plugin's three pieces on the browser context:
 *
 * 1. The locale dictionaries (`src/client/locales/`), registered under the
 *    `collapseMultiline` namespace and bound for the badge and the card.
 * 2. The settings scope for `collapse-multiline`, bound once and read live
 *    by both the DOM engine (thresholds) and the card controller (staged
 *    writes).
 * 3. The two feature halves: the composer DOM engine, mounted as a cleanup
 *    effect (`arm`/`dispose`), and the settings card, registered through
 *    the shared `settings.plugin.item` slot.
 *
 * The whole feature is fail-open: any error inside the engine tears it down
 * to the stock composer; a missing settings service simply keeps it inert.
 */
import { LOCALE_NAMESPACE, SETTINGS_NAMESPACE } from "./plugin-meta.js";
import { DICTIONARIES } from "./locales/index.js";
import { arm, dispose } from "./engine/engine.js";
import { bindLocale, bindScope } from "./engine/config.js";
import { ensureCardStyles, ensureComposerStyles } from "./styles/index.js";
import { CollapseMultilineCardController } from "./card/controller.js";
import { CollapseMultilineCard } from "./card/card.js";
import type { PluginContext } from "./types.js";
import type { SettingsScope } from "./engine/config.js";

/**
 * Mount the settings card and arm the composer DOM engine.
 *
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: PluginContext): void {
    ensureComposerStyles();
    ensureCardStyles();
    ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, DICTIONARIES), "collapse-multiline: dictionaries");
    bindLocale(ctx.locale.bind(LOCALE_NAMESPACE));
    const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }) as SettingsScope;
    bindScope(scope);
    ctx.effect(() => {
        arm();
        return () => dispose();
    }, "collapse-multiline: DOM engine");
    const controller = new CollapseMultilineCardController(scope);
    ctx.effect(
        () => () => controller.dispose(),
        "collapse-multiline: card controller"
    );
    ctx.slots.inject("settings.plugin.item", () =>
        ctx.slots.register(
            {
                name: "settings.plugin.item",
                key: SETTINGS_NAMESPACE,
                locale: LOCALE_NAMESPACE,
                inject: () => controller.inject()
            },
            CollapseMultilineCard
        )
    );
}
