/**
 * Card half — the `active` switch block.
 *
 * The reference cards' `LogOutputToggle` shape, byte for byte: a `.catalog`
 * block carrying the two-row field — the title inline with the switch, the
 * hint full-width below — so the section reads exactly like the numeric
 * field blocks (and inherits the same seam rule: only the block-to-block
 * seam draws a hairline). The Switch primitive renders only the control and
 * names it through `label`, which becomes the control's aria-label. The
 * overridden marker and its reset link sit inside the field row, between
 * the title and the control — the one thing the reference's pure toggle
 * carries nothing for, so it rides the reference `.badge` / `.linkButton`
 * vocabulary.
 */
/// <reference path="../shell-modules.d.ts" />
import { jsx, jsxs } from "react/jsx-runtime";
import { Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import { CSS } from "../styles/card.js";

/** The one card field that is a switch rather than a text row. */
export function ActiveToggle(props: any): any {
    var t = props.t;
    return jsxs("div", {
        className: CSS.catalog,
        children: [
            jsxs("div", {
                className: CSS.field,
                children: [
                    jsxs("div", {
                        className: CSS.fieldRow,
                        children: [
                            jsx("span", { className: CSS.fieldTitle, children: t("active") }),
                            props.overridden
                                ? jsx("span", { className: CSS.badge, children: t("overridden") })
                                : null,
                            props.overridden
                                ? jsx("button", {
                                    type: "button",
                                    className: CSS.linkButton,
                                    disabled: props.disabled,
                                    onClick: () => {
                                        if (typeof props.reset === "function") props.reset();
                                    },
                                    children: t("reset")
                                })
                                : null,
                            jsx("span", {
                                className: CSS.toggleLabel,
                                children: jsx(Switch, {
                                    checked: props.checked,
                                    label: t("active"),
                                    disabled: props.disabled,
                                    onChange: () => {
                                        if (typeof props.onChange === "function") props.onChange();
                                    }
                                })
                            })
                        ]
                    }),
                    jsx("div", { className: CSS.fieldDesc, children: t("activeHint") })
                ]
            })
        ]
    });
}
