/**
 * Card half — the numeric field row.
 *
 * The reference cards' two-row field, read through the one field a numeric
 * threshold carries: the field row (title, the overridden marker beside the
 * reset link, and the control inline), the description full-width below. It
 * is a plain `.field` block — the two thresholds compose into the ONE
 * catalog block (they are one section: the two halves of the collapse
 * threshold), exactly the way the reference cards compose several fields
 * inside one catalog. The input is the reference `catalogInput` — the same
 * bordered 28px box the row lists use — kept at its natural width by the
 * field-row variant, since a card field stretches a control across the row
 * instead of a grid cell. The hint line swaps to the reference error line
 * while the draft is outside the field's range.
 */
import { jsx, jsxs } from "react/jsx-runtime";
import { CSS } from "../styles/card.js";
import type { FieldState } from "./controller.js";

/** Props the numeric row takes. */
interface IntFieldProps {
    field: string;
    state: FieldState;
    label: string;
    hint: string;
    writable: boolean;
    t: (key: string) => string;
    edit: (field: string, raw: string) => void;
    resetField: (field: string) => void;
}

/** One numeric settings field — a plain `.field`, composed into a catalog by the card. */
export function IntField(props: IntFieldProps): any {
    const field = props.field;
    const state = props.state;
    return jsxs("div", {
        className: CSS.field,
        children: [
            jsxs("div", {
                className: CSS.fieldRow,
                children: [
                    jsx("span", { className: CSS.fieldTitle, children: props.label }),
                    state.overridden
                        ? jsx("span", { className: CSS.badge, children: props.t("overridden") })
                        : null,
                    state.overridden
                        ? jsx("button", {
                            type: "button",
                            className: CSS.linkButton,
                            disabled: !props.writable,
                            onClick: () => {
                                props.resetField(field);
                            },
                            children: props.t("reset")
                        })
                        : null,
                    jsx("input", {
                        className: CSS.catalogInput + " " + CSS.fieldRowInput,
                        type: "text",
                        inputMode: "numeric",
                        value: state.raw,
                        "aria-label": props.label,
                        title: state.raw === "" ? void 0 : state.raw,
                        disabled: !props.writable,
                        spellCheck: false,
                        autoComplete: "off",
                        autocapitalize: "off",
                        onChange: (event: any) => {
                            props.edit(field, event && event.target ? String(event.target.value ?? "") : "");
                        }
                    })
                ]
            }),
            state.invalid
                ? jsx("p", { className: CSS.error, role: "status", children: props.t("invalid") })
                : jsx("div", { className: CSS.fieldDesc, children: props.hint })
        ]
    });
}
