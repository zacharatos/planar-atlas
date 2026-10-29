import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fold, localText, findByName, pickLanguage, fill,
  sceneRect, toNorm, fromNorm, nearest, parkingSpot,
  route, zoneOf,
  parseCoins, spendCoins, addCoins, coinValue, coinsText, diffCoins, cleanCoins,
  emptyRoad, normalizeRoad, addStop, removeStop, updateStop, archiveJourney, clearJourney, deleteJourney, activeJourney, lastStop,
  visitsOf, sessionOrder, sessionAlpha, sameSpot,
  validatePack, placeData, playerLabel, exportPack, parseAtlasArgs, roadMarkdown, purseMarkdown,
  clockParts, hhmm, parseHHMM, epochFor, bandAt, durationParts,
  routeLength, travelRule, travelEstimate, rolledSeconds, tableRow, encounterTables, progressOf, stepsCrossed
} from "../scripts/util.mjs";

/* ---------------- text ---------------- */

test("fold ignores accents, case and spacing", () => {
  assert.equal(fold("  Ο Πανταχού   Οδοιπόρος "), "ο πανταχου οδοιπορος");
  assert.equal(fold("Fell’s Tattoos"), "fell's tattoos");
});

test("localText picks the language, then English, then anything", () => {
  assert.equal(localText({ en: "Inn", el: "Πανδοχείο" }, "el"), "Πανδοχείο");
  assert.equal(localText({ en: "Inn" }, "el"), "Inn");
  assert.equal(localText({ el: "Πανδοχείο" }, "en"), "Πανδοχείο");
  assert.equal(localText("plain", "el"), "plain");
  assert.equal(localText(null), "");
});

test("findByName: id, exact, start, contained", () => {
  const items = [{ id: "a", name: "Hall of Records" }, { id: "b", name: "Hall of Speakers" }, { id: "c", name: "Ο Πανταχού Οδοιπόρος" }];
  assert.equal(findByName(items, "b").id, "b");
  assert.equal(findByName(items, "hall of speakers").id, "b");
  assert.equal(findByName(items, "Hall").id, "a");
  assert.equal(findByName(items, "οδοιπορος").id, "c");
  assert.equal(findByName(items, "nowhere"), null);
});

test("language choice and placeholders", () => {
  assert.equal(pickLanguage("world", "auto", "el"), "el");
  assert.equal(pickLanguage("en", "el", "el"), "en");
  assert.equal(pickLanguage("world", "el", "en"), "el");
  assert.equal(fill("Stop {n}: {name} {x}", { n: 2, name: "Πλατεία" }), "Stop 2: Πλατεία {x}");
});

/* ---------------- coordinates ---------------- */

test("normalised coordinates round-trip inside the map rectangle", () => {
  const rect = sceneRect({ sceneX: 100, sceneY: 50, sceneWidth: 4096, sceneHeight: 2867 });
  const n = toNorm(rect, 100 + 2048, 50 + 2867 / 4);
  assert.deepEqual(n, { x: 0.5, y: 0.25 });
  const p = fromNorm(rect, n);
  assert.ok(Math.abs(p.x - 2148) < 0.5 && Math.abs(p.y - (50 + 2867 / 4)) < 0.5);
  assert.deepEqual(toNorm(rect, -500, 99999), { x: 0, y: 1 }, "clamped to the map");
});

test("nearest place within a radius", () => {
  const pts = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 40, y: 0 }];
  assert.equal(nearest(pts, 45, 5, 50).id, "c");
  assert.equal(nearest(pts, 300, 300, 50), null);
});

test("parking spots fill rows along the bottom", () => {
  assert.deepEqual(parkingSpot(0), { x: 0.02, y: 0.96 });
  assert.equal(parkingSpot(1).x, 0.05);
  assert.ok(parkingSpot(20).y < 0.96, "second row is higher");
});

/* ---------------- wrap-around ---------------- */

