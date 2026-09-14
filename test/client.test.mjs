/**
 * @comecaramelos/dsh-collapse-multiline-paste — browser-half bundle tests.
 *
 * Loads the emitted lazy-CJS bundle (`lib/client.js`) through a
 * `__ModuleLoader__` stub and drives `apply` over a minimal DOM stub:
 * the export surface (apply + inject list), the two stylesheet injections,
 * the locale registration and slot registration, and the DOM-engine
 * arm/dispose wiring.
 *
 * The collapse mechanics themselves are core-tested in ./core.test.mjs;
 * this file pins only what the shell resolves.
 *
 * @module test/client
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// ── DOM stubs ───────────────────────────────────────────────────────────────

class StubElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.__text = "";
        this.isConnected = true;
    }
    get textContent() {
        return this.__text;
    }
    set textContent(value) {
        this.__text = String(value);
    }
    appendChild(child) {
        this.children.push(child);
        return child;
    }
    querySelector() {
        return null;
    }
}

function createDocument() {
    const doc = {
        head: new StubElement("head"),
        body: new StubElement("body"),
        elements: [],
        createElement(tagName) {
            const el = new StubElement(tagName);
            doc.elements.push(el);
            return el;
        },
        querySelector(selector) {
            // Only `style[data-plugin-css="…"]` lookups are made; the stub
            // answers them from the already-injected style elements.
            if (selector.startsWith("style[data-plugin-css=")) {
                const id = selector.slice(selector.indexOf('"') + 1, selector.lastIndexOf('"'));
                return doc.elements.find((el) => el.dataset.pluginCss === id) ?? null;
            }
            return null;
        },
        listeners: new Map(),
        addEventListener(type, listener) {
            const bucket = doc.listeners.get(type) ?? new Set();
            bucket.add(listener);
            doc.listeners.set(type, bucket);
        },
        removeEventListener(type, listener) {
            doc.listeners.get(type)?.delete(listener);
        }
    };
    return doc;
}

class StubMutationObserver {
    constructor(callback) {
        this.callback = callback;
        this.observed = false;
    }
    observe() {
        this.observed = true;
    }
    disconnect() {
        this.observed = false;
    }
}

globalThis.MutationObserver = StubMutationObserver;
const doc = createDocument();
globalThis.document = doc;
const win = {
    innerWidth: 1000,
    innerHeight: 800,
    getComputedStyle() {
        return { lineHeight: "21px" };
    },
    listeners: new Map(),
    addEventListener(type, listener) {
        const bucket = win.listeners.get(type) ?? new Set();
        bucket.add(listener);
        win.listeners.set(type, bucket);
    },
    removeEventListener(type, listener) {
        win.listeners.get(type)?.delete(listener);
    }
};
globalThis.window = win;

// ── bundle load ─────────────────────────────────────────────────────────────

let loaded = null;
globalThis.window.__ModuleLoader__ = {
    load(spec) {
        loaded = spec;
    }
};
await import("../lib/client.js");

const bundle = loaded.factory((id) => {
    // Only the ids the bundle requires are stubbed: react/jsx-runtime is
    // used only inside components, and createSnapshotStore is exercised
    // lazily by the card controller.
    if (id === "react") return { useId: () => "id", useState: () => [false, () => {}] };
    if (id === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
    if (id === "@deepseek-ai/dsh-client-ui-primitives") {
        // Only the Switch face is required; the components run lazily, so the
        // stub's identity is what a future card-props test would pin.
        return {
            Switch: (props) => ({ type: "Switch", props })
        };
    }
    if (id === "@deepseek-ai/dsh-client-store") {
        return {
            createSnapshotStore(initial) {
                let value = initial;
                const listeners = new Set();
                return {
                    subscribe(listener) {
                        listeners.add(listener);
                        return () => listeners.delete(listener);
                    },
                    getSnapshot() {
                        return value;
                    },
                    set(next) {
                        value = next;
                    }
                };
            }
        };
    }
    throw new Error(`unexpected require in client bundle: ${id}`);
});

// ── export surface ──────────────────────────────────────────────────────────

test("the bundle exports the apply surface and the inject list", () => {
    assert.equal(typeof bundle.apply, "function");
    assert.deepEqual(bundle.inject, ["slots", "locale", "settingsScope"]);
});

// ── apply wiring ────────────────────────────────────────────────────────────

function createScope(overrides = {}) {
    const state = {
        status: "ready",
        value: { active: true, minLines: 3, minChars: 0 },
        base: { active: true, minLines: 3, minChars: 0 },
        writable: true
    };
    return {
        state,
        getSnapshot() {
            return { ...state };
        },
        subscribe() {
            return () => {};
        },
        async set(path, value) {
            state.value[path] = value;
            state.user ??= {};
            state.user[path] = value;
        },
        async unset(path) {
            if (state.user) delete state.user[path];
        },
        ...overrides
    };
}

function createCtx(scope) {
    const registered = [];
    const injectedSlots = [];
    const effects = [];
    return {
        ctx: {
            effect(effect) {
                effects.push(effect);
                const cleanup = effect();
                effects[effects.length - 1] = typeof cleanup === "function" ? cleanup : null;
            },
            locale: {
                register(namespace, dictionaries) {
                    registered.push({ namespace, dictionaries });
                },
                bind() {
                    return (key) => key;
                }
            },
            settingsScope: {
                bind() {
                    return scope;
                }
            },
            slots: {
                inject(name, callback) {
                    injectedSlots.push({ name, callback });
                },
                register(registration, component) {
                    registered.push({ registration, component });
                }
            }
        },
        registered,
        injectedSlots,
        effects
    };
}

test("apply registers locales, mounts both stylesheets and wires the slot", () => {
    const scope = createScope();
    const { ctx, registered, injectedSlots, effects } = createCtx(scope);

    bundle.apply(ctx);

    // Both stylesheets injected exactly once (DOM-checked idempotency).
    const composerTags = doc.elements.filter((el) => el.dataset.pluginCss?.endsWith("composer.css"));
    const cardTags = doc.elements.filter((el) => el.dataset.pluginCss?.endsWith("CollapseMultilineCard.module.css"));
    assert.equal(composerTags.length, 1);
    assert.equal(cardTags.length, 1);

    // The dictionaries land under the fixed namespace.
    const localeEntry = registered.find((entry) => entry.dictionaries !== void 0);
    assert.equal(localeEntry.namespace, "collapseMultiline");
    assert.deepEqual(Object.keys(localeEntry.dictionaries).sort(), ["en", "zh"]);

    // The slot registration: shared slot, namespace key, locale namespace.
    assert.equal(injectedSlots.length, 1);
    assert.equal(injectedSlots[0].name, "settings.plugin.item");
    // The registration rides the injected callback: drive it (what the
    // shell does when the slot resolves).
    injectedSlots[0].callback();
    const registrations = registered.filter((entry) => entry.registration !== void 0);
    assert.equal(registrations.length, 1);
    assert.deepEqual(
        {
            name: registrations[0].registration.name,
            key: registrations[0].registration.key,
            locale: registrations[0].registration.locale
        },
        { name: "settings.plugin.item", key: "collapse-multiline", locale: "collapseMultiline" }
    );

    // One DOM-engine effect ran (the DOM listeners are now armed).
    const paste = doc.listeners.get("paste");
    assert.ok(paste && paste.size > 0);

    // Dispose tears the DOM engine down.
    for (const cleanup of effects) if (cleanup !== null) cleanup();
    assert.equal(doc.listeners.get("paste").size, 0);
});
