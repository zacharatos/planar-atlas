// Pure helpers: no Foundry globals here, so every function can be unit-tested in Node.

export const LANGUAGES = ["en", "el"];

/** A place's status, from unknown to the players to visited. Players see every status but "hidden". */
export const STATUSES = ["hidden", "rumoured", "known", "visited"];

/** dnd5e coins, largest first, and their value in copper. */
export const COINS = ["pp", "gp", "ep", "sp", "cp"];
export const COIN_CP = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

export const ROAD_SCHEMA = 1;
export const PACK_SCHEMA = 1;

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Lower case, no accents, single spaces: "Ο Πανταχού  Οδοιπόρος" matches "ο πανταχου οδοιπορος". */
export function fold(text) {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

/** A key like "Card.Title" in a nested dictionary. */
export function lookup(dict, key) {
  const v = String(key).split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), dict);
  return typeof v === "string" ? v : undefined;
}

/** Fill {placeholders}; unknown ones stay as written. */
export function fill(text, data) {
  if (!data) return text;
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in data && data[k] != null ? String(data[k]) : m));
}

/** The language to use: the user's choice, else the world default, else Foundry's language (Greek or English). */
export function pickLanguage(user, world, foundryLang) {
  if (LANGUAGES.includes(user)) return user;
  if (LANGUAGES.includes(world)) return world;
  return foundryLang === "el" ? "el" : "en";
}

/** Text that can be a string or { en, el }. */
export function localText(value, lang = "en") {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[lang] || value.en || value.el || Object.values(value).find(v => typeof v === "string" && v) || "";
}

