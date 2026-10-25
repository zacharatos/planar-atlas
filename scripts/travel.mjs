// Travel: how long a trip takes, the GM's say on it, and what happens on the way.
// Each atlas in the pack has a rule per way of travelling (util.mjs › travelEstimate): a time to cross the map
// (scaled by the road's length), a roll ("3d6 days"), or a fixed time. When the GM drops the party token, the
// trip is estimated or rolled, the GM confirms or changes it (setting "Travel time"), the clock moves on, and if
// asked, the encounter tables of the destination's area and of the atlas are rolled and whispered to the GM.
import { MODULE_ID } from "./constants.mjs";
import { t, local, info } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import { defs, atlasDef } from "./state.mjs";
import { rectOf, sceneOfAtlas, geometryOf } from "./atlas.mjs";
import * as clock from "./clock.mjs";
import { routeLength, travelRule, travelEstimate, rolledSeconds, UNIT_SECONDS, tableRow, encounterTables, escapeHTML as esc } from "./util.mjs";

const UNITS = ["minute", "hour", "day"];

/** Roll a formula (Foundry dice), quietly. Returns { total, formula } or null. */
async function roll(formula) {
  try {
    const r = await new Roll(String(formula)).evaluate();
    return { total: r.total, formula: r.formula, roll: r };
  } catch (err) {
    console.warn(`${MODULE_ID} | roll ${formula}`, err);
    return null;
  }
}

/** The best unit to show a number of seconds in (and the amount). */
function inUnit(seconds, preferred) {
  if (preferred && UNIT_SECONDS[preferred] && seconds % UNIT_SECONDS[preferred] === 0) return { amount: seconds / UNIT_SECONDS[preferred], unit: preferred };
  for (const unit of ["day", "hour", "minute"]) if (seconds && seconds % UNIT_SECONDS[unit] === 0) return { amount: seconds / UNIT_SECONDS[unit], unit };
  return { amount: Math.round(seconds / 60), unit: "minute" };
}

/** Estimate a trip without asking: { how, seconds, formula, total, unit, length, kind }. */
export async function estimate({ from, to, atlasId, how }) {
  const def = atlasDef(atlasId);
  const rule = travelRule(def?.travel, how);
  const scene = sceneOfAtlas(atlasId);
  const rect = rectOf(scene);
  const length = from && from.atlas === atlasId ? routeLength(from, to, geometryOf(atlasId), rect.height / rect.width) : 0;
  const est = travelEstimate(rule, length);
  let seconds = est.seconds, total = null;
  if (est.kind === "roll") {
    const r = await roll(est.formula);
    total = r?.total ?? 0;
    seconds = rolledSeconds(total, est.unit);
  }
  return { how, seconds, formula: est.formula, total, unit: est.unit, length, kind: est.kind };
}

/**
 * Plan a trip (GM): the estimate, then — with the setting on "ask" — a dialog where the GM can change the way
 * of travelling, the time, and whether to roll for encounters. Returns null if no time should pass.
 */