const SIGIL = {
  zones: [{ id: "top", x0: 0, y0: 0.05, x1: 1, y1: 0.45 }, { id: "bottom", x0: 0, y0: 0.55, x1: 1, y1: 0.95 }],
  links: [
    { a: { zone: "top", edge: "right" }, b: { zone: "bottom", edge: "left" } },
    { a: { zone: "bottom", edge: "right" }, b: { zone: "top", edge: "left" } }
  ]
};

test("route: straight inside one zone", () => {
  const r = route({ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.3 }, SIGIL);
  assert.equal(r.segments.length, 1);
  assert.equal(r.wraps.length, 0);
  assert.equal(zoneOf(SIGIL.zones, { x: 0.5, y: 0.5 }), null, "the band between strips belongs to no zone");
});

test("route: from the end of the top strip into the start of the bottom one", () => {
  const r = route({ x: 0.95, y: 0.25 }, { x: 0.05, y: 0.75 }, SIGIL);
  assert.equal(r.segments.length, 2);
  const [[a, exit], [entry, b]] = r.segments;
  assert.equal(exit.x, 1, "leaves at the right edge");
  assert.equal(entry.x, 0, "comes back at the left edge");
  assert.deepEqual(a, { x: 0.95, y: 0.25 });
  assert.deepEqual(b, { x: 0.05, y: 0.75 });
  assert.deepEqual(r.wraps.map(w => [w.edge, w.out]), [["right", true], ["left", false]]);
});

test("route: picks the shorter of two links", () => {
  // From the start of the top strip to the end of the bottom one: through top-left ↔ bottom-right.
  const r = route({ x: 0.05, y: 0.25 }, { x: 0.95, y: 0.75 }, SIGIL);
  assert.equal(r.segments[0][1].x, 0, "leaves at the left edge");
  assert.equal(r.segments[1][0].x, 1, "arrives at the right edge");
});

test("route: no zones or no link means a straight line", () => {
  assert.equal(route({ x: 0, y: 0 }, { x: 1, y: 1 }).segments.length, 1);
  assert.equal(route({ x: 0.1, y: 0.2 }, { x: 0.1, y: 0.8 }, { zones: SIGIL.zones, links: [] }).segments.length, 1);
});

/* ---------------- coins ---------------- */

test("parseCoins understands dnd5e codes, Greek words and plain numbers", () => {
  assert.deepEqual(parseCoins("3gp 5sp"), { pp: 0, gp: 3, ep: 0, sp: 5, cp: 0 });
  assert.deepEqual(parseCoins("3 gp, 5 sp"), { pp: 0, gp: 3, ep: 0, sp: 5, cp: 0 });
  assert.equal(parseCoins("12").gp, 12);
  assert.equal(parseCoins("2 χρυσά").gp, 2);
  assert.equal(parseCoins("7 ασημένια").sp, 7);
  assert.equal(parseCoins("1pp").pp, 1);
  assert.equal(parseCoins("nothing"), null);
  assert.equal(parseCoins(""), null);
});

test("spendCoins pays exactly when the coins are there", () => {
  assert.deepEqual(spendCoins({ gp: 10, sp: 5 }, { gp: 3, sp: 2 }), { pp: 0, gp: 7, ep: 0, sp: 3, cp: 0 });
});

test("spendCoins makes change from a bigger coin", () => {
  const out = spendCoins({ gp: 10 }, { sp: 5 });
  assert.equal(coinValue(out), 1000 - 50);
  assert.ok(Object.values(out).every(v => v >= 0));
  assert.equal(out.gp, 9, "only one gold piece is broken");
  const out2 = spendCoins({ pp: 1 }, { cp: 3 });
  assert.equal(coinValue(out2), 997);
  assert.equal(out2.pp, 0);
});

test("spendCoins pays with smaller coins when no bigger ones are left", () => {
  const out = spendCoins({ sp: 40 }, { gp: 2 });
  assert.equal(coinValue(out), 200);
  assert.ok(Object.values(out).every(v => v >= 0));
});

