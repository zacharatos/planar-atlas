// Interface text. The module keeps its own English and Greek dictionaries, so each user can switch the
// module's language without switching all of Foundry (setting "language", the EN/ΕΛ button in its windows).
// Until the dictionaries are loaded, and for anything missing, Foundry's own i18n answers.
import { MODULE_ID } from "./constants.mjs";
import { lookup, fill, LANGUAGES, pickLanguage, localText } from "./util.mjs";

const PREFIX = "PLANAR_ATLAS.";
const dict = {};

/** Load lang/en.json and lang/el.json (once, on ready). */
export async function loadDictionaries() {
  await Promise.all(LANGUAGES.map(async lang => {
    try { dict[lang] = (await (await fetch(`modules/${MODULE_ID}/lang/${lang}.json`)).json())?.PLANAR_ATLAS ?? null; }
    catch (err) { console.warn(`${MODULE_ID} | lang/${lang}.json`, err); }
  }));
}

/** This user's language for the module: their choice, the world default, or Foundry's. */
export function language() {
  try {
    return pickLanguage(game.settings.get(MODULE_ID, "language"), game.settings.get(MODULE_ID, "textLanguage"), game.i18n?.lang);
  } catch { return game.i18n?.lang === "el" ? "el" : "en"; }
}

/** The EN/ΕΛ button: switch this user's language. */
export const toggleLanguage = () => game.settings.set(MODULE_ID, "language", language() === "el" ? "en" : "el");

/** Pack text ({en, el} or a string) in this user's language. */
export const local = value => localText(value, language());

/** Localize a key under PLANAR_ATLAS.*, optionally with {placeholders}. */
export function t(key, data) {
  const text = lookup(dict[language()], key) ?? lookup(dict.en, key);
  if (text !== undefined) return fill(text, data);
  return data ? game.i18n.format(PREFIX + key, data) : game.i18n.localize(PREFIX + key);
}

export const warn = (key, data) => ui.notifications.warn(t(key, data));
export const info = (key, data) => ui.notifications.info(t(key, data));
