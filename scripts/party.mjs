// «Η Συντροφιά»: the party window, for everyone. The road (every stop, by session), the common purse with its
// history, and the party's own notes. The GM also gets the controls for the road here: the session and in-world
// day stamped on the next stop, how they travel, undo, hide, archive.
import { MODULE_ID } from "./constants.mjs";
import { t, warn, local, language, toggleLanguage } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import { road, defs, company } from "./state.mjs";
import { atlasName, atlasIdOf, rectOf } from "./atlas.mjs";
import { findPlace, placeName, trackProgress } from "./places.mjs";
import * as clock from "./clock.mjs";
import { PlaceCard } from "./card.mjs";
import * as roadOps from "./road.mjs";
import { purse, purseLog, change as purseChange, undoEntry } from "./purse.mjs";
import { openNotes } from "./page.mjs";
import { escapeHTML as esc, activeJourney, sessionOrder, coinsText, parseCoins, COINS, fromNorm, parseHHMM } from "./util.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const TABS = { road: "fa-route", purse: "fa-coins", notes: "fa-feather-pointed" };
const btn = (act, icon, label, extra = "", cls = "") => `<button type="button" class="${cls}" data-act="${act}" ${extra}><i class="fa-solid ${icon}"></i>${label ? ` ${esc(label)}` : ""}</button>`;
const tip = s => `data-tooltip="${esc(s)}"`;

