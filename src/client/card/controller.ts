/**
 * Card half — the controller.
 *
 * Stages edits over the `collapse-multiline` settings scope and writes them
 * on save. Mirrors the stock plugin cards: drafts stay local, every write
 * is revision-fenced by the scope, and a save that did not land keeps its
 * drafts.
 */
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import { FIELD_ORDER, FIELDS } from "../constants.js";
import type { SettingsScope, SettingsSnapshot } from "../engine/config.js";

/** One staged control draft: `edit` (type/text) or `clear` (reset). */
interface Staged {
    mode: "edit" | "clear";
    raw: boolean | string;
}

/** The display projection of one control. */
export interface FieldState {
    value: any;
    overridden: boolean;
    raw: boolean | string;
    invalid: boolean;
    dirty: boolean;
}

/** The card state the registered hook hands to the component. */
export interface CardState {
    available: boolean;
    writable: boolean;
    fields: Record<string, FieldState>;
    dirty: boolean;
    saving: boolean;
    failed: boolean;
}

/** One staged edit a save would write (`run` unset = refuse the save). */
interface PlanEntry {
    field: string;
    run: (() => Promise<boolean>) | void;
}

/**
 * Parse one integer draft against the field range.
 *
 * @param text - the staged text.
 * @param spec - the int field spec.
 * @returns the value, or null when the draft is not an in-range integer.
 */
export function parseIntDraft(text: string, spec: { min?: number; max?: number }): number | null {
    const trimmed = String(text).trim();
    if (trimmed === "") return null; // empty draft is a clear, handled by the caller
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < (spec.min as number) || parsed > (spec.max as number)) return null;
    return parsed;
}

/** Stage drafts over the scope, write them on save, publish every change. */
export class CollapseMultilineCardController {
    private staged = new Map<string, Staged>();
    private saving = false;
    private failed = false;
    private disposed = false;
    private readonly store: SnapshotStore<CardState>;
    private readonly unsubscribe: () => void;

    /**
     * @param scope - the bound settings scope for the namespace.
     */
    constructor(public readonly scope: SettingsScope) {
        this.store = createSnapshotStore(this.projection());
        this.unsubscribe = scope.subscribe(() => {
            if (!this.disposed) this.publish();
        });
    }

    /** Whether the user layer currently overrides one field. */
    private storedIn(snapshot: SettingsSnapshot, field: string): boolean {
        return snapshot.user != null && Object.prototype.hasOwnProperty.call(snapshot.user, field);
    }

    /** The control display value for one field (staged draft over the section). */
    private fieldProjection(field: string, snapshot: SettingsSnapshot): FieldState {
        const spec = FIELDS[field];
        const value = snapshot.value != null ? snapshot.value[field] : void 0;
        const staged = this.staged.get(field);
        let invalid = false;
        let raw: boolean | string;
        if (staged !== void 0) {
            raw = staged.raw;
            if (staged.mode === "edit") {
                if (spec.kind === "int") {
                    const t = String(raw).trim();
                    invalid = t !== "" && parseIntDraft(t, spec) === null;
                }
            }
        } else if (spec.kind === "bool") {
            raw = value === true;
        } else {
            raw = typeof value === "number" ? String(value) : "";
        }
        return {
            value: value,
            overridden: this.storedIn(snapshot, field),
            raw: raw,
            invalid: invalid,
            dirty: staged !== void 0
        };
    }

    /** Build the card state from scope + drafts. */
    private projection(): CardState {
        const snapshot = this.scope.getSnapshot();
        const fields: Record<string, FieldState> = {};
        for (const field of FIELD_ORDER) {
            fields[field] = this.fieldProjection(field, snapshot);
        }
        return {
            available: snapshot.status === "ready" && snapshot.value !== void 0,
            writable: snapshot.writable === true,
            fields: fields,
            dirty: this.plan().length > 0,
            saving: this.saving,
            failed: this.failed
        };
    }

    /** Publish the current projection. */
    private publish(): void {
        if (this.disposed) return;
        this.store.set(this.projection());
    }

