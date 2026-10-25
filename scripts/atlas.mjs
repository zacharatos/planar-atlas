// Atlas scenes: an ordinary scene whose background is a big map, flagged with the id of an atlas from the pack.
import { MODULE_ID } from "./constants.mjs";
import { t, info, warn, local } from "./i18n.mjs";
import { atlasDef, defs } from "./state.mjs";
import { sceneRect, toNorm, fromNorm } from "./util.mjs";

/** The atlas id of a scene (null if it isn't an atlas). */
export const atlasIdOf = scene => scene?.getFlag?.(MODULE_ID, "atlas") ?? null;
export const isAtlas = scene => !!atlasIdOf(scene);

/** The scene that shows an atlas. */
export const sceneOfAtlas = id => game.scenes.find(s => atlasIdOf(s) === id) ?? null;

/** The atlas's name in this user's language (the pack's, else the scene's). */
export function atlasName(id) {
  return local(atlasDef(id)?.name) || sceneOfAtlas(id)?.name || id || "?";
}

/** Map rectangle of a scene on the canvas. */
export function rectOf(scene) {
  let dims = null;
  try { dims = scene?.dimensions ?? null; } catch { dims = null; }
  if (!dims && scene === globalThis.canvas?.scene) dims = canvas.dimensions;
  return sceneRect(dims ?? { width: scene?.width, height: scene?.height });
}

export const norm = (scene, x, y) => toNorm(rectOf(scene), x, y);
export const px = (scene, p) => fromNorm(rectOf(scene), p);

/** Make a scene the map of an atlas. */
export async function bindScene(scene, atlasId) {
  if (!game.user.isGM || !scene) return null;
  const other = sceneOfAtlas(atlasId);
  if (other && other.id !== scene.id) await other.unsetFlag(MODULE_ID, "atlas");
  await scene.update({ [`flags.${MODULE_ID}.atlas`]: atlasId });
  info("Notify.Bound", { scene: scene.name, atlas: atlasName(atlasId) });
  return scene;
}

export async function unbindScene(scene) {
  if (!game.user.isGM || !scene) return;
  await scene.unsetFlag(MODULE_ID, "atlas");
}

/** The pixel size of an image on the server. */
function imageSize(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * The scene's background image. Foundry v13 and earlier keep it on the scene (`background.src`);
 * v14 moved the background onto the scene's Levels (`level.background.src`).
 */
async function setBackground(scene, src) {
  const SceneClass = getDocumentClass("Scene");
  if (SceneClass.schema.getField("background")) {
    await scene.update({ "background.src": src });
    return true;
  }
  if (!SceneClass.schema.getField("levels")) return false;
  try {
    const levels = scene.levels;
    let level = levels?.get(scene.initialLevel) ?? levels?.contents?.[0];
    if (!level) [level] = await scene.createEmbeddedDocuments("Level", [{ name: scene.name }]);
    if (!level) return false;
    await level.update({ "background.src": src });
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | could not set the level background`, err);
    return false;
  }
}

/** Pick an image file (null if the picker is closed without a choice). */
export function pickImage(current = "") {
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  return new Promise(resolve => {
    let done = false;
    const fp = new FP({ type: "image", current, callback: path => { done = true; resolve(path); } });
    const close = fp.close?.bind(fp);
    fp.close = async (...args) => { const r = await close?.(...args); if (!done) resolve(null); return r; };
    fp.render?.(true) ?? fp.browse?.();
  });
}

/** A new scene for an atlas: the map picked by the GM, its own size, no grid, no vision, no fog. */
export async function createAtlasScene(atlasId) {
  if (!game.user.isGM) return null;
  const def = atlasDef(atlasId);
  if (!def) return warn("Notify.NoAtlas", { id: atlasId });
  info("Notify.PickMap", { name: atlasName(atlasId), file: def.map ?? "" });
  const src = await pickImage();
  if (!src) return null;
  const size = await imageSize(src);
  if (!size) return warn("Notify.MapUnreadable", { src });
  const SceneClass = getDocumentClass("Scene");
  const scene = await SceneClass.create({
    name: local(def.name) || atlasId,
    width: size.width, height: size.height, padding: 0,
    grid: { type: CONST.GRID_TYPES.GRIDLESS, distance: 1, units: "" },
    tokenVision: false,
    fog: { exploration: false },
    navigation: true,
    flags: { [MODULE_ID]: { atlas: atlasId } }
  });
  if (!await setBackground(scene, src)) warn("Notify.BackgroundFailed");
  info("Notify.SceneCreated", { name: scene.name });
  await scene.view();
  return scene;
}

/** Every atlas in the pack with its scene (or null). */
export function atlases() {
  return defs().atlases.map(a => ({ def: a, id: a.id, name: local(a.name) || a.id, scene: sceneOfAtlas(a.id) }));
}

/** Geometry (zones and their links) of an atlas, for routes that wrap around the map. */
export const geometryOf = atlasId => ({ zones: atlasDef(atlasId)?.zones ?? [], links: atlasDef(atlasId)?.links ?? [] });
