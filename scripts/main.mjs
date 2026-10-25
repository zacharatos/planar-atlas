import { MODULE_ID } from "./constants.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { loadDictionaries } from "./i18n.mjs";
import { road, company, defs, isActiveGM } from "./state.mjs";
import * as places from "./places.mjs";
import * as roadOps from "./road.mjs";
import * as trail from "./trail.mjs";
import * as purse from "./purse.mjs";
import * as pages from "./page.mjs";
import { PlaceCard } from "./card.mjs";
import { PartyWindow } from "./party.mjs";
import { AtlasConsole } from "./console.mjs";
import { registerEnrichers, listenForClicks } from "./enrich.mjs";
import { parseCoins } from "./util.mjs";

const refreshWindows = () => {
  AtlasConsole.instance?.refreshSoon();
  PartyWindow.instance?.refreshSoon();
  PlaceCard.instance?.refreshSoon();
};

function onSettingChange(what) {
  if (what === "road" || what === "pack" || what === "draw" || what === "language") trail.redrawSoon();
  if (what === "language") for (const n of globalThis.canvas?.notes?.placeables ?? []) places.styleNote(n);
  if (what === "company") purse.rememberPurse();
  refreshWindows();
}

/** The GM gets the console, players the party window. */
const openForMe = () => (game.user.isGM ? AtlasConsole.open() : PartyWindow.open());

Hooks.once("init", () => {
  registerSettings({ onChange: onSettingChange });
  game.keybindings.register(MODULE_ID, "party", {
    name: "PLANAR_ATLAS.Keybinding.Party", hint: "PLANAR_ATLAS.Keybinding.PartyHint",
    editable: [{ key: "KeyP", modifiers: ["Alt"] }],
    onDown: () => { PartyWindow.open(); return true; }
  });
  game.keybindings.register(MODULE_ID, "console", {
    name: "PLANAR_ATLAS.Keybinding.Console", editable: [], restricted: true,
    onDown: () => { AtlasConsole.open(); return true; }
  });
  registerEnrichers();
});

Hooks.once("ready", async () => {
  await loadDictionaries();
  purse.registerSocket();
  pages.wirePages();
  purse.rememberPurse();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = {
    /** The GM console (GM) or the party window (players). */
    open: () => openForMe(),
    openConsole: opts => AtlasConsole.open(opts),
    openParty: opts => PartyWindow.open(opts),
    /** Places of an atlas: [{id, name, status, x, y, uuid}] (x, y from 0 to 1). */
    places: atlasId => places.placesOn(atlasId).map(p => ({ id: p.place.id, name: places.placeName(p.place), status: p.place.status, x: p.x, y: p.y, uuid: p.page.uuid })),
    /** A place by id or name (any atlas): {id, name, status, uuid} or null. */
    findPlace: query => { const h = places.findPlace(query); return h ? { id: h.place.id, name: places.placeName(h.place), status: h.place.status, uuid: h.page.uuid } : null; },
    /** Show a place's card. */
    showCard: query => { const h = places.findPlace(query); return h ? PlaceCard.show(h.page) : null; },
    /** "hidden" | "rumoured" | "known" | "visited". */
    setStatus: async (query, status) => { const h = places.findPlace(query); return h ? places.setStatus(h.page, status) : null; },
    revealSet: id => places.revealSet(id),
    /** Move the party to a place (the stop is recorded). */
    move: async query => { const h = places.findPlace(query); return h ? roadOps.moveCompanyTo(h.page) : null; },
    undo: () => roadOps.undoLast(),
    archive: name => roadOps.archive(name),
    setNext: patch => roadOps.setNextMove(patch),
    road: () => road(),
    /** Pay from the common purse ("3gp 5sp", reason) or put coins in (dir "in"). */
    pay: (amount, why = "", dir = "out") => purse.change({ coins: typeof amount === "string" ? parseCoins(amount) : amount, dir, why }),
    purse: () => purse.purse(),
    purseLog: () => purse.purseLog(),
    company: () => company(),
    createCompany: () => roadOps.createCompany(),
    placeCompany: scene => roadOps.placeCompany(scene),
    setupPlaces: atlasId => places.setupPlaces(atlasId),
    exportPack: () => places.packForExport(),
    defs: () => defs(),
    syncPages: async () => { await pages.syncRoadPage(); await pages.syncPursePage(); },
    redraw: () => trail.draw()
  };
  listenForClicks();
  trail.redrawSoon();
});

