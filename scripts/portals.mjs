// Portals at the table: placing a new one with a click on the atlas, the lists a place card shows ("portals
// here", "portals that lead here"), and who in the party carries a portal's key. Portals themselves are places
// with a `portal` (util.mjs › portalData); creating and pinning them lives in places.mjs.
import { MODULE_ID } from "./constants.mjs";
import { t, info, warn } from "./i18n.mjs";
import { company } from "./state.mjs";
import { atlasIdOf } from "./atlas.mjs";
import { createPortal, allPlaces, pageOfPlace } from "./places.mjs";
import { portalLinks, keyHolders } from "./util.mjs";

/* ---------------- placing a portal with a click ---------------- */

let armed = null;

/** Where a pointer event lands on the canvas (scene coordinates). */
function canvasPoint(ev) {
  if (typeof canvas.canvasCoordinatesFromClient === "function") return canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
  const r = canvas.app.view.getBoundingClientRect();
  return canvas.stage.toLocal(new PIXI.Point(ev.clientX - r.left, ev.clientY - r.top));
}

/** Stop waiting for the click (Esc, a second press of the tool, or leaving the scene). */
export function disarm() {
  if (!armed) return;
  const { view, down, key } = armed;
  view.removeEventListener("pointerdown", down, true);
  document.removeEventListener("keydown", key, true);
  view.style.cursor = "";
  armed = null;
}

/**
 * The next left click on the atlas puts a new portal there (made at the table, hidden) and opens its card to be
 * filled in. `onCreated(page)` gets the new page. Press the tool again or Esc to cancel.
 */
export function armPlacing(onCreated) {
  if (!game.user.isGM) return warn("Notify.OnlyGM");
  if (armed) { disarm(); return info("Notify.PortalCancelled"); }
  if (!atlasIdOf(canvas.scene) || !canvas.ready) return warn("Notify.NotOnAtlas");
  const view = canvas.app.view;
  const down = ev => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const point = canvasPoint(ev);
    disarm();
    createPortal({ point })
      .then(page => { if (page) onCreated?.(page); })
      .catch(err => { console.error(`${MODULE_ID} | portal`, err); warn("Notify.Failed"); });
  };
  const key = ev => {
    if (ev.key !== "Escape") return;
    disarm();
    info("Notify.PortalCancelled");
  };
  view.addEventListener("pointerdown", down, true);
  document.addEventListener("keydown", key, true);
  view.style.cursor = "crosshair";
  armed = { view, down, key };
  info("Notify.PortalClick");
}

/* ---------------- what a card lists ---------------- */

/** The portals that concern a place, as {page, place} pairs: { here: [...], to: [...] }. */
export function portalsOf(placeId) {
  const { here, to } = portalLinks(allPlaces(), placeId);
  const pair = pl => ({ page: pageOfPlace(pl.id), place: pl });
  return { here: here.map(pair).filter(x => x.page), to: to.map(pair).filter(x => x.page) };
}

/** Who in the Company carries a portal's key item: [{ name, item }]. */
export function keyCarriers(keyItem) {
  const members = company()?.system?.members;
  const actors = Array.isArray(members) ? members.map(m => m?.actor).filter(Boolean) : [];
  const list = actors.map(a => ({ name: a.name, items: (a.items?.contents ?? [...(a.items ?? [])]).map(i => i.name) }));
  const group = company();
  if (group) list.push({ name: group.name, items: (group.items?.contents ?? [...(group.items ?? [])]).map(i => i.name) });
  return keyHolders(list, keyItem);
}
