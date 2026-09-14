/**
 * Card half — the settings card component.
 *
 * The exact shape the shipped reference cards compose (`dsh-docker-desktop-mcp`,
 * mirrored byte-for-byte by `dsh-chrome-mcp`): a collapsible `li` — closed by
 * default, the header its own disclosure button — the header text a name row
 * (title, the unsaved marker beside it, and the error dot) above the
 * description, the chevron on the far side. The body is catalog blocks — the
 * one-field blocks the three settings controls render as (the switch carries
 * the reference `LogOutputToggle` shape) — closing on the staged-form footer:
 * nothing reaches the host until **Save**, and **Discard** drops every staged
 * draft before collapsing the body.
 *
 * The block bodies live alongside: ./field-row.ts (the numeric fields) and
 * ./toggle.ts (the `active` switch block); the icon path lives in ./icons.ts.
 */
import { jsx, jsxs } from "react/jsx-runtime";
import * as react from "react";
import { CSS } from "../styles/card.js";
import { IntField } from "./field-row.js";
import { ActiveToggle } from "./toggle.js";
import { CHEVRON_PATH } from "./icons.js";

/** Props the slot hands down: `hooks.collapseMultilineCard` + the actions. */
interface CardProps {
    t: (key: string) => string;
    useCollapseMultilineCard: (select: (snapshot: any) => any) => any;
    edit: (field: string, raw: any) => void;
    resetField: (field: string) => void;
    discard: () => void;
    save: () => void;
}

/** The card component. */
export function CollapseMultilineCard(props: CardProps): any {
    const t = props.t;
    const state = props.useCollapseMultilineCard((snapshot: any) => snapshot);
    const openState = react.useState(false);
    const open = openState[0];
    const setOpen = openState[1];
    const bodyId = react.useId();
    if (!state.available) return null;
    const f = state.fields;
    return jsx("li", {
        className: CSS.card + (open ? " " + CSS.cardOpen : ""),
        children: [
            jsxs("button", {
                type: "button",
                className: CSS.header,
                "aria-expanded": open,
                "aria-label": t(open ? "collapse" : "expand") + ": " + t("title"),
                "aria-controls": bodyId,
                onClick: () => {
                    setOpen(!open);
                },
                children: [
                    jsxs("span", {
                        className: CSS.headText,
                        children: [
                            jsxs("div", {
                                className: CSS.nameRow,
                                children: [
                                    jsx("span", { className: CSS.name, children: t("title") }),
                                    // A card holding a staged edit announces it
                                    // beside the title, the way the reference
                                    // cards mark a pending save.
                                    state.dirty
                                        ? jsx("span", { className: CSS.badge, children: t("unsaved") })
                                        : null,
                                    state.failed
                                        ? jsx("span", {
                                            className: CSS.dot + " " + CSS.dotError,
                                            role: "img",
                                            "aria-label": t("statusError"),
                                            title: t("saveFailed")
                                        })
                                        : null
                                ]
                            }),
                            jsx("span", { className: CSS.desc, children: t("description") })
                        ]
                    }),
                    jsx("svg", {
                        width: 14,
                        height: 14,
                        className: CSS.chevron + (open ? " " + CSS.chevronOpen : ""),
                        viewBox: "0 0 14 14",
                        fill: "none",
                        xmlns: "http://www.w3.org/2000/svg",
                        children: jsx("path", { d: CHEVRON_PATH, fill: "currentColor" })
                    })
                ]
            }),
            open
                ? jsxs("div", {
                    id: bodyId,
                    className: CSS.body,
                    children: [
                        !state.writable
                            ? jsx("p", { className: CSS.readOnly, role: "status", children: t("readOnly") })
                            : null,
                        jsx(ActiveToggle, {
                            t: t,
                            checked: f.active.raw === true,
                            overridden: f.active.overridden,
                            disabled: !state.writable,
                            onChange: () => {
                                props.edit("active", !(f.active.raw === true));
                            },
                            reset: () => {
                                props.resetField("active");
                            }
                        }),
                        // The two thresholds are one section — the two halves
                        // of the collapse threshold — so they compose into the
                        // ONE catalog block, the way the reference cards put
                        // several fields inside one catalog.
                        jsxs("div", {
                            className: CSS.catalog,
                            children: [
                                jsx(IntField, {
                                    field: "minLines",
                                    state: f.minLines,
                                    label: t("minLines"),
                                    hint: t("minLinesHint"),
                                    writable: state.writable,
                                    t: t,
                                    edit: props.edit,
                                    resetField: props.resetField
                                }),
                                jsx(IntField, {
                                    field: "minChars",
                                    state: f.minChars,
                                    label: t("minChars"),
                                    hint: t("minCharsHint"),
                                    writable: state.writable,
                                    t: t,
                                    edit: props.edit,
                                    resetField: props.resetField
                                })
                            ]
                        }),
                        // The reference footer: nothing the card edits reaches
                        // the Host until Save. Discard drops the whole draft —
                        // reverting every staged value to what the host already
                        // serves — before collapsing the body.
                        jsxs("div", {
                            className: CSS.footer,
                            children: [
                                state.failed
                                    ? jsx("p", { className: CSS.footerError, role: "status", children: t("saveFailed") })
                                    : null,
                                jsx("button", {
                                    type: "button",
                                    className: CSS.footerButton,
                                    onClick: () => {
                                        if (typeof props.discard === "function") props.discard();
                                        setOpen(false);
                                    },
                                    children: t("discard")
                                }),
                                jsx("button", {
                                    type: "button",
                                    className: CSS.footerButton + " " + CSS.footerButtonPrimary,
                                    disabled: !state.dirty || state.saving || !state.writable,
                                    onClick: () => {
                                        if (typeof props.save === "function") void props.save();
                                    },
                                    children: state.saving ? t("saving") : t("save")
                                })
                            ]
                        })
                    ]
                })
                : null
        ]
    });
}
