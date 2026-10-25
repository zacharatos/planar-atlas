// Places: one map note per place on the atlas scene, each linked to its own page in the atlas's journal.
// The page holds the place's data (flags.planar-atlas.place) and decides who sees the note: a hidden place's
// page is GM-only; any other status gives players Observer access. (Limited would show the note, but Foundry
// doesn't let a player double-click a note whose text page they can only see as Limited, so no card would open.)
// The page's own text is player-safe (name and what they know); the GM's notes live only in the flags.
import { MODULE_ID, FOLDER, PIN_SIZE, HIDDEN_ALPHA } from "./constants.mjs";
import { t, info, warn, local, language } from "./i18n.mjs";
import { pack, defs, isActiveGM } from "./state.mjs";
import { atlasIdOf, sceneOfAtlas, norm, px, atlasName } from "./atlas.mjs";
import { placeData, playerLabel, parkingSpot, localText, exportPack, STATUSES, escapeHTML as esc, findByName, progressOf, stepsCrossed } from "./util.mjs";

const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;

/* ---------------- finding things ---------------- */

/** The place data on a journal page, or null. */
export const placeOfPage = page => page?.getFlag?.(MODULE_ID, "place") ?? null;

/** The page a map note points to. */
export function pageOfNote(note) {
  const doc = note?.document ?? note;
  if (!doc) return null;
  try { if (doc.page) return doc.page; } catch { /* older shapes */ }
  return game.journal.get(doc.entryId)?.pages?.get(doc.pageId) ?? null;
}

/** The place data behind a map note, or null for any other note. */
export const placeOfNote = note => placeOfPage(pageOfNote(note));

/** Every place page (all atlases, or one). */
export function placePages(atlasId = null) {
  const out = [];
  for (const entry of game.journal) {
    if (!entry.getFlag?.(MODULE_ID, "atlas")) continue;
    for (const page of entry.pages) {
      const pl = placeOfPage(page);
      if (pl && (!atlasId || pl.atlas === atlasId)) out.push(page);
    }
  }
  return out;
}

/** The map note of a place page on its atlas scene. */
export function noteOfPage(page) {
  const pl = placeOfPage(page);
  const scene = pl ? sceneOfAtlas(pl.atlas) : null;
  return scene?.notes.find(n => n.pageId === page.id) ?? null;
}

/** Places of an atlas with where they are: [{page, place, note, x, y}] (x, y from 0 to 1, null if not on the map). */
export function placesOn(atlasId) {
  const scene = sceneOfAtlas(atlasId);
  return placePages(atlasId).map(page => {
    const place = placeOfPage(page);
    const note = scene?.notes.find(n => n.pageId === page.id) ?? null;
    const p = note ? norm(scene, note.x, note.y) : null;
    return { page, place, note, x: p?.x ?? null, y: p?.y ?? null };
  });
}

/** A place by id or name, on any atlas: {page, place} or null. */
export function findPlace(query) {
  const all = placePages().map(page => ({ page, place: placeOfPage(page), id: placeOfPage(page).id }));
  return findByName(all, query, x => [localText(x.place.name, "el"), localText(x.place.name, "en"), x.page.name]);
}

export const placeName = (place, lang = language()) => localText(place?.name, lang) || place?.id || "?";

/* ---------------- the atlas journal ---------------- */

async function folder() {
  let f = game.folders.find(x => x.type === "JournalEntry" && x.name === FOLDER);
  f ??= await getDocumentClass("Folder").create({ name: FOLDER, type: "JournalEntry" });
  return f;
}

/** The GM-only journal entry that holds an atlas's place pages (made on first use). */
export async function atlasJournal(atlasId) {
  const found = game.journal.find(j => j.getFlag?.(MODULE_ID, "atlas") === atlasId);
  if (found) return found;
  return getDocumentClass("JournalEntry").create({
    name: `${t("Journal.Prefix")} ${atlasName(atlasId)}`,
    folder: (await folder()).id,
    ownership: { default: OWN().NONE },
    flags: { [MODULE_ID]: { atlas: atlasId } }
  });
}