// Toolbar: the GM's console, and the party window for everyone (players: if the setting allows).
Hooks.on("getSceneControlButtons", controls => {
  if (!controls?.tokens?.tools) return;
  const gm = game.user?.isGM;
  if (gm) {
    controls.tokens.tools[`${MODULE_ID}-console`] = {
      name: `${MODULE_ID}-console`, title: "PLANAR_ATLAS.ToolConsole", icon: "fa-solid fa-map-location-dot",
      order: 64, button: true, visible: true, onChange: () => AtlasConsole.open()
    };
  }
  if (gm || setting("playerButton")) {
    controls.tokens.tools[`${MODULE_ID}-party`] = {
      name: `${MODULE_ID}-party`, title: "PLANAR_ATLAS.ToolParty", icon: "fa-solid fa-people-group",
      order: 65, button: true, visible: true, onChange: () => PartyWindow.open()
    };
  }
});

// The map: notes shown on atlases, the road drawn, the windows told.
Hooks.on("canvasReady", cv => {
  places.syncNotesToggle(cv?.scene ?? canvas.scene).catch(() => {});
  trail.redrawSoon();
  refreshWindows();
});
Hooks.on("canvasTearDown", () => trail.teardown());
Hooks.on("refreshNote", note => places.styleNote(note));

// A double-click on a place opens its card instead of the journal page.
Hooks.on("activateNote", note => {
  const page = places.pageOfNote(note);
  if (!places.placeOfPage(page)) return;
  PlaceCard.show(page);
  return false;
});

// The Company: the GM's drops are recorded; players can't move it on an atlas.
Hooks.on("updateToken", (doc, changed, options) => {
  roadOps.onTokenMoved(doc, changed, options).catch(err => console.error(`${MODULE_ID} | road`, err));
});
Hooks.on("preUpdateToken", (doc, changed) => roadOps.lockForPlayers(doc, changed));
Hooks.on("preMoveToken", doc => roadOps.lockForPlayers(doc, { x: true }));

// Places changed: their notes, cards and lists follow.
Hooks.on("updateNote", (note, changed) => { places.onNoteUpdated(note, changed).catch(err => console.warn(`${MODULE_ID} | note`, err)); refreshWindows(); });
for (const hook of ["createNote", "deleteNote", "createJournalEntryPage", "deleteJournalEntryPage"]) Hooks.on(hook, () => refreshWindows());
// Area labels sit in the middle of their places: they follow the pins.
for (const hook of ["createNote", "updateNote", "deleteNote"]) Hooks.on(hook, note => { if (note?.parent === globalThis.canvas?.scene) trail.redrawSoon(); });
Hooks.on("updateJournalEntryPage", page => {
  if (!places.placeOfPage(page)) return;
  places.refreshNoteOf(page);
  refreshWindows();
  if (isActiveGM()) pages.scheduleRoadPage();
});

// The Company's coins: a change made anywhere is written in the purse's history; its page follows.
Hooks.on("updateActor", (actor, changed, options, userId) => {
  if (actor?.id !== company()?.id) return;
  purse.onActorUpdated(actor, changed, options, userId).catch(err => console.warn(`${MODULE_ID} | purse`, err));
  pages.schedulePursePage();
  PartyWindow.instance?.refreshSoon();
});
Hooks.on("createActor", () => { if (!company()) return; purse.rememberPurse(); refreshWindows(); });
