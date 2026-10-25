import { MODULE_ID } from "./constants.mjs";

const hidden = (key, type, def, onChange) => game.settings.register(MODULE_ID, key, {
  scope: "world", config: false, type, default: def, onChange
});
const world = (key, type, def, extra = {}) => game.settings.register(MODULE_ID, key, {
  name: `PLANAR_ATLAS.Settings.${key}.Name`, hint: `PLANAR_ATLAS.Settings.${key}.Hint`,
  scope: "world", config: true, type, default: def, ...extra
});

/**
 * World data lives in hidden world settings that only the active GM writes (the road, the pack, ids of the
 * party actor and of the journal pages). Places are map notes, each linked to a journal page that holds the
 * place's data. The purse's history is a flag on the party actor.
 */
export function registerSettings({ onChange } = {}) {
  hidden("road", Object, null, () => onChange?.("road"));
  hidden("pack", Object, null, () => onChange?.("pack"));
  hidden("company", String, "", () => onChange?.("company"));
  hidden("pages", Object, {});

  world("imageBase", String, "");
  world("lockCompany", Boolean, true);
  world("snapRadius", Number, 110, { range: { min: 20, max: 400, step: 10 } });
  world("purseForPlayers", Boolean, true, { onChange: () => onChange?.("purse") });
  world("playerButton", Boolean, true, { onChange: () => ui.controls?.render?.() });
  world("textLanguage", String, "auto", {
    choices: { auto: "PLANAR_ATLAS.Settings.textLanguage.Auto", en: "English", el: "Ελληνικά" },
    onChange: () => onChange?.("language")
  });
  // Each user's own choice (the EN/ΕΛ button in the module's windows). "world" follows the world default.
  game.settings.register(MODULE_ID, "language", {
    name: "PLANAR_ATLAS.Settings.language.Name", hint: "PLANAR_ATLAS.Settings.language.Hint",
    scope: "client", config: true, type: String, default: "world",
    choices: { world: "PLANAR_ATLAS.Settings.language.World", en: "English", el: "Ελληνικά" },
    onChange: () => onChange?.("language")
  });
  game.settings.register(MODULE_ID, "showLabels", {
    name: "PLANAR_ATLAS.Settings.showLabels.Name", hint: "PLANAR_ATLAS.Settings.showLabels.Hint",
    scope: "client", config: true, type: Boolean, default: true, onChange: () => onChange?.("draw")
  });
}

export const setting = key => game.settings.get(MODULE_ID, key);
export const setSetting = (key, value) => game.settings.set(MODULE_ID, key, value);
