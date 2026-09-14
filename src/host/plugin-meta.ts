/**
 * Host half — identity.
 *
 * The cordis row identity: the row id names the plugin inside the profile
 * bundle. `inject` is empty because this half mounts nothing service-side —
 * the whole feature is browser-side; only the settings section installs.
 */

import { SETTINGS_NAMESPACE } from "./constants.js";

/** Row id: the cordis row id in the profile bundle (equals the namespace). */
export const name = SETTINGS_NAMESPACE;

/** No host-side services: pure settings section. */
export const inject: string[] = [];
