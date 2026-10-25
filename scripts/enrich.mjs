// Journal buttons for prep notes, GM only (players see the label as plain text):
//   @Atlas[Ο Πανταχού Οδοιπόρος]                 the place's card (and the map centred on it)
//   @Atlas[Ο Πανταχού Οδοιπόρος | move]{Πάμε}    move the party there (the stop is recorded)
//   @Atlas[reveal: Αρχειοφυλάκειο]               the place becomes known to the players
//   @Atlas[rumour: Ο Τροχός της Τύχης]           the players hear of it ("?" on their map)
//   @Atlas[set: parisa]{Η Παρίζα μιλάει}          reveal every place of a set
//   @Atlas[pay: 3gp | Παρίζα, μια μέρα]          pay from the common purse, with the reason
import { MODULE_ID } from "./constants.mjs";
import { t, warn, local } from "./i18n.mjs";
import { defs } from "./state.mjs";
import { escapeHTML as esc, parseAtlasArgs, parseCoins, coinsText } from "./util.mjs";
import { findPlace, setStatus, revealSet, placeName, noteOfPage } from "./places.mjs";
import { moveCompanyTo } from "./road.mjs";
import { change as purseChange } from "./purse.mjs";
import { PlaceCard } from "./card.mjs";
import { sceneOfAtlas } from "./atlas.mjs";

const PATTERN = /@Atlas\[([^\]]+)\](?:\{([^}]+)\})?/g;
const ICON = { open: "fa-map-pin", move: "fa-person-walking-arrow-right", reveal: "fa-eye", rumour: "fa-question", hide: "fa-eye-slash", set: "fa-lightbulb", pay: "fa-coins" };

function defaultLabel({ verb, target, reason }) {
  if (verb === "set") return local(defs().sets?.[target]?.name) || target;
  if (verb === "pay") { const c = parseCoins(target); return `${c ? coinsText(c) : target}${reason ? ` · ${reason}` : ""}`; }
  const hit = findPlace(target);
  return hit ? placeName(hit.place) : target;
}

function enrich(match) {
  const [, args, label] = match;
  const parsed = parseAtlasArgs(args);
  if (!game.user.isGM) {
    // Players see only the words the GM wrote, never a place's name looked up from the atlas.
    const span = document.createElement("span");
    span.textContent = label || (parsed.verb === "pay" || parsed.verb === "set" ? "" : parsed.target);
    return span;
  }
  const text = label || defaultLabel(parsed);
  const a = document.createElement("a");
  a.className = "pa-button";
  a.dataset.args = args;
  a.title = t(`Enricher.${parsed.verb}`);
  a.innerHTML = `<i class="fa-solid ${ICON[parsed.verb] ?? "fa-map-pin"}"></i> ${esc(text)}`;
  return a;
}

async function onClick(ev) {
  const a = ev.target.closest?.("a.pa-button");
  if (!a || !game.user.isGM) return;
  ev.preventDefault();
  ev.stopPropagation();
  const { verb, target, reason } = parseAtlasArgs(a.dataset.args);
  a.classList.add("busy");
  try {
    if (verb === "set") return void await revealSet(target);
    if (verb === "pay") {
      const coins = parseCoins(target);
      if (!coins) return warn("Purse.Error.NoAmount");
      return void await purseChange({ coins, dir: "out", why: reason });
    }
    const hit = findPlace(target);
    if (!hit) return warn("Notify.NoPlace", { name: target });
    if (verb === "move") return void await moveCompanyTo(hit.page);
    if (verb === "reveal") return void await setStatus(hit.page, "known");
    if (verb === "rumour") return void await setStatus(hit.page, "rumoured");
    if (verb === "hide") return void await setStatus(hit.page, "hidden");
    PlaceCard.show(hit.page);
    const note = noteOfPage(hit.page);
    if (note && sceneOfAtlas(hit.place.atlas) === canvas.scene) await canvas.animatePan({ x: note.x, y: note.y });
  } catch (err) {
    console.error(`${MODULE_ID} | @Atlas`, err);
    warn("Notify.Failed");
  } finally { a.classList.remove("busy"); }
}

/** init: register the enricher. */
export function registerEnrichers() {
  CONFIG.TextEditor?.enrichers?.push({ pattern: PATTERN, enricher: enrich });
}

/** ready (GM): one delegated click listener for every button in every journal. */
export function listenForClicks() {
  if (game.user.isGM) document.body.addEventListener("click", onClick, true);
}