/** Find an item by id, then by exact, starting or contained name (accents and case ignored). */
export function findByName(items, query, names = item => [item.name]) {
  const raw = String(query ?? "").trim();
  if (!raw) return null;
  const byId = items.find(item => item.id === raw);
  if (byId) return byId;
  const q = fold(raw);
  for (const test of [a => a === q, a => a.startsWith(q), a => a.includes(q)]) {
    const hit = items.find(item => names(item).some(n => n && test(fold(n))));
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Coordinates                                                         */
/* ------------------------------------------------------------------ */

const round = v => Math.round(v * 100000) / 100000;
const clamp01 = v => Math.min(1, Math.max(0, v));

/** The map's rectangle on the canvas (without the scene padding). dims = scene.dimensions. */
export function sceneRect(dims = {}) {
  return {
    x: Number(dims.sceneX ?? dims.x ?? 0),
    y: Number(dims.sceneY ?? dims.y ?? 0),
    width: Number(dims.sceneWidth ?? dims.width ?? 1) || 1,
    height: Number(dims.sceneHeight ?? dims.height ?? 1) || 1
  };
}

/** Canvas pixels → 0–1 on the map (kept inside the map). */
export function toNorm(rect, x, y) {
  return { x: round(clamp01((x - rect.x) / rect.width)), y: round(clamp01((y - rect.y) / rect.height)) };
}

/** 0–1 on the map → canvas pixels. */
export function fromNorm(rect, p) {
  return { x: rect.x + Number(p.x) * rect.width, y: rect.y + Number(p.y) * rect.height };
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** The closest point within `radius` of (x, y), or null. points: [{x, y, …}] */
export function nearest(points, x, y, radius) {
  let best = null, bestD = Infinity;
  for (const p of points ?? []) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= radius && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/** Where unplaced places wait for the GM to drag them: rows along the bottom-left of the map (0–1). */
export function parkingSpot(index, { step = 0.03, perRow = 20, x0 = 0.02, y0 = 0.96 } = {}) {
  const row = Math.floor(index / perRow), col = index % perRow;
  return { x: round(x0 + col * step), y: round(Math.max(0.02, y0 - row * step * 1.4)) };
}

/* ------------------------------------------------------------------ */
/* Wrap-around maps                                                    */
/* ------------------------------------------------------------------ */
// A map can be split into zones whose edges join: the poster of Sigil shows the ring as two strips, and
// the right end of one strip continues at the left end of the other. A pack lists the zones (0–1 rectangles)
// and the links between their edges; a road between two zones that are linked goes off one edge and
// comes back in at the other, instead of cutting across the poster.

export const EDGES = ["left", "right", "top", "bottom"];

export function zoneOf(zones, p) {
  return (zones ?? []).find(z => p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1) ?? null;
}

const along = (zone, edge, p) => (edge === "left" || edge === "right"
  ? (p.y - zone.y0) / ((zone.y1 - zone.y0) || 1)
  : (p.x - zone.x0) / ((zone.x1 - zone.x0) || 1));

function edgePoint(zone, edge, t) {
  const tt = clamp01(t);
  if (edge === "left") return { x: zone.x0, y: zone.y0 + tt * (zone.y1 - zone.y0) };
  if (edge === "right") return { x: zone.x1, y: zone.y0 + tt * (zone.y1 - zone.y0) };
  if (edge === "top") return { x: zone.x0 + tt * (zone.x1 - zone.x0), y: zone.y0 };
  return { x: zone.x0 + tt * (zone.x1 - zone.x0), y: zone.y1 };
}

/**
 * The road from a to b (0–1 points). Returns { segments: [[p, q], …], wraps: [{at, edge}] }.
 * Straight, unless a and b are in different zones joined by a link: then the shortest way through a link.
 */
export function route(a, b, geo = {}) {
  const direct = { segments: [[a, b]], wraps: [] };
  const za = zoneOf(geo.zones, a), zb = zoneOf(geo.zones, b);
  if (!za || !zb || za.id === zb.id) return direct;
  let best = null;
  for (const link of geo.links ?? []) {
    for (const [from, to] of [[link.a, link.b], [link.b, link.a]]) {
      if (from?.zone !== za.id || to?.zone !== zb.id) continue;
      if (!EDGES.includes(from.edge) || !EDGES.includes(to.edge)) continue;
      const t = (clamp01(along(za, from.edge, a)) + clamp01(along(zb, to.edge, b))) / 2;
      const exit = edgePoint(za, from.edge, t), entry = edgePoint(zb, to.edge, t);
      const len = dist(a, exit) + dist(entry, b);
      if (!best || len < best.len) best = { len, exit, entry, fromEdge: from.edge, toEdge: to.edge };
    }
  }
  if (!best) return direct;
  return {
    segments: [[a, best.exit], [best.entry, b]],
    wraps: [{ at: best.exit, edge: best.fromEdge, out: true }, { at: best.entry, edge: best.toEdge, out: false }]
  };
}

/* ------------------------------------------------------------------ */
/* Coins                                                               */
/* ------------------------------------------------------------------ */

export const noCoins = () => Object.fromEntries(COINS.map(c => [c, 0]));

/** A purse from anything ({gp: "3"} or an actor's system.currency): whole, non-negative numbers. */
export function cleanCoins(c = {}) {
  return Object.fromEntries(COINS.map(k => [k, Math.max(0, Math.trunc(Number(c?.[k]) || 0))]));
}

/**
 * "3gp 5sp", "3 gp, 5 sp", "12" (gold), "2 χρυσά" → { pp, gp, ep, sp, cp }. Null when nothing is understood.
 * Greek coin words are accepted: χρυσά/χρ (gp), ασημένια/ασ (sp), χάλκινα/χαλ (cp), ηλέκτρινα (ep), πλατινένια (pp).
 */
export function parseCoins(text) {
  const s = fold(text).replace(/,/g, " ");
  if (!s) return null;
  const words = [
    ["pp", /^(pp|platinum|πλατιν[α-ω]*|πλ)$/], ["gp", /^(gp|gold|χρυσ[α-ω]*|χρ|gc)$/], ["ep", /^(ep|electrum|ηλεκτρ[α-ω]*|ηλ)$/],
    ["sp", /^(sp|silver|ασημ[α-ω]*|ασ)$/], ["cp", /^(cp|copper|χαλκ[α-ω]*|χαλ)$/]
  ];
  const out = noCoins();
  let found = false;
  const re = /(\d+)\s*([a-zα-ω]+)?/g;
  let m;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    const unit = m[2] ? words.find(([, rx]) => rx.test(m[2]))?.[0] : "gp";
    if (!unit) continue;
    out[unit] += n;
    found = true;
  }
  return found ? out : null;
}

export const coinValue = c => COINS.reduce((sum, k) => sum + (Number(c?.[k]) || 0) * COIN_CP[k], 0);
export const addCoins = (a, b) => Object.fromEntries(COINS.map(k => [k, (Number(a?.[k]) || 0) + (Number(b?.[k]) || 0)]));
export const negCoins = c => Object.fromEntries(COINS.map(k => [k, -(Number(c?.[k]) || 0)]));
export const isZero = c => COINS.every(k => !Number(c?.[k]));
/** b − a, per coin. */
export const diffCoins = (a, b) => Object.fromEntries(COINS.map(k => [k, (Number(b?.[k]) || 0) - (Number(a?.[k]) || 0)]));

/** Break one coin of `coin` into the next smaller coin (pp → 10 gp, gp → 2 ep, ep → 5 sp, sp → 10 cp). */
function breakOne(p, coin) {
  const i = COINS.indexOf(coin), lower = COINS[i + 1];
  p[coin] -= 1;
  p[lower] += COIN_CP[coin] / COIN_CP[lower];
}

/**
 * Pay `cost` out of `purse`, making change like a shopkeeper: a missing coin is taken by breaking the
 * nearest bigger coin; if no bigger coin is left, smaller coins pay. Null if the purse can't afford it.
 */
export function spendCoins(purse, cost) {
  const p = cleanCoins(purse), c = cleanCoins(cost);
  if (coinValue(p) < coinValue(c)) return null;
  for (const k of COINS) p[k] -= c[k];
  for (let i = COINS.length - 1; i >= 0; i--) {
    const k = COINS[i];
    let guard = 10000;
    while (p[k] < 0 && guard-- > 0) {
      // the nearest bigger coin we still have
      let j = i - 1;
      while (j >= 0 && p[COINS[j]] <= 0) j--;
      if (j < 0) break;
      for (let x = j; x < i; x++) {
        // walk the broken coin down to the one we need
        if (p[COINS[x]] > 0) breakOne(p, COINS[x]);
      }
    }
  }
  if (COINS.every(k => p[k] >= 0)) return p;
  // No bigger coins left: pay the shortfall with what remains, as plain value.
  return fromValue(coinValue(p), purse);
}

/** A total in copper as coins, keeping the purse's platinum and electrum where possible. */
function fromValue(cp, like = {}) {
  const out = noCoins();
  let rest = Math.max(0, cp);
  for (const k of ["pp", "gp", "ep", "sp", "cp"]) {
    if ((k === "pp" || k === "ep") && !(Number(like?.[k]) > 0)) continue;
    const n = k === "cp" ? rest : Math.min(Math.floor(rest / COIN_CP[k]), k === "pp" || k === "ep" ? Number(like[k]) : Infinity);
    out[k] = n;
    rest -= n * COIN_CP[k];
  }
  return out;
}

/** "3 gp, 5 sp" (zero coins left out). Signed: "+3 gp" / "−3 gp". */
export function coinsText(c, { signed = false, empty = "0 gp" } = {}) {
  const parts = COINS.filter(k => Number(c?.[k])).map(k => `${Math.abs(Number(c[k]))} ${k}`);
  if (!parts.length) return empty;
  if (!signed) return parts.join(", ");
  const v = coinValue(c);
  return `${v < 0 ? "−" : "+"}${parts.join(", ")}`;
}

/* ------------------------------------------------------------------ */
/* The road                                                            */
/* ------------------------------------------------------------------ */

export function emptyJourney(id, extra = {}) {
  return { id, name: "", archived: false, created: "", stops: [], ...extra };
}

export function emptyRoad(id = "j1") {
  return {
    schema: ROAD_SCHEMA, active: id, journeys: [emptyJourney(id)],
    next: { session: "", day: "", time: "", how: "" },
    hidden: { players: false, all: false }
  };
}

/** Whatever was saved, made safe to read. */
export function normalizeRoad(raw, makeId = () => "j1") {
  const r = raw && typeof raw === "object" ? structuredClone(raw) : emptyRoad(makeId());
  r.schema = ROAD_SCHEMA;
  r.journeys = Array.isArray(r.journeys) ? r.journeys.filter(j => j && j.id) : [];
  for (const j of r.journeys) {
    j.stops = Array.isArray(j.stops) ? j.stops.filter(s => s && s.id) : [];
    j.name ??= "";
    j.archived = !!j.archived;
  }
  if (!r.journeys.some(j => j.id === r.active && !j.archived)) {
    const open = r.journeys.find(j => !j.archived);
    if (open) r.active = open.id;
    else { const id = makeId(); r.journeys.push(emptyJourney(id)); r.active = id; }
  }
  r.next = { session: "", day: "", time: "", how: "", ...(r.next ?? {}) };
  r.hidden = { players: false, all: false, ...(r.hidden ?? {}) };
  return r;
}

export const activeJourney = road => road.journeys.find(j => j.id === road.active) ?? null;
export const lastStop = road => activeJourney(road)?.stops.at(-1) ?? null;

/** True if a new stop is the same spot as the last one (same place, or within eps on the same atlas). */
export function sameSpot(a, b, eps = 0.004) {
  if (!a || !b || a.atlas !== b.atlas) return false;
  if (a.place || b.place) return !!a.place && a.place === b.place;
  return Math.hypot(a.x - b.x, a.y - b.y) < eps;
}

/** Add a stop to the active journey (mutates road). Returns the stop, or null if it is the same spot. */
export function addStop(road, stop) {
  const j = activeJourney(road);
  if (!j) return null;
  if (sameSpot(j.stops.at(-1), stop)) return null;
  j.stops.push(stop);
  return stop;
}

export function findStop(road, id) {
  for (const j of road.journeys) {
    const s = j.stops.find(x => x.id === id);
    if (s) return { journey: j, stop: s };
  }
  return null;
}

export function removeStop(road, id) {
  const hit = findStop(road, id);
  if (!hit) return null;
  hit.journey.stops = hit.journey.stops.filter(s => s.id !== id);
  return hit.stop;
}

const EDITABLE = ["note", "day", "time", "how", "session", "label", "cost"];
export function updateStop(road, id, patch = {}) {
  const hit = findStop(road, id);
  if (!hit) return null;
  for (const k of EDITABLE) if (k in patch) hit.stop[k] = patch[k];
  return hit.stop;
}

/**
 * Close the active journey under a name and open a new one, which starts where the party stands
 * (a copy of the last stop), so the road goes on from there.
 */
export function archiveJourney(road, { name = "", newId, stopId, date = "" }) {
  const j = activeJourney(road);
  if (!j) return null;
  j.archived = true;
  j.name = name || j.name;
  j.closed = date;
  const next = emptyJourney(newId, { created: date });
  const last = j.stops.at(-1);
  if (last) next.stops.push({ ...structuredClone(last), id: stopId, start: true });
  road.journeys.push(next);
  road.active = newId;
  return next;
}

export function clearJourney(road) {
  const j = activeJourney(road);
  if (j) j.stops = [];
  return j;
}

/** Delete an archived journey (the active one can only be cleared). */
export function deleteJourney(road, id) {
  if (id === road.active) return false;
  const before = road.journeys.length;
  road.journeys = road.journeys.filter(j => j.id !== id);
  return road.journeys.length < before;
}

/** Every visit to a place, oldest first: [{session, day, time, journey}]. */
export function visitsOf(road, placeId) {
  const out = [];
  for (const j of road.journeys) for (const s of j.stops) {
    if (s.place === placeId && !s.start) out.push({ session: s.session ?? "", day: s.day ?? "", time: s.time ?? "", journey: j.id });
  }
  return out;
}

/** Sessions in the order they first appear, for shading the road (older = fainter). */
export function sessionOrder(stops) {
  const seen = [];
  for (const s of stops) { const k = s.session ?? ""; if (!seen.includes(k)) seen.push(k); }
  return seen;
}

/** Opacity of a session's part of the road: the latest is solid, older ones fade to `min`. */
export function sessionAlpha(index, count, min = 0.35) {
  if (count <= 1) return 1;
  return Math.round((min + (1 - min) * (index / (count - 1))) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Packs                                                               */
/* ------------------------------------------------------------------ */

/** Problems in a campaign pack (empty list = fine). */
export function validatePack(p) {
  const errors = [];
  if (!p || typeof p !== "object") return ["The pack is not a JSON object."];
  if (p.schema !== PACK_SCHEMA) errors.push(`schema must be ${PACK_SCHEMA}`);
  if (!p.id) errors.push("id is missing");
  const atlases = Array.isArray(p.atlases) ? p.atlases : [];
  if (!atlases.length) errors.push("atlases: at least one atlas is needed");
  const atlasIds = new Set();
  for (const a of atlases) {
    if (!a?.id) { errors.push("an atlas has no id"); continue; }
    if (atlasIds.has(a.id)) errors.push(`atlas ${a.id} appears twice`);
    atlasIds.add(a.id);
    for (const z of a.zones ?? []) {
      if (!z?.id || ![z.x0, z.y0, z.x1, z.y1].every(Number.isFinite)) errors.push(`atlas ${a.id}: zone ${z?.id ?? "?"} needs id, x0, y0, x1, y1`);
    }
    const zoneIds = new Set((a.zones ?? []).map(z => z.id));
    for (const l of a.links ?? []) {
      for (const end of [l?.a, l?.b]) {
        if (!zoneIds.has(end?.zone) || !EDGES.includes(end?.edge)) errors.push(`atlas ${a.id}: a link needs {zone, edge} on both ends`);
      }
    }
  }
  const tableIds = new Set(Object.keys(p.tables ?? {}));
  for (const [id, tb] of Object.entries(p.tables ?? {})) {
    if (!tb?.rollTable && !(tb?.formula && Array.isArray(tb.rows))) errors.push(`table ${id}: needs formula + rows, or rollTable`);
  }
  for (const a of atlases) {
    for (const area of a?.areas ?? []) if (area.table && !tableIds.has(area.table)) errors.push(`atlas ${a.id}: area ${area.id} uses unknown table "${area.table}"`);
    if (a?.encounters?.table && !tableIds.has(a.encounters.table)) errors.push(`atlas ${a.id}: unknown encounter table "${a.encounters.table}"`);
    for (const [how, rule] of Object.entries(a?.travel ?? {})) {
      if (!rule || typeof rule !== "object" || !(rule.roll || rule.per === "map" || rule.fixed != null)) errors.push(`atlas ${a.id}: travel "${how}" needs roll, per: "map" or fixed`);
      else if (rule.unit && !UNIT_SECONDS[rule.unit]) errors.push(`atlas ${a.id}: travel "${how}" has an unknown unit "${rule.unit}"`);
    }
  }
  const placeIds = new Set();
  for (const pl of Array.isArray(p.places) ? p.places : []) {
    if (!pl?.id) { errors.push("a place has no id"); continue; }
    if (placeIds.has(pl.id)) errors.push(`place ${pl.id} appears twice`);
    placeIds.add(pl.id);
    if (!atlasIds.has(pl.atlas)) errors.push(`place ${pl.id}: unknown atlas "${pl.atlas}"`);
    if (pl.status && !STATUSES.includes(pl.status)) errors.push(`place ${pl.id}: unknown status "${pl.status}"`);
    for (const k of ["x", "y"]) {
      if (pl[k] != null && !(Number.isFinite(pl[k]) && pl[k] >= 0 && pl[k] <= 1)) errors.push(`place ${pl.id}: ${k} must be between 0 and 1, or null`);
    }
    if (!localText(pl.name)) errors.push(`place ${pl.id}: no name`);
  }
  for (const tr of Array.isArray(p.progress) ? p.progress : []) {
    if (!tr?.id) errors.push("a progress track has no id");
    for (const id of tr?.places ?? []) if (!placeIds.has(id)) errors.push(`progress ${tr?.id}: unknown place "${id}"`);
  }
  return errors;
}

/** The fields of a place, with defaults (no position). */
export function placeData(pl = {}) {
  return {
    id: String(pl.id ?? ""),
    atlas: String(pl.atlas ?? ""),
    cat: pl.cat ?? "landmark",
    status: STATUSES.includes(pl.status) ? pl.status : "hidden",
    name: pl.name ?? "",
    text: pl.text ?? "",
    rumour: pl.rumour ?? "",
    gm: pl.gm ?? "",
    ref: pl.ref ?? "",
    img: pl.img ?? "",
    area: pl.area ?? "",
    sets: Array.isArray(pl.sets) ? [...pl.sets] : [],
    price: pl.price ?? "",
    done: !!pl.done,
    links: { theater: "", theaterScene: "", scape: "", scene: "", faction: "", prep: "", ...(pl.links ?? {}) }
  };
}

/** What a player sees as a place's label: nothing (hidden), "?" (rumoured) or its name. */
export function playerLabel(place, lang) {
  if (place.status === "hidden") return "";
  if (place.status === "rumoured") return "?";
  return localText(place.name, lang);
}

/** The pack with the places as they are now in the world (positions, text, new places), for saving back. */
export function exportPack(pack, places) {
  const out = structuredClone(pack ?? { schema: PACK_SCHEMA, id: "atlas", atlases: [], places: [] });
  const byId = new Map((out.places ?? []).map(p => [p.id, p]));
  for (const pl of places) {
    const old = byId.get(pl.id) ?? {};
    const merged = { ...old, ...placeData({ ...old, ...pl }), x: pl.x ?? null, y: pl.y ?? null };
    // The pack keeps its starting status: the world's current status is play, not prep.
    merged.status = old.status ?? merged.status;
    byId.set(pl.id, merged);
  }
  out.places = [...byId.values()];
  return out;
}

/* ------------------------------------------------------------------ */
/* Journal buttons                                                     */
/* ------------------------------------------------------------------ */

const VERBS = ["reveal", "rumour", "hide", "set", "pay", "move", "open"];

/**
 * "@Atlas[…]" arguments:
 *   "Ο Πανταχού Οδοιπόρος"            → { verb: "open", target }
 *   "Ο Πανταχού Οδοιπόρος | move"     → { verb: "move", target }
 *   "reveal: Αρχειοφυλάκειο"          → { verb: "reveal", target }
 *   "set: parisa"                     → { verb: "set", target: "parisa" }
 *   "pay: 3gp | Παρίζα, μια μέρα"     → { verb: "pay", target: "3gp", reason }
 */
export function parseAtlasArgs(text) {
  const [head = "", ...rest] = String(text ?? "").split("|").map(s => s.trim());
  const m = head.match(/^(\w+)\s*:\s*(.*)$/);
  let verb = "open", target = head;
  if (m && VERBS.includes(m[1].toLowerCase())) { verb = m[1].toLowerCase(); target = m[2].trim(); }
  let reason = "";
  for (const opt of rest) {
    const o = opt.toLowerCase();
    if (verb === "open" && VERBS.includes(o)) verb = o;
    else reason = reason ? `${reason} | ${opt}` : opt;
  }
  return { verb, target, reason };
}

/* ------------------------------------------------------------------ */
/* Journal pages (Markdown)                                            */
/* ------------------------------------------------------------------ */

const cell = v => String(v ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();

/**
 * The road as Markdown: the active journey, then the archived ones.
 * labels: { title, intro, none, active, archived, cols: {n, session, day, place, how, travel, cost, note} }
 * names: { place(stop) → text, how(id) → text, atlas(id) → text, duration(seconds) → text }
 */
export function roadMarkdown(road, labels, names) {
  const fm = `---\ntype: log\ntags: [planar-atlas, road]\n---\n`;
  const out = [fm, `# ${labels.title}`, "", `> ${labels.intro}`, ""];
  const table = j => {
    if (!j.stops.length) return [`*${labels.none}*`, ""];
    const c = labels.cols;
    const rows = [`| ${c.n} | ${c.session} | ${c.day} | ${c.place} | ${c.how} | ${c.travel} | ${c.cost} | ${c.note} |`, "|---|---|---|---|---|---|---|---|"];
    j.stops.forEach((s, i) => {
      const day = [s.day, s.time].filter(Boolean).join(" · ");
      const trip = s.travel?.seconds ? (names.duration?.(s.travel.seconds) ?? "") : "";
      rows.push(`| ${i + 1} | ${cell(s.session)} | ${cell(day)} | ${cell(names.place(s))} (${cell(names.atlas(s.atlas))}) | ${cell(names.how(s.how))} | ${cell(trip)} | ${cell(s.cost)} | ${cell(s.note)} |`);
    });
    return [...rows, ""];
  };
  const active = activeJourney(road);
  if (active) out.push(`## ${labels.active}${active.name ? `: ${active.name}` : ""}`, "", ...table(active));
  for (const j of road.journeys.filter(x => x.archived).reverse()) {
    out.push(`## ${labels.archived}: ${j.name || j.id}`, "", ...table(j));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * The purse as Markdown: what is in it now, then every change, newest first.
 * labels: { title, intro, now, none, cols: {when, session, who, amount, why} }
 */
export function purseMarkdown(purse, log, labels) {
  const fm = `---\ntype: log\ntags: [planar-atlas, purse]\nvisibility: players\n---\n`;
  const out = [fm, `# ${labels.title}`, "", `> ${labels.intro}`, "", `**${labels.now}:** ${coinsText(purse)}`, ""];
  if (!log.length) out.push(`*${labels.none}*`);
  else {
    const c = labels.cols;
    out.push(`| ${c.when} | ${c.session} | ${c.who} | ${c.amount} | ${c.why} |`, "|---|---|---|---|---|");
    for (const e of [...log].reverse()) {
      out.push(`| ${cell(String(e.date ?? "").slice(0, 10))} | ${cell(e.session)} | ${cell(e.who)} | ${cell(coinsText(e.delta, { signed: true }))} | ${cell(e.why)}${e.undone ? " ↺" : ""} |`);
    }
  }
  return out.join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/* The in-world clock                                                  */
/* ------------------------------------------------------------------ */
// The clock is a number of seconds. Day 1 starts at the "epoch" (a number of seconds on the same clock, so the
// GM can say "it is now day 3, 10:00" without changing Foundry's own world time).

export const UNIT_SECONDS = { minute: 60, hour: 3600, day: 86400, week: 604800 };
export const DAY = 86400;

/** { day (from 1), hour, minute, secondsOfDay } for a clock value. */
export function clockParts(seconds, epoch = 0) {
  const t = Math.floor(Number(seconds) || 0) - Math.floor(Number(epoch) || 0);
  const day = Math.floor(t / DAY);
  const sod = t - day * DAY;
  return { day: day + 1, hour: Math.floor(sod / 3600), minute: Math.floor((sod % 3600) / 60), secondsOfDay: sod };
}

const pad = n => String(n).padStart(2, "0");
export const hhmm = ({ hour, minute }) => `${pad(hour)}:${pad(minute)}`;

/** "14:20" or "14.20" or "9" → seconds of the day (null if not a time). */
export function parseHHMM(text) {
  const m = String(text ?? "").trim().match(/^(\d{1,2})(?:[:.](\d{1,2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return h * 3600 + min * 60;
}

/** The epoch that makes `seconds` read as day `day` at `timeOfDay` (seconds). */
export function epochFor(seconds, day, timeOfDay) {
  return Math.floor(Number(seconds) || 0) - ((Math.max(1, Math.floor(Number(day) || 1)) - 1) * DAY + Math.floor(Number(timeOfDay) || 0));
}

/**
 * The named part of the day ("ζενίθ") from the pack's bands: [{from: "11:00", name}], sorted or not.
 * The band with the latest start at or before the time wins; before the first, the last band of the day.
 */
export function bandAt(bands, secondsOfDay) {
  const list = (bands ?? []).map(b => ({ ...b, at: parseHHMM(b.from) })).filter(b => b.at !== null).sort((a, b) => a.at - b.at);
  if (!list.length) return null;
  let hit = list[list.length - 1];
  for (const b of list) if (b.at <= secondsOfDay) hit = b;
  return hit;
}

/** "3 h 20 min", "4 days", "10 min" (English units; the interface localizes the words). */
export function durationParts(seconds) {
  let s = Math.max(0, Math.round(Number(seconds) || 0));
  const days = Math.floor(s / DAY); s -= days * DAY;
  const hours = Math.floor(s / 3600); s -= hours * 3600;
  const minutes = Math.round(s / 60);
  return { days, hours, minutes };
}

/* ------------------------------------------------------------------ */
/* Travel time                                                         */
/* ------------------------------------------------------------------ */
// A pack gives each atlas a rule per way of travelling:
//   { "per": "map", "amount": 4, "unit": "hour" }   time to cross the whole map's width; scaled by the road's length
//   { "roll": "3d6", "unit": "day" }               rolled each trip (the Outlands: "3d6 days between gate-towns")
//   { "fixed": 1, "unit": "minute" }               always the same (a portal)
// and "default" for ways without their own rule.

/** Length of the road from a to b in map widths (0–1 points, the map's height/width ratio, wrap-around). */
export function routeLength(a, b, geo = {}, aspect = 1) {
  const r = route(a, b, geo);
  let len = 0;
  for (const [p, q] of r.segments) len += Math.hypot(q.x - p.x, (q.y - p.y) * aspect);
  return Math.round(len * 10000) / 10000;
}

/** The rule for a way of travelling on an atlas (or null). */
export function travelRule(travel, how) {
  if (!travel || typeof travel !== "object") return null;
  const r = travel[how] ?? travel.default ?? null;
  return r && typeof r === "object" ? r : null;
}

/**
 * What a trip costs in time before any dice: { kind: "map"|"roll"|"fixed"|"none", seconds, formula, unit }.
 * For a roll, `seconds` is 0 and `formula` + `unit` tell the caller what to roll.
 */
export function travelEstimate(rule, length = 0) {
  if (!rule) return { kind: "none", seconds: 0, formula: "", unit: "" };
  const unit = UNIT_SECONDS[rule.unit] ? rule.unit : "hour";
  if (rule.roll) return { kind: "roll", seconds: 0, formula: String(rule.roll), unit };
  if (rule.per === "map") {
    const s = Math.max(Number(rule.min ?? 0) * UNIT_SECONDS.minute, Number(rule.amount || 0) * UNIT_SECONDS[unit] * Math.max(0, Number(length) || 0));
    const step = Number(rule.round ?? 5) * 60; // rounded to 5 minutes by default
    return { kind: "map", seconds: step > 0 ? Math.max(step, Math.round(s / step) * step) : Math.round(s), formula: "", unit };
  }
  if (rule.fixed != null) return { kind: "fixed", seconds: Math.round(Number(rule.fixed || 0) * UNIT_SECONDS[unit]), formula: "", unit };
  return { kind: "none", seconds: 0, formula: "", unit };
}

/** Seconds for a rolled total in a unit. */
export const rolledSeconds = (total, unit) => Math.max(0, Math.round(Number(total) || 0)) * (UNIT_SECONDS[unit] ?? UNIT_SECONDS.hour);

/* ------------------------------------------------------------------ */
/* Encounter tables                                                    */
/* ------------------------------------------------------------------ */
// A pack table: { name, formula: "1d8", rows: [{ range: [1, 1], text }], ref } (or { rollTable: "World table name" }).

/** The row of an inline table for a rolled total (null if none). */
export function tableRow(table, total) {
  const n = Number(total);
  return (table?.rows ?? []).find(r => {
    const [lo, hi] = Array.isArray(r.range) ? r.range : [r.range, r.range];
    return n >= Number(lo) && n <= Number(hi ?? lo);
  }) ?? null;
}

/** Which tables to roll for a trip: the destination area's, then the atlas's (ids, no duplicates). */
export function encounterTables(atlas, areaId) {
  const out = [];
  const area = (atlas?.areas ?? []).find(a => a.id === areaId);
  if (area?.table) out.push(area.table);
  if (atlas?.encounters?.table && !out.includes(atlas.encounters.table)) out.push(atlas.encounters.table);
  return out;
}

/* ------------------------------------------------------------------ */
/* Progress tracks                                                     */
/* ------------------------------------------------------------------ */
// A pack track: { id, name, places: [ids], steps: [{ count: 2, text }], players: true }.

/** How far a track is: { done: [ids], count, total, reached: [steps], next: step|null }. */
export function progressOf(track, isDone) {
  const ids = Array.isArray(track?.places) ? track.places : [];
  const done = ids.filter(id => isDone(id));
  const steps = [...(track?.steps ?? [])].sort((a, b) => a.count - b.count);
  return {
    done, count: done.length, total: ids.length,
    reached: steps.filter(s => done.length >= s.count),
    next: steps.find(s => done.length < s.count) ?? null
  };
}

/** Steps newly reached when the count goes from `before` to `after`. */
export const stepsCrossed = (track, before, after) => (track?.steps ?? []).filter(s => before < s.count && after >= s.count);