/**
 * Page ownership for a status: players need Observer to see a map note and double-click it. A parked place
 * (waiting at the bottom of the map for the GM to drag it into place) stays GM-only whatever its status.
 */
const ownershipFor = (status, parked = false) => ({ default: status === "hidden" || parked ? OWN().NONE : OWN().OBSERVER });

/** The page's text (what a player who can read it sees in the journal). */
function pageHTML(pl) {
  const name = localText(pl.name, "el") || localText(pl.name, "en");
  const text = localText(pl.text, "el") || localText(pl.text, "en");
  return `<h2>${esc(name)}</h2>${text ? `<p>${esc(text).replace(/\n+/g, "</p><p>")}</p>` : ""}`;
}

const pageName = pl => localText(pl.name, "el") || localText(pl.name, "en") || pl.id;

function pageDataFor(pl, { parked = false } = {}) {
  return {
    name: pageName(pl), type: "text",
    text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1, content: pageHTML(pl) },
    ownership: ownershipFor(pl.status, parked),
    flags: { [MODULE_ID]: { place: pl } }
  };
}

function noteDataFor(page, pl, { x, y }) {
  const cat = defs().categories[pl.cat] ?? defs().categories.landmark;
  return {
    entryId: page.parent.id, pageId: page.id,
    x: Math.round(x), y: Math.round(y),
    texture: { src: cat.icon, tint: cat.color ?? "#ffffff" },
    iconSize: PIN_SIZE, text: pageName(pl), fontSize: 26,
    textAnchor: CONST.TEXT_ANCHOR_POINTS?.BOTTOM ?? 1,
    global: true,
    flags: { [MODULE_ID]: { pin: pl.id } }
  };
}

/* ---------------- setting an atlas up from the pack ---------------- */

/**
 * Create or refresh the places of an atlas from the pack: new places get a page and a note (at their pack
 * position, or parked at the bottom of the map for the GM to drag); existing places get the pack's text and
 * links but keep their status and position in this world.
 */
export async function setupPlaces(atlasId) {
  if (!game.user.isGM) return null;
  const scene = sceneOfAtlas(atlasId);
  if (!scene) return warn("Notify.NoScene", { name: atlasName(atlasId) });
  const entry = await atlasJournal(atlasId);
  const fromPack = (pack()?.places ?? []).filter(p => p.atlas === atlasId);
  const pages = new Map(placePages(atlasId).map(p => [placeOfPage(p).id, p]));
  let created = 0, updated = 0, parked = 0, pinned = 0;

  const isPlaced = p => Number.isFinite(p.x) && Number.isFinite(p.y);
  const toCreate = fromPack.filter(p => !pages.has(p.id)).map(p => pageDataFor(placeData(p), { parked: !isPlaced(p) }));
  const fresh = new Set(toCreate.map(c => c.flags[MODULE_ID].place.id));
  if (toCreate.length) {
    const made = await entry.createEmbeddedDocuments("JournalEntryPage", toCreate);
    for (const page of made) pages.set(placeOfPage(page).id, page);
    created = made.length;
  }
  for (const p of fromPack) {
    const page = pages.get(p.id);
    const old = placeOfPage(page);
    if (!page || !old || fresh.has(p.id)) continue;
    // The pack refreshes text and links; status and "completed" are play, kept from this world.
    const next = { ...placeData(p), status: old.status, done: !!old.done };
    if (JSON.stringify(next) === JSON.stringify(old)) continue;
    await page.update({ name: pageName(next), "text.content": pageHTML(next), [`flags.${MODULE_ID}.place`]: next });
    updated++;
  }

  // Notes for pages that have none on the map.
  const noted = new Set(scene.notes.map(n => n.pageId));
  const notes = [];
  let parkIndex = scene.notes.filter(n => n.getFlag(MODULE_ID, "parked")).length;
  for (const p of fromPack) {
    const page = pages.get(p.id);
    if (!page || noted.has(page.id)) continue;
    const placed = isPlaced(p);
    const spot = placed ? { x: p.x, y: p.y } : parkingSpot(parkIndex++);
    const data = noteDataFor(page, placeOfPage(page), px(scene, spot));
    if (!placed) { data.flags[MODULE_ID].parked = true; parked++; }
    notes.push(data);
  }
  if (notes.length) { await scene.createEmbeddedDocuments("Note", notes); pinned = notes.length; }
  info("Notify.PlacesSetUp", { name: atlasName(atlasId), created, updated, pinned, parked });
  return { created, updated, pinned, parked };
}