test("spendCoins refuses what the purse can't afford", () => {
  assert.equal(spendCoins({ gp: 1 }, { gp: 2 }), null);
});

test("coin arithmetic and text", () => {
  assert.deepEqual(addCoins({ gp: 1 }, { gp: 2, sp: 1 }), { pp: 0, gp: 3, ep: 0, sp: 1, cp: 0 });
  assert.deepEqual(diffCoins({ gp: 5 }, { gp: 2, sp: 3 }), { pp: 0, gp: -3, ep: 0, sp: 3, cp: 0 });
  assert.equal(coinsText({ gp: 3, sp: 5 }), "3 gp, 5 sp");
  assert.equal(coinsText({ gp: -3 }, { signed: true }), "−3 gp");
  assert.equal(coinsText({ gp: 2 }, { signed: true }), "+2 gp");
  assert.equal(coinsText({}), "0 gp");
  assert.deepEqual(cleanCoins({ gp: "4", sp: -2, cp: 1.7 }), { pp: 0, gp: 4, ep: 0, sp: 0, cp: 1 });
});

/* ---------------- the road ---------------- */

const stop = (id, extra = {}) => ({ id, atlas: "sigil", place: null, x: 0.1 * id.length, y: 0.5, session: "S03", ...extra });

test("a fresh road has one open journey", () => {
  const r = normalizeRoad(null, () => "j1");
  assert.equal(r.active, "j1");
  assert.equal(activeJourney(r).stops.length, 0);
  const broken = normalizeRoad({ journeys: [{ id: "x", archived: true, stops: [] }] }, () => "j2");
  assert.equal(broken.active, "j2", "an archived-only road gets a new open journey");
});

test("stops: add, same spot skipped, edit, remove", () => {
  const r = emptyRoad();
  assert.ok(addStop(r, stop("a", { place: "mortuary" })));
  assert.equal(addStop(r, stop("b", { place: "mortuary" })), null, "same place twice in a row");
  assert.ok(addStop(r, stop("cc", { place: "square" })));
  assert.ok(addStop(r, stop("ddd")));
  assert.equal(addStop(r, stop("eee")), null, "same point twice");
  updateStop(r, "cc", { note: "Parisa", place: "hack" });
  assert.equal(activeJourney(r).stops[1].note, "Parisa");
  assert.equal(activeJourney(r).stops[1].place, "square", "place can't be edited");
  removeStop(r, "ddd");
  assert.equal(lastStop(r).id, "cc");
  assert.ok(sameSpot({ atlas: "a", place: null, x: 0.1, y: 0.1 }, { atlas: "a", place: null, x: 0.1001, y: 0.1 }));
  assert.ok(!sameSpot({ atlas: "a", place: "p" }, { atlas: "b", place: "p" }));
});

test("archive keeps the journey and starts a new one where the party stands", () => {
  const r = emptyRoad("j1");
  addStop(r, stop("a", { place: "mortuary" }));
  addStop(r, stop("bb", { place: "wayfarer" }));
  archiveJourney(r, { name: "Ch. 2 — Sigil", newId: "j2", stopId: "s9", date: "2026-10-25" });
  assert.equal(r.active, "j2");
  const old = r.journeys.find(j => j.id === "j1");
  assert.equal(old.archived, true);
  assert.equal(old.name, "Ch. 2 — Sigil");
  assert.equal(activeJourney(r).stops.length, 1);
  assert.equal(activeJourney(r).stops[0].place, "wayfarer");
  assert.equal(activeJourney(r).stops[0].start, true);
  assert.equal(deleteJourney(r, "j2"), false, "the active journey can't be deleted");
  assert.equal(deleteJourney(r, "j1"), true);
  clearJourney(r);
  assert.equal(activeJourney(r).stops.length, 0);
});