export async function planTrip({ from, to, atlasId, how, toName = "" }) {
  const mode = setting("travelPrompt");
  if (mode === "off") return null;
  const def = atlasDef(atlasId);
  const tables = encounterTables(def, to?.area ?? null);
  const encounterDefault = !!def?.encounters?.default && tables.length > 0;
  let trip = await estimate({ from, to, atlasId, how });
  if (mode === "auto") return { ...trip, encounters: encounterDefault, tables };

  const hows = defs().hows;
  const ruleText = howId => {
    const rule = travelRule(def?.travel, howId);
    if (!rule) return t("Travel.NoRule");
    if (rule.roll) return t("Travel.RuleRoll", { formula: rule.roll, unit: t(`Clock.Unit.${rule.unit ?? "hour"}`) });
    if (rule.per === "map") return t("Travel.RuleMap", { amount: rule.amount, unit: t(`Clock.Unit.${rule.unit ?? "hour"}`) });
    return t("Travel.RuleFixed", { amount: rule.fixed, unit: t(`Clock.Unit.${rule.unit ?? "minute"}`) });
  };
  const form = tr => {
    const shown = inUnit(tr.seconds, tr.unit);
    const howOpts = Object.entries(hows).map(([id, h]) => `<option value="${esc(id)}" ${id === tr.how ? "selected" : ""}>${esc(local(h.name))}</option>`).join("");
    const unitOpts = UNITS.map(u => `<option value="${u}" ${u === shown.unit ? "selected" : ""}>${esc(t(`Clock.Unit.${u}`))}</option>`).join("");
    const rolled = tr.kind === "roll" && tr.total != null ? `<p class="pa-rolled"><i class="fa-solid fa-dice"></i> ${esc(t("Travel.Rolled", { formula: tr.formula, total: tr.total, unit: t(`Clock.Unit.${tr.unit}`) }))}</p>` : "";
    return `<div class="planar-atlas pa-travel">
      <p class="pa-trip"><strong>${esc(toName || t("Road.APoint"))}</strong> · ${esc(t("Travel.Now", { clock: clock.label() }))}</p>
      <div class="form-group"><label>${esc(t("Road.How"))}</label><div class="form-fields"><select name="how">${howOpts}</select></div>
        <p class="hint pa-rule">${esc(ruleText(tr.how))}</p></div>
      ${rolled}
      <div class="form-group"><label>${esc(t("Travel.Takes"))}</label><div class="form-fields">
        <input type="number" name="amount" min="0" step="1" value="${shown.amount}"> <select name="unit">${unitOpts}</select></div></div>
      ${tables.length ? `<div class="form-group"><label class="checkbox"><input type="checkbox" name="encounters" ${encounterDefault ? "checked" : ""}> ${esc(t("Travel.Encounters", { tables: tables.map(id => local(defs().tables[id]?.name) || id).join(", ") }))}</label></div>` : ""}
      <p class="hint">${esc(t("Travel.Hint"))}</p>
    </div>`;
  };

  const { DialogV2 } = foundry.applications.api;
  const read = el => {
    const f = el.querySelector?.(".pa-travel")?.closest("form") ?? el.querySelector?.("form") ?? el;
    const get = n => f.querySelector(`[name="${n}"]`);
    return {
      how: get("how")?.value || trip.how,
      seconds: Math.max(0, Math.round(Number(get("amount")?.value) || 0)) * (UNIT_SECONDS[get("unit")?.value] ?? 3600),
      encounters: !!get("encounters")?.checked
    };
  };
  const answer = await DialogV2.wait({
    window: { title: t("Travel.Title"), icon: "fa-solid fa-route" },
    content: form(trip),
    buttons: [
      { action: "go", label: t("Travel.Go"), icon: "fa-solid fa-person-walking-arrow-right", default: true, callback: (_e, button) => ({ go: true, ...read(button.form ?? button.closest("form") ?? button.closest(".application")) }) },
      { action: "none", label: t("Travel.NoTime"), icon: "fa-solid fa-clock-rotate-left", callback: () => null }
    ],
    // A different way of travelling: estimate again (and roll again for rolled rules).
    render: (_event, dialog) => {
      const root = dialog?.element ?? _event?.target?.element;
      root?.querySelector?.('[name="how"]')?.addEventListener("change", async ev => {
        trip = await estimate({ from, to, atlasId, how: ev.target.value });
        const shown = inUnit(trip.seconds, trip.unit);
        root.querySelector('[name="amount"]').value = shown.amount;
        root.querySelector('[name="unit"]').value = shown.unit;
        root.querySelector(".pa-rule").textContent = ruleText(trip.how);
        const rolled = root.querySelector(".pa-rolled");
        if (rolled) rolled.remove();
      });
    },
    rejectClose: false
  }).catch(() => null);
  if (!answer?.go) return null;
  return { ...trip, how: answer.how, seconds: answer.seconds, encounters: answer.encounters, tables };
}

/* ---------------- encounters on the way ---------------- */

const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);

/** Roll one table (inline from the pack, or a world RollTable) and whisper the result to the GM. */
export async function rollTable(tableId, { where = "" } = {}) {
  const tb = defs().tables?.[tableId];
  if (!tb) return null;
  const name = local(tb.name) || tableId;
  let text = "", rolled = "";
  if (tb.rollTable) {
    const table = game.tables?.getName(tb.rollTable);
    if (!table) return info("Notify.NoRollTable", { name: tb.rollTable });
    const draw = await table.draw({ displayChat: false });
    text = (draw?.results ?? []).map(r => r.description || r.text || r.name || "").filter(Boolean).join(" · ");
    rolled = draw?.roll ? `${draw.roll.formula} = ${draw.roll.total}` : "";
  } else {
    const r = await roll(tb.formula);
    if (!r) return null;
    const row = tableRow(tb, r.total);
    text = local(row?.text) || "—";
    rolled = `${r.formula} = ${r.total}`;
  }
  const content = `<div class="planar-atlas-chat"><p><i class="fa-solid fa-dice"></i> <strong>${esc(name)}</strong>${where ? ` · ${esc(where)}` : ""} <span class="pa-meta">(${esc(rolled)})</span></p><p>${esc(text)}</p>${tb.ref ? `<p class="pa-meta"><code>${esc(tb.ref)}</code></p>` : ""}</div>`;
  await getDocumentClass("ChatMessage").create({ content, whisper: gmIds(), speaker: { alias: t("Travel.Speaker") } });
  return { tableId, total: rolled, text };
}

/** Roll every table that applies to a trip. */
export async function rollEncounters(tables, { where = "" } = {}) {
  const out = [];
  for (const id of tables ?? []) out.push(await rollTable(id, { where }));
  return out.filter(Boolean);
}
