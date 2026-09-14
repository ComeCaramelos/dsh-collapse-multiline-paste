/**
 * Browser half — the stylesheet surface.
 *
 * Both sheets travel as TS strings and are DOM-checked (idempotent per
 * document); `apply` ensures them before mounting.
 */
export { ensureCardStyles, CARD_CSS } from "./card.js";
export { ensureComposerStyles, COMPOSER_CSS } from "./composer.js";