    /** Stage one control's draft. */
    edit(field: string, raw: boolean | string): void {
        this.staged.set(field, { mode: "edit", raw: raw });
        this.failed = false;
        this.publish();
    }

    /** Stage a reset: clear the override on save, showing the base value. */
    resetField(field: string): void {
        const spec = FIELDS[field];
        const baseValue = this.scope.getSnapshot().base != null ? this.scope.getSnapshot().base[field] : void 0;
        let raw: boolean | string;
        if (spec.kind === "bool") raw = baseValue === true;
        else raw = typeof baseValue === "number" ? String(baseValue) : "";
        this.staged.set(field, { mode: "clear", raw: raw });
        this.failed = false;
        this.publish();
    }

    /** Drop every draft. */
    discard(): void {
        this.staged.clear();
        this.failed = false;
        this.publish();
    }

    /**
     * Every staged edit a save would write. An entry whose draft the field
     * does not accept carries no write: the save refuses rather than
     * dropping the edit.
     */
    private plan(): PlanEntry[] {
        const snapshot = this.scope.getSnapshot();
        const value = snapshot.status === "ready" ? snapshot.value : void 0;
        const plan: PlanEntry[] = [];
        for (const entry of this.staged) {
            const field = entry[0];
            const staged = entry[1];
            const spec = FIELDS[field];
            const current = value != null ? value[field] : void 0;
            if (staged.mode === "clear") {
                if (this.storedIn(snapshot, field)) plan.push({ field: field, run: () => this.clearField(field) });
                continue;
            }
            if (spec.kind === "int") {
                const parsed = parseIntDraft(staged.raw as string, spec);
                if (parsed === null) {
                    if (String(staged.raw).trim() === "") {
                        // empty int draft is a clear
                        if (this.storedIn(snapshot, field)) plan.push({ field: field, run: () => this.clearField(field) });
                        continue;
                    }
                    plan.push({ field: field, run: void 0 });
                    continue;
                }
                if (parsed === current) continue;
                plan.push({ field: field, run: () => this.writeField(field, parsed) });
                continue;
            }
            if (staged.raw === current) continue;
            plan.push({ field: field, run: () => this.writeField(field, staged.raw) });
        }
        return plan;
    }

    /** Clear one field's user-layer override. */
    private clearField(field: string): Promise<boolean> {
        return this.scope.unset(field).then(() => !this.storedIn(this.scope.getSnapshot(), field));
    }

    /** Write one field, reading the landing back from the user layer. */
    private writeField(field: string, val: unknown): Promise<boolean> {
        return this.scope.set(field, val).then(() => {
            const snapshot = this.scope.getSnapshot();
            return snapshot.user != null && snapshot.user[field] === val;
        });
    }

    /** Write every staged edit; keep drafts when a write did not land. */
    save(): Promise<boolean> {
        const plan = this.plan();
        const writes = plan.flatMap((item) => (item.run === void 0 ? [] : [item.run as () => Promise<boolean>]));
        if (plan.length === 0 || this.saving || writes.length !== plan.length) return Promise.resolve(false);
        this.saving = true;
        this.failed = false;
        this.publish();
        let chain: Promise<boolean> = Promise.resolve(true);
        for (const write of writes) {
            chain = chain.then((landed) => write().then((ok) => landed && ok));
        }
        chain
            .then((landed) => {
                if (landed) this.staged.clear();
                this.saving = false;
                this.failed = !landed;
                this.publish();
            })
            .catch(() => {
                this.saving = false;
                this.failed = true;
                this.publish();
            });
        return chain.catch(() => false);
    }

    /** The face the card's slot registration injects. */
    inject(): any {
        return {
            hooks: { collapseMultilineCard: this.store },
            edit: (field: string, raw: boolean | string) => {
                this.edit(field, raw);
            },
            resetField: (field: string) => {
                this.resetField(field);
            },
            discard: () => {
                this.discard();
            },
            save: () => this.save()
        };
    }

    /** Stop tracking the scope; keep the store (the card may still render). */
    dispose(): void {
        this.disposed = true;
        this.unsubscribe();
    }
}
