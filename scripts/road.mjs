// The party's road: the Company (a dnd5e group actor) has a token on each atlas; when the GM drops it, the
// stop is recorded (snapped to a place nearby) with the session, the in-world day and how they travelled.
import { MODULE_ID } from "./constants.mjs";
import { t, info, warn, local } from "./i18n.mjs";
import { setting, setSetting } from "./settings.mjs";
import { road, mutateRoad, company, isCompanyToken, isActiveGM, defs, stamp } from "./state.mjs";
import { atlasIdOf, sceneOfAtlas, norm, px, atlasName } from "./atlas.mjs";
import { placesOn, placeName, markVisited, placeOfPage } from "./places.mjs";
import { nearest, addStop, removeStop, updateStop, archiveJourney, clearJourney, deleteJourney, lastStop, activeJourney, localText, sameSpot } from "./util.mjs";
import * as clock from "./clock.mjs";
import { planTrip, rollEncounters } from "./travel.mjs";

const SKIP = "planarAtlasSkip";

/* ---------------- the Company ---------------- */

/** The heroes: player characters owned by a player. */
const heroes = () => game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);

/**
 * Create the Company: a dnd5e group actor (type "party") with every hero as a member, owned by every player
 * (so they can use its purse and inventory), set as the world's primary party. Returns the actor.
 */
export async function createCompany() {
  if (!game.user.isGM) return null;
  const existing = company();
  if (existing) { existing.sheet?.render(true); return existing; }
  const def = defs().company;
  const name = local(def.name) || t("Company.DefaultName");
  const img = def.img || `modules/${MODULE_ID}/styles/icons/party.svg`;
  const OWN = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  let actor;
  try {
    actor = await getDocumentClass("Actor").create({
      name, type: "group", img,
      system: { type: { value: "party" } },
      ownership: { default: OWN.OWNER },
      prototypeToken: { name, actorLink: true, texture: { src: img }, width: 1, height: 1, sight: { enabled: false }, disposition: CONST.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1 },
      flags: { [MODULE_ID]: { company: true } }
    });
  } catch (err) {
    console.error(`${MODULE_ID} | could not create the group actor`, err);
    return warn("Notify.CompanyFailed");
  }
  await setSetting("company", actor.id);
  await addMembers(actor, heroes());
  try { await game.settings.set("dnd5e", "primaryParty", { actor: actor.id }); }
  catch (err) { console.warn(`${MODULE_ID} | primary party not set`, err); info("Notify.PrimaryPartyManual"); }
  info("Notify.CompanyCreated", { name, n: heroes().length });
  return actor;
}

/** Add actors to the group (dnd5e's own addMember when it has one). */
export async function addMembers(group, actors) {
  for (const a of actors) {
    try {
      if (typeof group.system?.addMember === "function") await group.system.addMember(a);
      else {
        const members = [...(group.system?.members ?? [])].map(m => (m?.actor?.id ? { actor: m.actor.id } : m));
        if (!members.some(m => (m?.actor ?? m) === a.id)) members.push({ actor: a.id });
        await group.update({ "system.members": members });
      }
    } catch (err) { console.warn(`${MODULE_ID} | could not add ${a.name}`, err); }
  }
}

/** The Company's token on a scene. */
export const companyToken = scene => (company() ? scene?.tokens.find(tk => tk.actorId === company().id) : null) ?? null;

const centerOf = doc => {
  try { const c = doc.getCenterPoint?.(); if (c && Number.isFinite(c.x)) return c; } catch { /* fallback below */ }
  const size = doc.parent?.grid?.size ?? 100;
  return { x: doc.x + (doc.width * size) / 2, y: doc.y + (doc.height * size) / 2 };
};

/** Move a token so that its centre is at `to` (works whether x/y are the corner or the centre). */
async function moveTokenCenter(doc, to, options = {}) {
  const c = centerOf(doc);
  const dx = Math.round(to.x - c.x), dy = Math.round(to.y - c.y);
  if (!dx && !dy) return;
  await doc.update({ x: doc.x + dx, y: doc.y + dy }, { [SKIP]: true, ...options });
}

