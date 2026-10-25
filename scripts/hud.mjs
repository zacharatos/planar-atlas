// The clock chip: a small label at the top of the screen while an atlas is on the canvas
// («Μέρα 3 · 14:20 · ζενίθ»), for everyone who keeps the per-user setting on. Plain HTML, no canvas work.
import { MODULE_ID } from "./constants.mjs";
import { t } from "./i18n.mjs";
import { atlasIdOf } from "./atlas.mjs";
import * as clock from "./clock.mjs";

let chip = null;

function shouldShow() {
  try { return !!atlasIdOf(globalThis.canvas?.scene) && game.settings.get(MODULE_ID, "showClock") !== false; }
  catch { return false; }
}

export function refresh() {
  if (!shouldShow()) { chip?.remove(); chip = null; return; }
  if (!chip?.isConnected) {
    chip = document.createElement("div");
    chip.id = "planar-atlas-clock";
    chip.className = "pa-clock-chip";
    chip.dataset.tooltip = t("Clock.ChipHint");
    document.body.append(chip);
  }
  chip.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${foundry.utils.escapeHTML?.(clock.label()) ?? clock.label()}`;
}