test("visits, session order and shading", () => {
  const r = emptyRoad();
  addStop(r, stop("a", { place: "square", session: "S02", day: "1" }));
  addStop(r, stop("bb", { place: "wayfarer", session: "S03", day: "1" }));
  addStop(r, stop("ccc", { place: "square", session: "S03", day: "2" }));
  assert.deepEqual(visitsOf(r, "square").map(v => v.day), ["1", "2"]);
  assert.deepEqual(sessionOrder(activeJourney(r).stops), ["S02", "S03"]);
  assert.equal(sessionAlpha(1, 2), 1);
  assert.equal(sessionAlpha(0, 2), 0.35);
  assert.equal(sessionAlpha(0, 1), 1);
});

/* ---------------- packs ---------------- */

test("the shipped example pack is valid", () => {
  const pack = JSON.parse(readFileSync(new URL("../data/example-pack.json", import.meta.url), "utf8"));
  assert.deepEqual(validatePack(pack), []);
});

test("validatePack finds the usual mistakes", () => {
  const errors = validatePack({ schema: 1, id: "x", atlases: [{ id: "a", zones: [{ id: "z" }], links: [{ a: { zone: "q", edge: "up" } }] }],
    places: [{ id: "p", atlas: "nope", name: "P", x: 2 }, { id: "p", atlas: "a", name: "" }] });
  const text = errors.join("\n");
  for (const bit of ["zone z", "link", "unknown atlas", "x must be", "appears twice", "no name"]) assert.match(text, new RegExp(bit));
  assert.ok(validatePack(null).length);
});

test("placeData fills defaults; players' labels follow the status", () => {
  const pl = placeData({ id: "p", atlas: "a", name: { el: "Πλατεία", en: "Square" } });
  assert.equal(pl.status, "hidden");
  assert.equal(pl.cat, "landmark");
  assert.deepEqual(Object.keys(pl.links).sort(), ["faction", "prep", "scape", "scene", "theater", "theaterScene"]);
  assert.equal(playerLabel({ ...pl, status: "hidden" }, "el"), "");
  assert.equal(playerLabel({ ...pl, status: "rumoured" }, "el"), "?");
  assert.equal(playerLabel({ ...pl, status: "known" }, "el"), "Πλατεία");
});

test("exportPack writes positions back but keeps the pack's starting status", () => {
  const pack = { schema: 1, id: "t", atlases: [{ id: "a" }], places: [{ id: "p", atlas: "a", name: "P", status: "hidden", x: null, y: null }] };
  const out = exportPack(pack, [
    { ...placeData({ id: "p", atlas: "a", name: "P", status: "visited" }), x: 0.3, y: 0.4 },
    { ...placeData({ id: "new", atlas: "a", name: "New" }), x: 0.1, y: 0.1 }
  ]);
  const p = out.places.find(x => x.id === "p");
  assert.equal(p.x, 0.3);
  assert.equal(p.status, "hidden");
  assert.ok(out.places.find(x => x.id === "new"));
  assert.equal(pack.places[0].x, null, "the original is not changed");
});

/* ---------------- journal buttons ---------------- */

test("parseAtlasArgs", () => {
  assert.deepEqual(parseAtlasArgs("Ο Πανταχού Οδοιπόρος"), { verb: "open", target: "Ο Πανταχού Οδοιπόρος", reason: "" });
  assert.deepEqual(parseAtlasArgs("Ο Πανταχού Οδοιπόρος | move"), { verb: "move", target: "Ο Πανταχού Οδοιπόρος", reason: "" });
  assert.deepEqual(parseAtlasArgs("reveal: Αρχειοφυλάκειο"), { verb: "reveal", target: "Αρχειοφυλάκειο", reason: "" });
  assert.deepEqual(parseAtlasArgs("set: parisa"), { verb: "set", target: "parisa", reason: "" });
  assert.deepEqual(parseAtlasArgs("pay: 3gp | Παρίζα, μια μέρα"), { verb: "pay", target: "3gp", reason: "Παρίζα, μια μέρα" });
  assert.equal(parseAtlasArgs("Note: not a verb").verb, "open", "an unknown prefix is part of the name");
});

/* ---------------- pages ---------------- */

