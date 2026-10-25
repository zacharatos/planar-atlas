// Loads the real entry point against stubbed Foundry globals. Catches broken imports, missing exports and hook
// wiring mistakes; it does not replace testing in Foundry.
import { test } from "node:test";
import assert from "node:assert/strict";

const hooks = { once: {}, on: {} };
globalThis.Hooks = {
  once: (name, fn) => { (hooks.once[name] ??= []).push(fn); },
  on: (name, fn) => { (hooks.on[name] ??= []).push(fn); },
  callAll: () => true
};
class FakeApp { static DEFAULT_OPTIONS = {}; }
globalThis.foundry = {
  applications: { api: { ApplicationV2: FakeApp, DialogV2: class {} }, apps: { FilePicker: { implementation: class {} } } },
  utils: { randomID: () => "abc123", deepClone: v => structuredClone(v), hasProperty: () => false }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 }, JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1, MARKDOWN: 2 } };
const settings = new Map();
const registered = { settings: [], keys: [], sockets: [] };
globalThis.game = {
  user: { isGM: true, id: "gm" },
  modules: new Map([["planar-atlas", {}]]),
  settings: {
    register: (mod, key, cfg) => { registered.settings.push(`${mod}.${key}`); settings.set(`${mod}.${key}`, cfg.default); },
    get: (mod, key) => settings.get(`${mod}.${key}`),
    set: async (mod, key, v) => settings.set(`${mod}.${key}`, v)
  },
  users: { activeGM: { id: "gm" }, get: () => null, filter: () => [] },
  actors: Object.assign([], { get: () => null, find: () => null, filter: () => [] }),
  journal: Object.assign([], { find: () => null, get: () => null }),
  scenes: Object.assign([], { find: () => null, getName: () => null }),
  keybindings: { register: (mod, key) => registered.keys.push(`${mod}.${key}`) },
  socket: { on: event => registered.sockets.push(event), emit() {} },
  i18n: { localize: k => k, format: k => k, lang: "en" }
};
globalThis.canvas = { scene: null, ready: false };
globalThis.CONFIG = { TextEditor: { enrichers: [] } };
globalThis.document = { body: { addEventListener() {} }, getElementById: () => null };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} }, controls: null };

await import("../scripts/main.mjs");

test("registers settings, keybindings and the journal button on init", () => {
  for (const fn of hooks.once.init) fn();
  assert.deepEqual(registered.settings.sort(), [
    "planar-atlas.company", "planar-atlas.imageBase", "planar-atlas.language", "planar-atlas.lockCompany", "planar-atlas.pack",
    "planar-atlas.pages", "planar-atlas.playerButton", "planar-atlas.purseForPlayers", "planar-atlas.road",
    "planar-atlas.showLabels", "planar-atlas.snapRadius", "planar-atlas.textLanguage"
  ]);
  assert.deepEqual(registered.keys.sort(), ["planar-atlas.console", "planar-atlas.party"]);
  assert.equal(CONFIG.TextEditor.enrichers.length, 1, "@Atlas enricher registered");
  assert.ok(CONFIG.TextEditor.enrichers[0].pattern.test("@Atlas[Ο Πανταχού Οδοιπόρος | move]{Πάμε}"));
});

test("exposes an api and listens on the socket on ready", async () => {
  for (const fn of hooks.once.ready) await fn();
  const api = game.modules.get("planar-atlas").api;
  assert.deepEqual(registered.sockets, ["module.planar-atlas"]);
  for (const fn of ["open", "openConsole", "openParty", "places", "findPlace", "showCard", "setStatus", "revealSet", "move", "undo",
    "archive", "setNext", "road", "pay", "purse", "purseLog", "company", "createCompany", "placeCompany", "setupPlaces", "exportPack",
    "defs", "syncPages", "redraw"]) assert.equal(typeof api[fn], "function", fn);
  assert.equal(api.road().journeys.length, 1, "an empty road is readable");
  assert.equal(api.findPlace("anything"), null);
});

test("toolbar: console for the GM, party window for everyone", () => {
  const gmControls = { tokens: { tools: {} } };
  hooks.on.getSceneControlButtons[0](gmControls);
  assert.ok(gmControls.tokens.tools["planar-atlas-console"]);
  assert.ok(gmControls.tokens.tools["planar-atlas-party"]);
  game.user.isGM = false;
  const playerControls = { tokens: { tools: {} } };
  hooks.on.getSceneControlButtons[0](playerControls);
  assert.ok(!playerControls.tokens.tools["planar-atlas-console"]);
  assert.ok(playerControls.tokens.tools["planar-atlas-party"]);
  game.user.isGM = true;
  assert.doesNotThrow(() => hooks.on.getSceneControlButtons[0]({}));
});

test("other notes and tokens are left alone", () => {
  assert.equal(hooks.on.activateNote[0]({ document: { entryId: "x", pageId: "y" } }), undefined, "a normal note still opens");
  assert.equal(hooks.on.preUpdateToken[0]({ actorId: "a", parent: null }, { x: 1 }), true, "a token that isn't the Company moves");
  game.user.isGM = false;
  assert.equal(hooks.on.preUpdateToken[0]({ actorId: "a", parent: null }, { x: 1 }), true);
  game.user.isGM = true;
  assert.doesNotThrow(() => hooks.on.refreshNote[0]({ document: {} }));
});
