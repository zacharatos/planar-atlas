export const MODULE_ID = "planar-atlas";
export const EVENT = `module.${MODULE_ID}`;

/** Journal folder for the atlas journals and, without Planar Codex, the module's pages. */
export const FOLDER = "Planar Atlas";

/** Places within this many pixels (at the map's scale) of a dropped party token: the party stops there. */
export const SNAP_PX = 110;

/** A Note's icon size on an atlas, in pixels. */
export const PIN_SIZE = 56;

/** Map notes are drawn faded for the GM while hidden from the players. */
export const HIDDEN_ALPHA = 0.45;

/** Purse history: how many lines are kept on the actor (oldest are dropped). */
export const PURSE_LOG_MAX = 600;

/** How long a player waits for the GM to apply a purse change. */
export const REPLY_TIMEOUT_MS = 8000;

/** Built-in place categories (a pack can rename them and add more). Icons are Foundry's own. */
export const DEFAULT_CATEGORIES = {
  landmark: { name: { en: "Landmark", el: "Ορόσημο" }, icon: "icons/svg/obelisk.svg", color: "#e8d9a8" },
  tavern: { name: { en: "Tavern or inn", el: "Ταβέρνα ή πανδοχείο" }, icon: "icons/svg/tankard.svg", color: "#f0b46a" },
  temple: { name: { en: "Temple", el: "Ναός" }, icon: "icons/svg/temple.svg", color: "#f4e7b0" },
  shop: { name: { en: "Shop or market", el: "Μαγαζί ή αγορά" }, icon: "icons/svg/coins.svg", color: "#e6c65a" },
  faction: { name: { en: "Faction headquarters", el: "Έδρα φατρίας" }, icon: "icons/svg/castle.svg", color: "#b9a6e8" },
  portal: { name: { en: "Portal", el: "Πύλη" }, icon: "modules/planar-atlas/styles/icons/portal.svg", color: "#7fd6e8" },
  danger: { name: { en: "Danger", el: "Κίνδυνος" }, icon: "icons/svg/skull.svg", color: "#e87f7f" },
  home: { name: { en: "Someone's home", el: "Το σπίτι κάποιου" }, icon: "icons/svg/house.svg", color: "#cfe8a8" },
  town: { name: { en: "Town", el: "Πόλη" }, icon: "icons/svg/city.svg", color: "#e8d9a8" },
  wild: { name: { en: "Wilds", el: "Άγρια γη" }, icon: "icons/svg/mountain.svg", color: "#a8d0a0" },
  hb: { name: { en: "Our own (homebrew)", el: "Δικό μας (homebrew)" }, icon: "icons/svg/hanging-sign.svg", color: "#9ad1ff" }
};

/** Built-in ways of travelling. */
export const DEFAULT_HOWS = {
  foot: { name: { en: "On foot", el: "Με τα πόδια" }, icon: "fa-person-walking" },
  ride: { name: { en: "Ride or carriage", el: "Άμαξα ή άλογο" }, icon: "fa-horse" },
  portal: { name: { en: "Through a portal", el: "Από πύλη" }, icon: "fa-dungeon" },
  magic: { name: { en: "By magic", el: "Με μαγεία" }, icon: "fa-wand-sparkles" },
  unknown: { name: { en: "Unknown", el: "Άγνωστο" }, icon: "fa-question" }
};

/** One colour per session on the road (cycled). */
export const SESSION_COLORS = ["#ffd166", "#ef476f", "#06d6a0", "#4cc9f0", "#f78c6b", "#c77dff", "#9ef01a", "#ff9f1c"];

/** Font for the labels drawn on the map. */
export const FONT = `"Palatino Linotype","Book Antiqua",Palatino,"Noto Serif",Georgia,serif`;