/** Put the Company on an atlas: where the road left it on this atlas, else in the middle of the view. */
export async function placeCompany(scene = canvas.scene) {
  if (!game.user.isGM) return null;
  if (!atlasIdOf(scene)) return warn("Notify.NotOnAtlas");
  const actor = company() ?? await createCompany();
  if (!actor) return null;
  const existing = companyToken(scene);
  const last = [...(activeJourney(road())?.stops ?? [])].reverse().find(s => s.atlas === atlasIdOf(scene));
  const at = last ? px(scene, last) : { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y };
  if (existing) { await moveTokenCenter(existing, at); return existing; }
  const tokenDoc = await actor.getTokenDocument({ x: at.x, y: at.y });
  const [made] = await scene.createEmbeddedDocuments("Token", [tokenDoc.toObject()], { [SKIP]: true });
  if (made) await moveTokenCenter(made, at);
  return made;
}

/* ---------------- recording stops ---------------- */

/** The "next move" fields (session, how) the GM keeps in the party window. */
export const nextMove = () => road().next;
export const setNextMove = patch => mutateRoad(r => { Object.assign(r.next, patch); });

/**
 * The stop for a point on an atlas: snapped to the nearest place if there is one close enough.
 * `forced` ({x, y, page, place}) is a place the GM chose (Move from a card or a button): no snapping, no guessing.
 * A stop away from every place is named after the closest one («near X»), so the road and the Prompter never show a blank.
 */
function stopAt(scene, center, forced = null) {
  const atlasId = atlasIdOf(scene);
  const radius = Number(setting("snapRadius")) || 110;
  const spots = placesOn(atlasId).filter(p => p.note).map(p => ({ x: p.note.x, y: p.note.y, page: p.page, place: p.place }));
  const hit = forced ?? nearest(spots, center.x, center.y, radius);
  const close = hit ? null : nearest(spots, center.x, center.y, Infinity);
  const where = hit ? norm(scene, hit.x, hit.y) : norm(scene, center.x, center.y);
  const n = road().next;
  const members = company()?.system?.members;
  const heroes = Array.isArray(members) ? members.map(m => m?.actor?.name ?? m?.name).filter(Boolean) : [];
  return {
    stop: {
      ...stamp(), atlas: atlasId, scene: scene.id, place: hit?.place.id ?? null,
      label: hit ? (localText(hit.place.name, "el") || localText(hit.place.name, "en"))
        : close ? t("Road.Near", { name: localText(close.place.name, "el") || localText(close.place.name, "en") }) : "",
      near: close?.place.id ?? null,
      x: where.x, y: where.y,
      session: n.session ?? "", day: "", time: "", how: n.how ?? "", note: "", cost: "", heroes
    },
    area: hit?.place.area ?? null,
    snapTo: hit ? { x: hit.x, y: hit.y } : null
  };
}

/** Stamp a stop with the clock (after the trip): the day, the time and the part of the day. */
function stampClock(stop) {
  const c = clock.read();
  stop.t = clock.now();
  stop.day = String(c.day);
  stop.time = [c.time, c.band].filter(Boolean).join(" · ");
  return stop;
}

/** updateToken (every client; the active GM records). Moves are handled one at a time. */
let moving = Promise.resolve();
export function onTokenMoved(doc, changed, options) {
  if (!isActiveGM() || options?.[SKIP] || !("x" in (changed ?? {}) || "y" in (changed ?? {}))) return Promise.resolve();
  if (!isCompanyToken(doc) || !atlasIdOf(doc.parent)) return Promise.resolve();
  moving = moving.then(() => recordMove(doc)).catch(err => console.error(`${MODULE_ID} | road`, err));
  return moving;
}

async function recordMove(doc, forced = null) {
  const scene = doc.parent;
  const atlasId = atlasIdOf(scene);
  const { stop, snapTo, area } = stopAt(scene, centerOf(doc), forced);
  if (snapTo) await moveTokenCenter(doc, snapTo);
  const prev = lastStop(road());
  // Same place as the last stop: nothing to record, but say so (a silent Move looked broken at the table).
  if (sameSpot(prev, stop)) return info("Notify.AlreadyThere", { name: stop.label || t("Road.APoint") });
  // The trip: how long it took (asked, estimated or rolled), and what happened on the way.
  const trip = prev ? await planTrip({ from: prev, to: { ...stop, area }, atlasId, how: stop.how, toName: stop.label }) : null;
  if (trip) {
    stop.how = trip.how;
    if (trip.seconds) {
      await clock.advance(trip.seconds);
      stop.travel = { seconds: trip.seconds, formula: trip.formula || "", total: trip.total ?? null };
    }
  }
  stampClock(stop);
  const added = await mutateRoad(r => addStop(r, stop));
  if (!added) return info("Notify.AlreadyThere", { name: stop.label || t("Road.APoint") });
  if (stop.place) await markVisited(stop.place);
  info(stop.place ? "Notify.StoppedVisited" : "Notify.Stopped", { name: stop.label || t("Road.APoint"), n: activeJourney(road())?.stops.length ?? 0, clock: clock.label() });
  if (trip?.seconds) info("Notify.TimePassed", { time: clock.duration(trip.seconds), clock: clock.label() });
  if (trip?.encounters) await rollEncounters(trip.tables, { where: stop.label || atlasName(atlasId) });
}