test("road and purse Markdown", () => {
  const r = emptyRoad();
  addStop(r, stop("a", { place: "square", day: "1", time: "ζενίθ", how: "foot", note: "a | pipe", travel: { seconds: 5400 } }));
  const md = roadMarkdown(r, {
    title: "Road", intro: "intro", none: "none", active: "Now", archived: "Journey",
    cols: { n: "#", session: "S", day: "D", place: "P", how: "H", travel: "T", cost: "C", note: "N" }
  }, { place: s => s.place, how: h => h, atlas: a => a.toUpperCase(), duration: s => `${s / 60} min` });
  assert.match(md, /^---\ntype: log/);
  assert.match(md, /\| 1 \| S03 \| 1 · ζενίθ \| square \(SIGIL\) \| foot \| 90 min \|  \| a \\\| pipe \|/);
  const pm = purseMarkdown({ gp: 7 }, [{ date: "2026-10-25T10:00:00Z", session: "S03", who: "Nanouk", delta: { gp: -3 }, why: "Parisa" }],
    { title: "Purse", intro: "i", now: "Now", none: "none", cols: { when: "W", session: "S", who: "Who", amount: "A", why: "Y" } });
  assert.match(pm, /visibility: players/);
  assert.match(pm, /\*\*Now:\*\* 7 gp/);
  assert.match(pm, /\| 2026-10-25 \| S03 \| Nanouk \| −3 gp \| Parisa \|/);
});

/* ---------------- the clock ---------------- */

test("clock parts from seconds and an epoch", () => {
  assert.deepEqual(clockParts(0), { day: 1, hour: 0, minute: 0, secondsOfDay: 0 });
  assert.deepEqual(clockParts(86400 * 2 + 3600 * 14 + 60 * 20), { day: 3, hour: 14, minute: 20, secondsOfDay: 51600 });
  const e = epochFor(1_000_000, 3, 10 * 3600);
  const p = clockParts(1_000_000, e);
  assert.equal(p.day, 3);
  assert.equal(hhmm(p), "10:00");
  assert.equal(clockParts(1_000_000 + 7200, e).hour, 12, "the clock runs on from the epoch");
});

test("parseHHMM", () => {
  assert.equal(parseHHMM("14:20"), 51600);
  assert.equal(parseHHMM("9"), 32400);
  assert.equal(parseHHMM("7.05"), 25500);
  assert.equal(parseHHMM("25:00"), null);
  assert.equal(parseHHMM("noon"), null);
});

test("bandAt: the latest band started; before the first, the last one", () => {
  const bands = [{ from: "11:00", name: "peak" }, { from: "03:00", name: "morning" }, { from: "21:00", name: "night" }, { from: "14:00", name: "afternoon" }];
  assert.equal(bandAt(bands, parseHHMM("12:00")).name, "peak");
  assert.equal(bandAt(bands, parseHHMM("03:00")).name, "morning");
  assert.equal(bandAt(bands, parseHHMM("01:00")).name, "night");
  assert.equal(bandAt([], 0), null);
});

test("durationParts", () => {
  assert.deepEqual(durationParts(86400 * 11 + 3600 * 2 + 600), { days: 11, hours: 2, minutes: 10 });
  assert.deepEqual(durationParts(-5), { days: 0, hours: 0, minutes: 0 });
});

/* ---------------- travel ---------------- */

test("routeLength measures in map widths, aspect-corrected, through wraps", () => {
  assert.equal(routeLength({ x: 0, y: 0.2 }, { x: 0.5, y: 0.2 }), 0.5);
  assert.equal(routeLength({ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.4 }, {}, 0.5), 0.15);
  const wrapped = routeLength({ x: 0.95, y: 0.25 }, { x: 0.05, y: 0.75 }, SIGIL, 0.7);
  assert.ok(wrapped < 0.2, `through the edge is short (${wrapped})`);
});