export class PartyWindow extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "planar-atlas-party",
    classes: ["planar-atlas", "pa-party-window"],
    window: { title: "PLANAR_ATLAS.Party.Title", icon: "fa-solid fa-people-group", resizable: true },
    position: { width: 560, height: 660 }
  };

  static #instance = null;
  static get instance() { return this.#instance; }

  static open({ tab = null } = {}) {
    this.#instance ??= new PartyWindow();
    const w = this.#instance;
    if (tab && tab in TABS) w.#tab = tab;
    w.render({ force: true });
    if (w.rendered) w.bringToFront?.();
    return w;
  }

  #tab = "road";
  #allLog = false;
  #boundTo = null;
  #timer = null;

  get title() { return local(defs().company?.name) || company()?.name || t("Party.Title"); }

  refreshSoon() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (!this.rendered) return;
      const active = document.activeElement;
      if (active && this.element.contains(active) && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return this.refreshSoon();
      this.render();
    }, 150);
  }

  async _prepareContext() { return {}; }
  async _renderHTML() { return this.#html(); }
  _replaceHTML(result, content) {
    const scroll = content.querySelector(".pa-body")?.scrollTop ?? 0;
    content.innerHTML = result;
    const body = content.querySelector(".pa-body");
    if (body) body.scrollTop = scroll;
  }

  _onRender() {
    if (this.window?.title) this.window.title.textContent = this.title;
    if (this.#boundTo === this.element) return;
    this.#boundTo = this.element;
    this.element.addEventListener("click", ev => this.#onClick(ev));
    this.element.addEventListener("change", ev => this.#onChange(ev));
    this.element.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && ev.target.closest(".pa-purse-form")) { ev.preventDefault(); this.#pay(ev.shiftKey ? "in" : "out"); }
    });
  }

  /* ---------------- markup ---------------- */

  #html() {
    const tabs = Object.entries(TABS).map(([k, icon]) => `<a class="pa-tab ${k === this.#tab ? "active" : ""}" data-act="tab" data-tab="${k}"><i class="fa-solid ${icon}"></i> ${esc(t(`Party.Tab.${k}`))}</a>`).join("");
    const lang = btn("lang", "fa-language", language() === "el" ? "ΕΛ" : "EN", tip(t("Party.Language")), "pa-lang");
    const body = { road: () => this.#road(), purse: () => this.#purse(), notes: () => this.#notes() }[this.#tab]();
    return `<nav class="pa-tabs">${tabs}<span class="pa-grow"></span>${lang}</nav><section class="pa-body">${body}</section>`;
  }

  #road() {
    const r = road();
    const gm = game.user.isGM;
    const j = activeJourney(r);
    const stops = j?.stops ?? [];
    const hows = defs().hows;
    let out = this.#clock() + this.#progress();
    if (gm) {
      const howOpts = [`<option value="">—</option>`, ...Object.entries(hows).map(([id, h]) => `<option value="${esc(id)}" ${id === r.next.how ? "selected" : ""}>${esc(local(h.name))}</option>`)].join("");
      out += `<div class="pa-next">
        <p class="pa-label"><i class="fa-solid fa-stamp"></i> ${esc(t("Road.NextLabel"))}</p>
        <div class="pa-row">
          <label ${tip(t("Road.SessionHint"))}>${esc(t("Road.Session"))} <input type="text" name="next.session" value="${esc(r.next.session)}" placeholder="S03"></label>
          <label ${tip(t("Road.HowHint"))}>${esc(t("Road.How"))} <select name="next.how">${howOpts}</select></label>
        </div>
        <div class="pa-row pa-tools">
          ${btn("place-company", "fa-people-group", t("Road.PlaceCompany"), tip(t("Road.PlaceCompanyHint")))}
          ${btn("undo", "fa-rotate-left", t("Road.Undo"), tip(t("Road.UndoHint")))}
          <label class="pa-check" ${tip(t("Road.HidePlayersHint"))}><input type="checkbox" name="hidden.players" ${r.hidden.players ? "checked" : ""}> ${esc(t("Road.HidePlayers"))}</label>
          <label class="pa-check"><input type="checkbox" name="hidden.all" ${r.hidden.all ? "checked" : ""}> ${esc(t("Road.HideAll"))}</label>
          <span class="pa-grow"></span>
          ${btn("archive", "fa-box-archive", "", tip(t("Road.ArchiveHint")))}
          ${btn("clear", "fa-eraser", "", tip(t("Road.ClearTitle")))}
        </div>
      </div>`;
    }
    const hidden = !gm && (r.hidden.players || r.hidden.all);
    if (hidden) return out + `<p class="pa-hint">${esc(t("Road.HiddenForPlayers"))}</p>`;
    const last = stops.at(-1);
    out += `<p class="pa-now"><i class="fa-solid fa-location-dot"></i> ${last
      ? esc(t("Road.Now", { place: roadOps.stopName(last), atlas: atlasName(last.atlas) }))
      : esc(t("Road.NoStops"))}</p>`;
    if (!stops.length) return out + (gm ? `<p class="pa-hint">${esc(t("Road.HowToStart"))}</p>` : "");

    // Newest session first; inside a session, stops in order.
    const sessions = sessionOrder(stops).reverse();
    for (const s of sessions) {
      const list = stops.map((st, i) => ({ st, n: i + 1 })).filter(x => (x.st.session ?? "") === s);
      out += `<h3 class="pa-session">${esc(s || t("Road.NoSession"))}</h3><ol class="pa-stops">`;
      for (const { st, n } of list) {
        const how = hows[st.how];
        const meta = [st.day && t("Card.Day", { day: st.day }), st.time, how && local(how.name), st.travel?.seconds && `⧗ ${clock.duration(st.travel.seconds)}`, st.cost].filter(Boolean).join(" · ");
        out += `<li class="pa-stop" data-id="${esc(st.id)}">
          <span class="pa-n">${n}</span>
          <div class="pa-stop-main">
            <a data-act="stop" data-id="${esc(st.id)}">${how ? `<i class="fa-solid ${esc(how.icon ?? "fa-route")}"></i> ` : ""}${esc(roadOps.stopName(st))}</a>
            <span class="pa-atlas">${esc(atlasName(st.atlas))}</span>
            ${meta ? `<span class="pa-meta">${esc(meta)}</span>` : ""}
            ${gm ? `<input type="text" class="pa-stop-note" name="stop-note" data-id="${esc(st.id)}" value="${esc(st.note ?? "")}" placeholder="${esc(t("Road.NotePlaceholder"))}">`
              : st.note ? `<span class="pa-note">${esc(st.note)}</span>` : ""}
          </div>
          ${gm ? btn("del-stop", "fa-xmark", "", `data-id="${esc(st.id)}" ${tip(t("Road.DeleteStop"))}`, "icon") : ""}
        </li>`;
      }
      out += `</ol>`;
    }
    if (gm) {
      const archived = r.journeys.filter(x => x.archived);
      if (archived.length) {
        out += `<h3 class="pa-session">${esc(t("Road.Archived"))}</h3><ul class="pa-archived">${archived.map(x => `<li><i class="fa-solid fa-box-archive"></i> ${esc(x.name || x.id)} <span class="pa-meta">${esc(t("Road.Stops", { n: x.stops.length }))}</span> ${btn("del-journey", "fa-trash", "", `data-id="${esc(x.id)}" ${tip(t("Road.DeleteJourney"))}`, "icon")}</li>`).join("")}</ul>`;
      }
    }
    return out;
  }

  /** The clock, for everyone; the GM can move it on or set it. */
  #clock() {
    const gm = game.user.isGM;
    const ctl = gm ? `<div class="pa-row pa-clock-tools">
        ${btn("clock", "fa-forward", "10′", `data-s="600" ${tip(t("Clock.Plus", { time: clock.duration(600) }))}`)}
        ${btn("clock", "fa-forward", "1h", `data-s="3600" ${tip(t("Clock.Plus", { time: clock.duration(3600) }))}`)}
        ${btn("clock", "fa-bed", "8h", `data-s="28800" ${tip(t("Clock.LongRest"))}`)}
        ${btn("clock", "fa-forward-fast", "1d", `data-s="86400" ${tip(t("Clock.Plus", { time: clock.duration(86400) }))}`)}
        ${btn("clock", "fa-backward", "", `data-s="-3600" ${tip(t("Clock.Minus", { time: clock.duration(3600) }))}`, "icon")}
        ${btn("clock-set", "fa-clock", t("Clock.Set"), tip(t("Clock.SetHint")))}
      </div>` : "";
    return `<div class="pa-clock"><i class="fa-solid fa-hourglass-half"></i> <span class="pa-clock-label">${esc(clock.label())}</span>${ctl}</div>`;
  }

  /** Progress tracks (e.g. gate-towns completed → level), for players only if the track allows. */
  #progress() {
    const gm = game.user.isGM;
    const tracks = defs().progress.filter(tr => gm || tr.players !== false);
    if (!tracks.length) return "";
    return tracks.map(tr => {
      const pr = trackProgress(tr);
      const dots = (tr.places ?? []).map(id => {
        const hit = findPlace(id);
        const known = hit && (gm || hit.place.status !== "hidden");
        const name = known ? placeName(hit.place) : "?";
        return `<span class="pa-dot ${pr.done.includes(id) ? "on" : ""}" data-tooltip="${esc(name)}"></span>`;
      }).join("");
      const reached = pr.reached.at(-1);
      const next = pr.next ? t("Progress.Next", { count: pr.next.count, text: local(pr.next.text) }) : t("Progress.AllDone");
      return `<div class="pa-progress"><span class="pa-progress-name">${esc(local(tr.name) || tr.id)}</span>
        <span class="pa-dots">${dots}</span><span class="pa-meta">${pr.count}/${pr.total}${reached ? ` · ${esc(local(reached.text))}` : ""} · ${esc(next)}</span></div>`;
    }).join("");
  }

  #purse() {
    const actor = company();
    if (!actor) return `<p class="pa-hint">${esc(t(game.user.isGM ? "Purse.NoCompanyGM" : "Purse.NoCompany"))}</p>${game.user.isGM ? btn("create-company", "fa-people-group", t("Console.CreateCompany")) : ""}`;
    const p = purse(actor);
    const coins = COINS.map(k => `<div class="pa-coin c-${k}"><span>${p[k]}</span><small>${k}</small></div>`).join("");
    const canPay = game.user.isGM || setting("purseForPlayers");
    const form = canPay ? `<div class="pa-purse-form">
        <input type="text" name="amount" placeholder="${esc(t("Purse.AmountPlaceholder"))}" ${tip(t("Purse.AmountHint"))}>
        <input type="text" name="why" placeholder="${esc(t("Purse.WhyPlaceholder"))}">
        ${btn("pay-in", "fa-plus", t("Purse.In"), tip(t("Purse.InHint")), "pa-in")}
        ${btn("pay-out", "fa-minus", t("Purse.Out"), tip(t("Purse.OutHint")), "pa-out")}
      </div>` : `<p class="pa-hint">${esc(t("Purse.Error.PlayersOff"))}</p>`;
    const log = [...purseLog(actor)].reverse();
    const shown = this.#allLog ? log : log.slice(0, 40);
    const rows = shown.map(e => `<li class="${e.undone ? "undone" : ""}">
        <span class="pa-amt ${coinsText(e.delta, { signed: true }).startsWith("−") ? "neg" : "pos"}">${esc(coinsText(e.delta, { signed: true }))}</span>
        <span class="pa-why">${esc(e.why || "—")}</span>
        <span class="pa-meta">${esc([e.who, e.session, String(e.date ?? "").slice(0, 10)].filter(Boolean).join(" · "))}</span>
        ${game.user.isGM && !e.undone ? btn("undo-purse", "fa-rotate-left", "", `data-id="${esc(e.id)}" ${tip(t("Purse.Undo"))}`, "icon") : ""}
      </li>`).join("");
    return `<div class="pa-coins">${coins}</div>
      <p class="pa-total">${esc(t("Purse.Total", { total: coinsText(p) }))}</p>
      ${form}
      <div class="pa-row pa-tools">${btn("sheet", "fa-id-card", t("Purse.Sheet"), tip(t("Purse.SheetHint")))}</div>
      <h3 class="pa-session">${esc(t("Purse.History"))}</h3>
      ${rows ? `<ul class="pa-log">${rows}</ul>` : `<p class="pa-hint">${esc(t("Purse.Empty"))}</p>`}
      ${log.length > shown.length ? btn("all-log", "fa-angles-down", t("Purse.ShowAll", { n: log.length })) : ""}`;
  }

  #notes() {
    return `<div class="pa-notes">
      <p>${esc(t("Notes.Intro"))}</p>
      ${btn("open-notes", "fa-feather-pointed", t("Notes.Open"), "", "pa-big")}
      <p class="pa-hint">${esc(t("Notes.Hint"))}</p>
    </div>`;
  }

  /* ---------------- actions ---------------- */

  async #pay(dir) {
    const amount = this.element.querySelector("[name=amount]")?.value ?? "";
    const why = this.element.querySelector("[name=why]")?.value ?? "";
    const coins = parseCoins(amount);
    if (!coins) return warn("Purse.Error.NoAmount");
    const res = await purseChange({ coins, dir, why });
    if (res?.ok) { this.element.querySelector("[name=amount]").value = ""; this.element.querySelector("[name=why]").value = ""; }
    this.refreshSoon();
  }

  async #onChange(ev) {
    const el = ev.target;
    if (!game.user.isGM) return;
    if (el.name?.startsWith("next.")) return roadOps.setNextMove({ [el.name.slice(5)]: el.value.trim() });
    if (el.name?.startsWith("hidden.")) return roadOps.setHidden({ [el.name.slice(7)]: el.checked });
    if (el.name === "stop-note") return roadOps.editStop(el.dataset.id, { note: el.value.trim() });
  }

  async #onClick(ev) {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    try {
      switch (act) {
        case "tab": this.#tab = el.dataset.tab; this.render(); break;
        case "lang": await toggleLanguage(); break;
        case "place-company": await roadOps.placeCompany(); break;
        case "create-company": await roadOps.createCompany(); this.render(); break;
        case "undo": await roadOps.undoLast(); break;
        case "clock": await clock.advance(Number(el.dataset.s)); break;
        case "clock-set": await setClockDialog(); break;
        case "archive": {
          const name = await DialogV2.prompt({
            window: { title: t("Road.ArchiveTitle") },
            content: `<p>${esc(t("Road.ArchiveAsk"))}</p><input type="text" name="name" autofocus>`,
            ok: { label: t("Road.Archive"), callback: (_e, button) => button.form.elements.name.value }
          }).catch(() => null);
          if (name !== null && name !== undefined) await roadOps.archive(String(name).trim());
          break;
        }
        case "clear": await roadOps.clearRoad(); break;
        case "del-stop": await roadOps.deleteStop(el.dataset.id); break;
        case "del-journey": await roadOps.deleteArchived(el.dataset.id); break;
        case "stop": await this.#goToStop(el.dataset.id); break;
        case "pay-in": await this.#pay("in"); break;
        case "pay-out": await this.#pay("out"); break;
        case "undo-purse": await undoEntry(el.dataset.id); break;
        case "all-log": this.#allLog = true; this.render(); break;
        case "sheet": company()?.sheet?.render(true); break;
        case "open-notes": await openNotes(); break;
      }
    } catch (err) {
      console.error(`${MODULE_ID} | party ${act}`, err);
      warn("Notify.Failed");
    }
  }

  /** A stop in the list: its place's card, and the map centred on it when it is the atlas on screen. */
  async #goToStop(id) {
    const st = activeJourney(road())?.stops.find(s => s.id === id);
    if (!st) return;
    if (st.place) {
      const hit = findPlace(st.place);
      if (hit) PlaceCard.show(hit.page);
    }
    if (atlasIdOf(canvas.scene) === st.atlas) {
      const p = fromNorm(rectOf(canvas.scene), st);
      await canvas.animatePan({ x: p.x, y: p.y });
    }
  }
}

/** "It is day …, at …": the GM sets the clock (only the day count moves; Foundry's world time doesn't). */
export async function setClockDialog() {
  const { DialogV2 } = foundry.applications.api;
  const c = clock.read();
  const res = await DialogV2.prompt({
    window: { title: t("Clock.SetTitle"), icon: "fa-solid fa-clock" },
    content: `<div class="form-group"><label>${esc(t("Clock.DayLabel"))}</label><div class="form-fields"><input type="number" name="day" min="1" value="${c.day}"></div></div>
      <div class="form-group"><label>${esc(t("Clock.TimeLabel"))}</label><div class="form-fields"><input type="text" name="time" value="${c.time}" placeholder="10:00"></div></div>
      <p class="hint">${esc(t("Clock.SetHint"))}</p>`,
    ok: { label: t("Clock.Set"), callback: (_e, button) => ({ day: button.form.elements.day.value, time: button.form.elements.time.value }) },
    rejectClose: false
  }).catch(() => null);
  if (!res) return;
  const tod = parseHHMM(res.time);
  if (tod === null) return warn("Notify.BadTime", { time: res.time });
  await clock.setTo(Number(res.day) || 1, tod);
}
