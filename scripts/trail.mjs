// The road drawn on the atlas, in every browser: a dotted line through the stops with their numbers, one shade
// per session (older sessions fainter), arrows where the road leaves one edge of a wrapped map and comes back at
// another, the area labels (wards, regions) and a soft pulse where the party stands. It is redrawn only when the
// road or the scene changes; nothing is saved while it draws.
import { MODULE_ID, SESSION_COLORS, FONT } from "./constants.mjs";
import { setting } from "./settings.mjs";
import { local } from "./i18n.mjs";
import { road, atlasDef } from "./state.mjs";
import { atlasIdOf, rectOf, geometryOf } from "./atlas.mjs";
import { placesOn } from "./places.mjs";
import { activeJourney, route, fromNorm, sessionOrder, sessionAlpha } from "./util.mjs";

let layer = null;      // PIXI.Container on the canvas
let pulse = null;      // { g, fn }
let timer = null;

const color = hex => Number.parseInt(String(hex).replace("#", ""), 16) || 0xffffff;

function TextClass() {
  return foundry.canvas?.containers?.PreciseText ?? globalThis.PreciseText ?? PIXI.Text;
}
function label(text, { size = 22, fill = "#ffffff", stroke = "#000000", weight = "bold" } = {}) {
  const style = new PIXI.TextStyle({ fontFamily: FONT, fontSize: size, fill, stroke, strokeThickness: Math.max(3, size / 6), fontWeight: weight, align: "center" });
  const Text = TextClass();
  const txt = new Text(text, style);
  txt.anchor?.set?.(0.5, 0.5);
  return txt;
}

function stopPulse() {
  if (pulse) { canvas?.app?.ticker?.remove(pulse.fn); pulse = null; }
}

export function teardown() {
  stopPulse();
  clearTimeout(timer);
  if (layer) { layer.parent?.removeChild(layer); layer.destroy({ children: true }); layer = null; }
}

/** Redraw soon (debounced; many changes in a row draw once). */
export function redrawSoon() {
  clearTimeout(timer);
  timer = setTimeout(() => { try { draw(); } catch (err) { console.warn(`${MODULE_ID} | trail`, err); } }, 60);
}

/** The arrow at a wrapped edge: pointing out of the map (leaving) or into it (arriving). */
function edgeArrow(g, at, edge, out, size, col) {
  const dir = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[edge] ?? [1, 0];
  const s = out ? 1 : -1;
  const [dx, dy] = [dir[0] * s, dir[1] * s];
  const tip = { x: at.x + dx * size * (out ? 0.2 : 1), y: at.y + dy * size * (out ? 0.2 : 1) };
  const base = { x: tip.x - dx * size, y: tip.y - dy * size };
  const nx = -dy, ny = dx;
  g.lineStyle(0);
  g.beginFill(col, 0.95);
  g.drawPolygon([tip.x, tip.y, base.x + nx * size * 0.55, base.y + ny * size * 0.55, base.x - nx * size * 0.55, base.y - ny * size * 0.55]);
  g.endFill();
}

/** A dashed segment (PIXI has no dash). */
function dashed(g, a, b, dash, gap) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!len) return;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    g.moveTo(a.x + ux * d, a.y + uy * d);
    g.lineTo(a.x + ux * e, a.y + uy * e);
  }
}

