// World data and the definitions everyone reads. Only the active GM's client writes, one write at a time.
import { MODULE_ID, DEFAULT_CATEGORIES, DEFAULT_HOWS } from "./constants.mjs";
import { setting, setSetting } from "./settings.mjs";
import { normalizeRoad, validatePack } from "./util.mjs";

const clone = v => foundry.utils.deepClone(v);
const newId = () => foundry.utils.randomID();

export const isActiveGM = () => !!game.user?.isGM && (game.users.activeGM?.id ?? game.user.id) === game.user.id;

/** One write at a time: a promise queue. Never call serial() from inside a serial() block. */
let queue = Promise.resolve();
export function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

const afterWrite = new Set();
/** Called after every saved change to the road (the page sync hooks in here). */
export const onRoadWrite = fn => afterWrite.add(fn);

/* ---------------- the road ---------------- */

export const road = () => normalizeRoad(setting("road"), newId);

/** Change the road on the GM's client. fn gets a copy; its result is returned. */
export function mutateRoad(fn) {
  if (!game.user.isGM) throw new Error("Only the GM changes the road.");
  return serial(async () => {
    const r = clone(road());
    const result = await fn(r);
    await setSetting("road", r);
    for (const f of afterWrite) { try { f(); } catch (err) { console.warn(`${MODULE_ID} |`, err); } }
    return result;
  });
}

/* ---------------- the pack and the definitions ---------------- */

export const pack = () => setting("pack");

/** Import a pack (object). Returns the problems found; saves only if there are none. */
export async function importPack(data) {
  const errors = validatePack(data);
  if (errors.length) return errors;
  await setSetting("pack", data);
  return [];
}

/** Categories, ways of travelling, times of day, reveal sets and atlases: the pack's over the built-in ones. */
export function defs() {
  const p = pack() ?? {};
  return {
    categories: { ...DEFAULT_CATEGORIES, ...(p.categories ?? {}) },
    hows: { ...(p.hows ?? DEFAULT_HOWS) },
    times: Array.isArray(p.times) ? p.times : [],
    sets: p.sets ?? {},
    atlases: Array.isArray(p.atlases) ? p.atlases : [],
    company: p.company ?? {},
    pages: p.pages ?? {},
    calendar: p.calendar ?? {},
    tables: p.tables ?? {},
    progress: Array.isArray(p.progress) ? p.progress : []
  };
}

export const atlasDef = id => defs().atlases.find(a => a.id === id) ?? null;

/* ---------------- the party actor ---------------- */

/** The party actor ("the Company"): the one saved in the setting, else a group actor flagged by us. */
export function company() {
  const id = setting("company");
  return (id && game.actors.get(id)) || game.actors.find(a => a.getFlag?.(MODULE_ID, "company")) || null;
}

/** Is this token (document) the Company's? */
export const isCompanyToken = tokenDoc => !!tokenDoc && !!company() && tokenDoc.actorId === company().id;

export const stamp = () => ({ id: newId(), date: new Date().toISOString() });
