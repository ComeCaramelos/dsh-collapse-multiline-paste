/**
 * Browser half — the settings-card stylesheet.
 *
 * Class names are built from this map; the sheet travels as a TS string
 * (no CSS-modules hashing — the class contract with the components must
 * stay literal).
 *
 * Every rule is copied byte-for-byte from the shipped reference cards
 * (`dsh-docker-desktop-mcp`'s `DockerMcpCard.module.css` /
 * `dsh-chrome-mcp`'s `ChromeMcpCard.module.css`), the two sharing one
 * sheet for their common half: the card shell, the two-row field, the
 * disclosure-free catalog blocks and their hairline seams, the link and
 * icon controls, and the staged-form footer. Only the single-rule
 * extension marked below has no reference equivalent (the natural-width
 * variant the numeric field row needs — reference rows stretch a text
 * input across a grid cell, a card field does not). All tokens come from
 * the shell's design aliases, so the card re-themes with the GUI instead
 * of shipping a palette of its own.
 */
import { PLUGIN_ID } from "../plugin-meta.js";

/** The card's class names, by role. */
export const CSS = {
    card: "cmcp_card",
    cardOpen: "cmcp_cardOpen",
    header: "cmcp_header",
    headText: "cmcp_headText",
    nameRow: "cmcp_nameRow",
    name: "cmcp_name",
    badge: "cmcp_badge",
    dot: "cmcp_dot",
    dotError: "cmcp_dotError",
    desc: "cmcp_desc",
    chevron: "cmcp_chevron",
    chevronOpen: "cmcp_chevronOpen",
    body: "cmcp_body",
    catalog: "cmcp_catalog",
    field: "cmcp_field",
    fieldRow: "cmcp_fieldRow",
    fieldTitle: "cmcp_fieldTitle",
    fieldDesc: "cmcp_fieldDesc",
    toggleLabel: "cmcp_toggleLabel",
    linkButton: "cmcp_linkButton",
    catalogInput: "cmcp_catalogInput",
    fieldRowInput: "cmcp_fieldRowInput",
    readOnly: "cmcp_readOnly",
    error: "cmcp_error",
    footer: "cmcp_footer",
    footerError: "cmcp_footerError",
    footerButton: "cmcp_footerButton",
    footerButtonPrimary: "cmcp_footerButtonPrimary"
} as const;

/** The card rules, built from the class map, as one string. */
export const CARD_CSS =
    `.${CSS.card}{border:0.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color 0.16s, background 0.16s}` +
    `.${CSS.card}:hover{border-color:var(--dsw-alias-label-dimmed)}` +
    `.${CSS.cardOpen}{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}` +
    `.${CSS.header}{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}` +
    `.${CSS.header}:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}` +
    `.${CSS.headText}{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}` +
    `.${CSS.nameRow}{align-items:center;gap:8px;min-width:0;display:flex}` +
    `.${CSS.name}{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}` +
    `.${CSS.badge}{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:1px 8px;font-size:11px;line-height:16px;display:inline-flex;align-items:center;flex:none}` +
    `.${CSS.dot}{box-sizing:border-box;corner-shape:round;border-radius:50%;flex:none;width:8px;height:8px;display:inline-block}` +
    `.${CSS.dotError}{background:var(--dsw-alias-state-error-primary)}` +
    `.${CSS.desc}{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}` +
    `.${CSS.chevron}{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform 0.16s}` +
    `.${CSS.chevronOpen}{transform:rotate(180deg)}` +
    `.${CSS.body}{border-top:0.5px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:10px;margin:0 16px;padding:12px 0}` +
    `.${CSS.catalog}{flex-direction:column;align-items:stretch;gap:10px;display:flex}` +
    `.${CSS.catalog} + .${CSS.catalog}{border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:12px}` +
    `.${CSS.field}{align-items:flex-start;gap:4px;display:flex;flex-direction:column;width:100%}` +
    `.${CSS.fieldRow}{align-items:center;gap:8px;display:flex;width:100%}` +
    `.${CSS.fieldTitle}{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px;flex:1;min-width:0}` +
    `.${CSS.fieldDesc}{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px;width:100%}` +
    `.${CSS.linkButton}{box-sizing:border-box;border:none;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:14px;align-items:center;height:28px;padding:0 10px;font:inherit;font-size:12px;line-height:18px;display:inline-flex}` +
    `.${CSS.linkButton}:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}` +
    `.${CSS.linkButton}:disabled{opacity:0.4;cursor:default}` +
    `.${CSS.linkButton}:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}` +
    `.${CSS.catalogInput}{box-sizing:border-box;border:0.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;height:28px;padding:0 10px;font:inherit;font-size:14px;line-height:22px;min-width:0;width:100%}` +
    `.${CSS.catalogInput}::placeholder{color:var(--dsw-alias-label-dimmed)}` +
    `.${CSS.catalogInput}:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}` +
    `.${CSS.catalogInput}:disabled{opacity:0.6;cursor:default}` +
    `.${CSS.fieldRowInput}{flex:none;width:auto;max-width:140px}` +
    `.${CSS.toggleLabel}{align-items:center;display:inline-flex;flex:none}` +
    `.${CSS.readOnly}{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px}` +
    `.${CSS.error}{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:1.5}` +
    `.${CSS.footer}{border-top:0.5px solid var(--dsw-alias-border-l2);align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 0;display:flex}` +
    `.${CSS.footerError}{color:var(--dsw-alias-label-error);text-align:right;min-width:0;flex:1;margin:0;font-size:12px;line-height:1.5}` +
    `.${CSS.footerButton}{border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-secondary);background:transparent;padding:5px 14px;font-size:13px;line-height:1.5}` +
    `.${CSS.footerButton}:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}` +
    `.${CSS.footerButton}:disabled{cursor:default;opacity:0.4}` +
    `.${CSS.footerButton}:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}` +
    `.${CSS.footerButtonPrimary}{color:var(--dsw-alias-bg-layer-3);font-weight:600;background:var(--dsw-alias-label-primary);border-color:transparent}` +
    `.${CSS.footerButtonPrimary}:hover:not(:disabled){color:var(--dsw-alias-bg-layer-3);background:var(--dsw-alias-label-secondary);border-color:transparent}`;

/** Style-tag identity: stable across reloads, unique per document. */
const TAG_ID = `${PLUGIN_ID}/CollapseMultilineCard.module.css`;

/** Ensure the sheet exists in this document; a no-op without a DOM. */
export function ensureCardStyles(): void {
    if (typeof document === "undefined") return;
    if (document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) !== null) return;
    const tag = document.createElement("style");
    tag.dataset.plugin = PLUGIN_ID;
    tag.dataset.pluginCss = TAG_ID;
    tag.textContent = CARD_CSS;
    document.head.appendChild(tag);
}
