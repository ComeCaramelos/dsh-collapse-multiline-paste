/**
 * Host half — shared type sections.
 *
 * Everything a behavior module consumes across a file boundary lives here;
 * each section is structural (the face actually read), never the upstream
 * packages.
 */

import type { Context } from "@deepseek-ai/cordis";

/**
 * Host context as this plugin receives it. Only the plain `Context` surface
 * is consumed (`inject`); there is no reflection lookup in this half.
 */
export type PluginContext = Context;

/**
 * The `settings` service face as this half consumes it. Only the section
 * install is read: the resolved snapshot reaches the browser through the
 * `settingsScope` service the client half injects, so no host-side consumer
 * of the live value is needed.
 */
export interface SettingsService {
    /** Publish one namespace: `base` is the bundle row's config layer. */
    installSection(
        owner: Context,
        namespace: string,
        schema: unknown,
        base: unknown,
        hooks: { setSource(source: () => unknown): void; onChange(): void }
    ): void;
}
