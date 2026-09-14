/**
 * Host half — the user-settings schema.
 *
 * schemastery idiom: every field carries a default (the resolved snapshot is
 * always complete), so stored snapshots from earlier builds resolve
 * unchanged. No `z.enum`/`.optional` anywhere.
 *
 * The row's config (the bundle patch's `config {}` layer) is the namespace
 * base layer; the user layer (Settings → Plugins card) resolves above it.
 */
import z from "@deepseek-ai/schemastery";

/**
 * User-settings section: the `active` master switch, `minLines` (minimum
 * pasted lines for a collapse) and `minChars` (an extra character floor on
 * top of the line count; 0 means lines only).
 */
export const SettingsSchema = z.object({
    /** Master switch. false → stock composer behaviour. */
    active: z.boolean().default(true),
    /** Minimum pasted lines for a collapse (1–100). */
    minLines: z.number().step(1).min(1).max(100).default(3),
    /** Minimum pasted chars on top of the line count (0 = lines only). */
    minChars: z.number().step(1).min(0).max(10000).default(0)
});

/** Resolved settings snapshot served to the browser (every field defaults). */
export type Settings = Schemastery.TypeT<typeof SettingsSchema>;

/**
 * The bundle row's config: today the same shape as the user-settings
 * section, because the row's config *is* the namespace's base layer.
 */
export const Config = SettingsSchema;