test("travel rules: per map, rolled, fixed, default, none", () => {
  const travel = {
    foot: { per: "map", amount: 4, unit: "hour" },
    castle: { roll: "3d6", unit: "day" },
    portal: { fixed: 1, unit: "minute" },
    default: { per: "map", amount: 6, unit: "hour" }
  };
  assert.deepEqual(travelEstimate(travelRule(travel, "foot"), 0.5), { kind: "map", seconds: 7200, formula: "", unit: "hour" });
  assert.equal(travelEstimate(travelRule(travel, "foot"), 0.013).seconds, 300, "rounded to 5 minutes, never 0");
  assert.deepEqual(travelEstimate(travelRule(travel, "castle"), 0.3), { kind: "roll", seconds: 0, formula: "3d6", unit: "day" });
  assert.equal(travelEstimate(travelRule(travel, "portal")).seconds, 60);
  assert.equal(travelEstimate(travelRule(travel, "chair"), 1).seconds, 21600, "a way without a rule uses default");
  assert.equal(travelEstimate(null).kind, "none");
  assert.equal(travelRule(null, "foot"), null);
  assert.equal(rolledSeconds(11, "day"), 950400);
});

/* ---------------- tables and progress ---------------- */

test("tableRow and the tables of a trip", () => {
  const table = { formula: "1d6", rows: [{ range: [1, 2], text: "a" }, { range: [3, 3], text: "b" }, { range: 4, text: "c" }] };
  assert.equal(tableRow(table, 2).text, "a");
  assert.equal(tableRow(table, 3).text, "b");
  assert.equal(tableRow(table, 4).text, "c");
  assert.equal(tableRow(table, 6), null);
  const atlas = { areas: [{ id: "hive", table: "hive-enc" }], encounters: { table: "city" } };
  assert.deepEqual(encounterTables(atlas, "hive"), ["hive-enc", "city"]);
  assert.deepEqual(encounterTables(atlas, null), ["city"]);
  assert.deepEqual(encounterTables({}, "x"), []);
});

test("progress tracks: steps reached and crossed", () => {
  const track = { id: "gt", places: ["a", "b", "c", "d", "e", "f", "g"], steps: [{ count: 4, text: "8th" }, { count: 2, text: "7th" }, { count: 6, text: "9th" }] };
  const done = new Set(["a", "c", "e"]);
  const p = progressOf(track, id => done.has(id));
  assert.equal(p.count, 3);
  assert.equal(p.total, 7);
  assert.deepEqual(p.reached.map(s => s.text), ["7th"]);
  assert.equal(p.next.text, "8th");
  assert.deepEqual(stepsCrossed(track, 3, 4).map(s => s.text), ["8th"]);
  assert.deepEqual(stepsCrossed(track, 4, 3), []);
});

test("validatePack checks tables, travel rules and progress", () => {
  const errors = validatePack({ schema: 1, id: "x",
    tables: { ok: { formula: "1d4", rows: [] }, bad: {} },
    atlases: [{ id: "a", areas: [{ id: "w", table: "nope" }], encounters: { table: "ok" }, travel: { foot: { per: "map", amount: 1, unit: "parsec" }, odd: {} } }],
    places: [{ id: "p", atlas: "a", name: "P" }],
    progress: [{ id: "t", places: ["p", "ghost"] }] }).join("\n");
  for (const bit of ["table bad", "unknown table \"nope\"", "unknown unit", "travel \"odd\"", "unknown place \"ghost\""]) assert.ok(errors.includes(bit), bit);
});

test("the party marker's pulse grows and fades, and repeats", async () => {
  const { pulseFrame } = await import("../scripts/util.mjs");
  assert.deepEqual(pulseFrame(0), { scale: 0.6, alpha: 0.9 });
  const mid = pulseFrame(0.9);
  assert.ok(Math.abs(mid.scale - 1.2) < 1e-9 && Math.abs(mid.alpha - 0.45) < 1e-9);
  assert.deepEqual(pulseFrame(1.8), pulseFrame(0));
  assert.deepEqual(pulseFrame(NaN), pulseFrame(0));
  assert.ok(pulseFrame(-0.5).scale >= 0.6);
});