/* ---------------- changing places ---------------- */

/** Save a place's data (GM). Moves nothing. */
export async function savePlace(page, patch) {
  if (!game.user.isGM || !page) return null;
  const old = placeOfPage(page);
  const next = placeData({ ...old, ...patch, links: { ...old.links, ...(patch.links ?? {}) }, id: old.id, atlas: old.atlas });
  const parked = !!noteOfPage(page)?.getFlag(MODULE_ID, "parked");
  await page.update({
    name: pageName(next), "text.content": pageHTML(next), ownership: ownershipFor(next.status, parked),
    [`flags.${MODULE_ID}.place`]: next
  });
  const note = noteOfPage(page);
  if (note) {
    const cat = defs().categories[next.cat] ?? defs().categories.landmark;
    const upd = { text: pageName(next), "texture.src": cat.icon, "texture.tint": cat.color ?? "#ffffff" };
    if (patch.status && next.status !== "hidden" && note.getFlag(MODULE_ID, "parked")) info("Notify.RevealedParked", { name: placeName(next) });
    await note.update(upd);
  }
  return next;
}

/** Change a place's status: hidden / rumoured / known / visited. */
export async function setStatus(page, status) {
  if (!STATUSES.includes(status)) return null;
  return savePlace(page, { status });
}

/* ---------------- progress ---------------- */

/** How far a progress track is (places marked completed). */
export function trackProgress(track) {
  const done = new Set(placePages().map(placeOfPage).filter(p => p?.done).map(p => p.id));
  return progressOf(track, id => done.has(id));
}

/** Mark a place completed (or not); tells the GM when a track reaches a step ("4 gate-towns → 8th level"). */
export async function setDone(page, done) {
  if (!game.user.isGM || !page) return null;
  const tracks = defs().progress;
  const before = tracks.map(tr => trackProgress(tr).count);
  const next = await savePlace(page, { done: !!done });
  tracks.forEach((tr, i) => {
    for (const step of stepsCrossed(tr, before[i], trackProgress(tr).count)) {
      ui.notifications.info(t("Notify.StepReached", { track: local(tr.name) || tr.id, count: step.count, text: local(step.text) }), { permanent: true });
    }
  });
  return next;
}

/** A visit makes a place "visited" (and tells the players' maps). */
export async function markVisited(placeId) {
  const page = placePages().find(p => placeOfPage(p).id === placeId);
  if (page && placeOfPage(page).status !== "visited") await setStatus(page, "visited");
}

/**
 * Reveal every place of a set. A set raises its places to its own status ("known" unless the pack says
 * "rumoured"), never lowers one: a visited place stays visited. Returns how many changed.
 */
export async function revealSet(setId) {
  if (!game.user.isGM) return 0;
  const set = defs().sets?.[setId] ?? {};
  const target = STATUSES.includes(set.status) ? set.status : "known";
  let n = 0;
  for (const page of placePages()) {
    const pl = placeOfPage(page);
    if (!pl.sets?.includes(setId) || STATUSES.indexOf(pl.status) >= STATUSES.indexOf(target)) continue;
    await setStatus(page, target);
    n++;
  }
  info("Notify.SetRevealed", { name: local(set.name) || setId, n });
  return n;
}

/** A new place on the viewed atlas, at a canvas point (default: the middle of the view). */
export async function createPlace(point = null) {
  const scene = canvas.scene;
  const atlasId = atlasIdOf(scene);
  if (!game.user.isGM || !atlasId) return warn("Notify.NotOnAtlas");
  const entry = await atlasJournal(atlasId);
  const id = `new-${foundry.utils.randomID(6).toLowerCase()}`;
  const pl = placeData({ id, atlas: atlasId, cat: "landmark", status: "hidden", name: { el: t("Place.NewName"), en: t("Place.NewName") } });
  const [page] = await entry.createEmbeddedDocuments("JournalEntryPage", [pageDataFor(pl)]);
  const at = point ?? { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y };
  await scene.createEmbeddedDocuments("Note", [noteDataFor(page, pl, at)]);
  return page;
}