/** preUpdateToken / preMoveToken on players' clients: the Company moves only when the GM moves it. */
export function lockForPlayers(doc, changed) {
  if (game.user.isGM || !setting("lockCompany") || !isCompanyToken(doc) || !atlasIdOf(doc.parent)) return true;
  if (changed && !("x" in changed || "y" in changed) && !changed.waypoints) return true;
  warn("Notify.Locked");
  return false;
}

/**
 * Move the party to a place (from a card or a journal button): the stop is recorded for that place directly
 * (no snapping, no guessing from where the token lands), then the token is moved there. Every outcome ends in one toast.
 */
export async function moveCompanyTo(page) {
  if (!game.user.isGM) return null;
  // Only the active GM's browser records the road: say so instead of moving a token that nobody records.
  if (!isActiveGM()) return warn("Notify.NotActiveGM");
  const pl = placeOfPage(page);
  const scene = sceneOfAtlas(pl?.atlas);
  if (!scene) return warn("Notify.NoScene", { name: atlasName(pl?.atlas) });
  const note = scene.notes.find(n => n.pageId === page.id);
  if (!note) return warn("Notify.NotPinned", { name: placeName(pl) });
  let token = companyToken(scene);
  if (!token) {
    if (scene !== canvas.scene) return warn("Notify.NoCompanyToken", { name: scene.name });
    token = await placeCompany(scene);
  }
  if (!token) return null;
  // The token moves with the skip flag (onTokenMoved ignores it); the stop is recorded here, for this place.
  const spot = { x: note.x, y: note.y, page, place: pl };
  moving = moving.then(async () => {
    await moveTokenCenter(token, spot);
    await recordMove(token, spot);
  }).catch(err => { console.error(`${MODULE_ID} | road`, err); warn("Notify.Failed"); });
  await moving;
  return token;
}

/* ---------------- editing the road ---------------- */

/** Take back the last stop and put the Company back where it was before. */
export async function undoLast() {
  if (!game.user.isGM) return null;
  const last = lastStop(road());
  if (!last) return info("Notify.NothingToUndo");
  await mutateRoad(r => removeStop(r, last.id));
  if (last.travel?.seconds) {
    await clock.advance(-last.travel.seconds);
    info("Notify.TimeTakenBack", { time: clock.duration(last.travel.seconds), clock: clock.label() });
  }
  const prev = lastStop(road());
  if (prev && prev.atlas === last.atlas) {
    const scene = sceneOfAtlas(prev.atlas);
    const token = companyToken(scene);
    if (token) await moveTokenCenter(token, px(scene, prev));
  }
  info("Notify.Undone");
  return last;
}

export const deleteStop = id => mutateRoad(r => removeStop(r, id));
export const editStop = (id, patch) => mutateRoad(r => updateStop(r, id, patch));
export const setHidden = patch => mutateRoad(r => { Object.assign(r.hidden, patch); });
export const deleteArchived = id => mutateRoad(r => deleteJourney(r, id));

/** Close this journey under a name; the next one starts where the party stands. */
export async function archive(name) {
  const ids = stamp();
  await mutateRoad(r => archiveJourney(r, { name, newId: ids.id, stopId: foundry.utils.randomID(), date: ids.date }));
  info("Notify.Archived", { name: name || "—" });
}

export async function clearRoad() {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("Road.ClearTitle") }, content: `<p>${t("Road.ClearAsk")}</p>`
  });
  if (!ok) return false;
  await mutateRoad(r => clearJourney(r));
  return true;
}

/** Text for a stop: the place's name in this user's language, else the label it was recorded with. */
export function stopName(stop) {
  if (stop.place) {
    for (const p of placesOn(stop.atlas)) if (p.place.id === stop.place) return placeName(p.place);
  }
  if (stop.near) {
    for (const p of placesOn(stop.atlas)) if (p.place.id === stop.near) return t("Road.Near", { name: placeName(p.place) });
  }
  return stop.label || t("Road.APoint");
}

export function howName(id) {
  const h = defs().hows[id];
  return h ? local(h.name) : (id || "");
}