export function draw() {
  teardown();
  const scene = canvas?.scene;
  const atlasId = atlasIdOf(scene);
  if (!atlasId || !canvas.ready) return;
  const rect = rectOf(scene);
  const unit = Math.max(rect.width, rect.height) / 1000; // ~4 px on a 4096 px map
  const parent = canvas.interface ?? canvas.stage;
  layer = new PIXI.Container();
  layer.eventMode = "none";
  layer.interactiveChildren = false;
  // First child of the interface group: over the map and the tokens' art, under the map notes and the ruler.
  parent.addChildAt(layer, 0);

  // Area labels (wards, regions), drawn under the road.
  if (setting("showLabels")) {
    // An area without a position is labelled in the middle of its places (once they are on the map).
    const placed = placesOn(atlasId).filter(x => x.note && !x.note.getFlag(MODULE_ID, "parked") && Number.isFinite(x.x));
    for (const area of atlasDef(atlasId)?.areas ?? []) {
      let at = Number.isFinite(area.x) && Number.isFinite(area.y) ? { x: area.x, y: area.y } : null;
      if (!at) {
        const mine = placed.filter(x => x.place.area === area.id);
        if (mine.length < 2) continue;
        at = { x: mine.reduce((s, x) => s + x.x, 0) / mine.length, y: mine.reduce((s, x) => s + x.y, 0) / mine.length };
      }
      const p = fromNorm(rect, at);
      const txt = label(local(area.name).toUpperCase(), { size: Math.round(unit * (area.size ?? 9)), fill: "#f4e9c8", stroke: "#2a2016", weight: "normal" });
      txt.alpha = 0.75;
      txt.position.set(p.x, p.y);
      layer.addChild(txt);
    }
  }

  const r = road();
  const hiddenHere = r.hidden.all || (!game.user.isGM && r.hidden.players);
  if (hiddenHere) return;
  const stops = activeJourney(r)?.stops ?? [];
  if (!stops.length) return;
  const sessions = sessionOrder(stops);
  const geo = geometryOf(atlasId);
  const g = new PIXI.Graphics();
  layer.addChild(g);
  const width = Math.max(2, unit * 1.6);

  // The road: one segment per pair of consecutive stops on this atlas.
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (a.atlas !== atlasId || b.atlas !== atlasId) continue;
    const si = sessions.indexOf(b.session ?? "");
    const col = color(SESSION_COLORS[si % SESSION_COLORS.length]);
    const alpha = sessionAlpha(si, sessions.length);
    const path = route(a, b, geo);
    // dark under-stroke, then the coloured dashes
    g.lineStyle({ width: width + unit * 1.4, color: 0x000000, alpha: 0.45 * alpha, cap: "round" });
    for (const [p, q] of path.segments) dashed(g, fromNorm(rect, p), fromNorm(rect, q), unit * 6, unit * 3.5);
    g.lineStyle({ width, color: col, alpha, cap: "round" });
    for (const [p, q] of path.segments) dashed(g, fromNorm(rect, p), fromNorm(rect, q), unit * 6, unit * 3.5);
    for (const w of path.wraps) edgeArrow(g, fromNorm(rect, w.at), w.edge, w.out, unit * 7, col);
  }

  // Numbered stops (only those on this atlas; numbers count the whole journey).
  stops.forEach((s, i) => {
    if (s.atlas !== atlasId) return;
    const si = sessions.indexOf(s.session ?? "");
    const col = color(SESSION_COLORS[si % SESSION_COLORS.length]);
    const alpha = sessionAlpha(si, sessions.length);
    const p = fromNorm(rect, s);
    const rad = unit * 4.2;
    g.lineStyle({ width: unit * 0.9, color: 0x000000, alpha });
    g.beginFill(col, alpha);
    g.drawCircle(p.x + rad * 1.6, p.y - rad * 1.6, rad);
    g.endFill();
    const n = label(String(i + 1), { size: Math.round(rad * 1.25), fill: "#1a1208", stroke: "#ffffff" });
    n.alpha = alpha;
    n.position.set(p.x + rad * 1.6, p.y - rad * 1.6);
    layer.addChild(n);
  });

  // Where the party stands now.
  const last = stops.at(-1);
  if (last?.atlas === atlasId) {
    const p = fromNorm(rect, last);
    const ring = new PIXI.Graphics();
    layer.addChild(ring);
    const base = unit * 9;
    let tt = 0;
    const fn = delta => {
      tt += (Number(delta?.deltaTime ?? delta) || 1) / 60;
      const k = (tt % 1.8) / 1.8;
      ring.clear();
      ring.lineStyle({ width: unit * 1.2, color: 0xffe9a8, alpha: 0.9 * (1 - k) });
      ring.drawCircle(p.x, p.y, base * (0.6 + k * 1.2));
    };
    canvas.app.ticker.add(fn);
    pulse = { g: ring, fn };
  }
}