/** Delete a place: its map note and its page (asks first). Files are never touched. */
export async function deletePlace(page) {
  if (!game.user.isGM || !page) return false;
  const name = placeName(placeOfPage(page));
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("Place.DeleteTitle") }, content: `<p>${esc(t("Place.DeleteAsk", { name }))}</p>`
  });
  if (!ok) return false;
  const note = noteOfPage(page);
  if (note) await note.delete();
  await page.delete();
  return true;
}

/* ---------------- the pack, written back ---------------- */

/** The pack with every place as it is now in this world (positions included), for the GM to save. */
export function packForExport() {
  const places = [];
  for (const a of defs().atlases) {
    for (const { place, x, y, note } of placesOn(a.id)) {
      const parked = note?.getFlag(MODULE_ID, "parked");
      places.push({ ...place, x: parked ? null : x, y: parked ? null : y });
    }
  }
  return exportPack(pack(), places);
}

export function downloadPack() {
  const data = packForExport();
  const save = foundry.utils?.saveDataToFile ?? globalThis.saveDataToFile;
  save(JSON.stringify(data, null, 2), "application/json", `${data.id || "atlas"}-pack.json`);
  info("Notify.Exported", { n: data.places.length });
}

/* ---------------- how a place looks on the map ---------------- */

/** Per user: the GM sees every place (hidden ones faded), players see their own label ("?" for a rumour). */
export function styleNote(note) {
  const pl = placeOfNote(note);
  if (!pl) return;
  const gm = game.user.isGM;
  const label = gm ? placeName(pl) + (pl.status === "hidden" ? " ⦸" : pl.status === "rumoured" ? " ?" : "") : playerLabel(pl, language());
  try {
    if (note.controlIcon) note.controlIcon.alpha = gm && pl.status === "hidden" ? HIDDEN_ALPHA : 1;
    if (note.tooltip && note.tooltip.text !== label) note.tooltip.text = label;
  } catch (err) { console.debug(`${MODULE_ID} | note style`, err); }
}

/** A moved note is no longer parked: players can see it from now on (if its status lets them). */
export async function onNoteUpdated(note, changed) {
  if (!isActiveGM() || !placeOfNote(note)) return;
  if (("x" in (changed ?? {}) || "y" in (changed ?? {})) && note.getFlag(MODULE_ID, "parked")) {
    await note.unsetFlag(MODULE_ID, "parked");
    const page = pageOfNote(note);
    if (page) await savePlace(page, {});
  }
}

/* ---------------- players' map notes ---------------- */

// Map notes only show (and can be clicked) on the token layer when the client's "show map notes" toggle is on.
// On an atlas we switch it on for everyone, and put the user's own choice back when they leave the atlas.
let notesBefore = null;
export async function syncNotesToggle(scene) {
  let current;
  try { current = game.settings.get("core", "notesDisplayToggle"); } catch { return; }
  if (isAtlasScene(scene)) {
    if (!current) { notesBefore = false; await game.settings.set("core", "notesDisplayToggle", true); }
  } else if (notesBefore === false) {
    notesBefore = null;
    if (current) await game.settings.set("core", "notesDisplayToggle", false);
  }
}
const isAtlasScene = scene => !!atlasIdOf(scene);

/** Redraw a place's note in this browser (a status change shows or hides it for players). */
export function refreshNoteOf(page) {
  const note = noteOfPage(page);
  const obj = note?.object;
  if (!obj) return;
  try {
    if (obj.renderFlags?.set) obj.renderFlags.set({ refresh: true });
    else obj.draw?.();
    styleNote(obj);
  } catch (err) { console.debug(`${MODULE_ID} | note refresh`, err); }
}
