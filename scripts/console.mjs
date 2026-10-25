// The GM console: set up (the campaign pack, the Company, each atlas's scene and places, reveal sets, the pages)
// and the places of an atlas at a glance (status, parked or on the map, search).
import { MODULE_ID } from "./constants.mjs";
import { t, warn, info, local, language, toggleLanguage } from "./i18n.mjs";
import { setting, setSetting } from "./settings.mjs";
import { pack, importPack, defs, company } from "./state.mjs";
import { atlases, atlasIdOf, bindScene, createAtlasScene, atlasName } from "./atlas.mjs";
import { setupPlaces, placesOn, setStatus, createPlace, downloadPack, revealSet, placeName } from "./places.mjs";
import { createCompany, addMembers, placeCompany } from "./road.mjs";
import { PlaceCard } from "./card.mjs";
import { PartyWindow } from "./party.mjs";
import { syncRoadPage, syncPursePage, openNotes } from "./page.mjs";
import { escapeHTML as esc, STATUSES, fold, localText } from "./util.mjs";

const { ApplicationV2 } = foundry.applications.api;
const TABS = { setup: "fa-screwdriver-wrench", places: "fa-map-pin" };
const btn = (act, icon, label, extra = "", cls = "") => `<button type="button" class="${cls}" data-act="${act}" ${extra}><i class="fa-solid ${icon}"></i>${label ? ` ${esc(label)}` : ""}</button>`;
const tip = s => `data-tooltip="${esc(s)}"`;

export class AtlasConsole extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "planar-atlas-console",
    classes: ["planar-atlas", "pa-console-window"],
    window: { title: "PLANAR_ATLAS.Console.Title", icon: "fa-solid fa-map-location-dot", resizable: true },
    position: { width: 620, height: 680 }
  };

  static #instance = null;
  static get instance() { return this.#instance; }

  static open({ tab = null } = {}) {
    if (!game.user.isGM) return warn("Notify.OnlyGM");
    this.#instance ??= new AtlasConsole();
    const c = this.#instance;
    if (tab && tab in TABS) c.#tab = tab;
    c.render({ force: true });
    if (c.rendered) c.bringToFront?.();
    return c;
  }

  #tab = "setup";
  #atlas = null;
  #filter = "";
  #boundTo = null;
  #timer = null;

  get title() { return t("Console.Title"); }

  refreshSoon() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (!this.rendered) return;
      const active = document.activeElement;
      if (active && this.element.contains(active) && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) && active.type !== "checkbox") return this.refreshSoon();
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
    this.#applyFilter();
    if (this.#boundTo === this.element) return;
    this.#boundTo = this.element;
    this.element.addEventListener("click", ev => this.#onClick(ev));
    this.element.addEventListener("change", ev => this.#onChange(ev));
    this.element.addEventListener("input", ev => {
      if (ev.target.name !== "filter") return;
      this.#filter = ev.target.value;
      this.#applyFilter();
    });
  }

  /* ---------------- markup ---------------- */

  #html() {
    const tabs = Object.entries(TABS).map(([k, icon]) => `<a class="pa-tab ${k === this.#tab ? "active" : ""}" data-act="tab" data-tab="${k}"><i class="fa-solid ${icon}"></i> ${esc(t(`Console.Tab.${k}`))}</a>`).join("");
    const lang = btn("lang", "fa-language", language() === "el" ? "ΕΛ" : "EN", tip(t("Party.Language")), "pa-lang");
    const party = btn("party", "fa-people-group", "", tip(t("Console.OpenParty")));
    const body = this.#tab === "places" ? this.#places() : this.#setup();
    return `<nav class="pa-tabs">${tabs}<span class="pa-grow"></span>${party}${lang}</nav><section class="pa-body">${body}</section>`;
  }

  #setup() {
    const p = pack();
    const out = [];
    // The pack
    out.push(`<h3 class="pa-session"><i class="fa-solid fa-box-open"></i> ${esc(t("Console.Pack"))}</h3>`);
    out.push(p
      ? `<p>${esc(t("Console.PackLoaded", { name: local(p.name) || p.id, atlases: p.atlases?.length ?? 0, places: p.places?.length ?? 0 }))}</p>`
      : `<p class="pa-hint">${esc(t("Console.NoPack"))}</p>`);
    out.push(`<div class="pa-row pa-tools">
      <span class="pa-file">${btn("import", "fa-file-import", t("Console.Import"))}<input type="file" name="pack-file" accept=".json,application/json" hidden></span>
      ${p ? btn("export", "fa-file-export", t("Console.Export"), tip(t("Console.ExportHint"))) : ""}
    </div>`);

    // The Company
    const actor = company();
    out.push(`<h3 class="pa-session"><i class="fa-solid fa-people-group"></i> ${esc(t("Console.Company"))}</h3>`);
    if (actor) {
      const members = Array.isArray(actor.system?.members) ? actor.system.members.map(m => m?.actor?.name ?? m?.name).filter(Boolean) : [];
      out.push(`<p>${esc(t("Console.CompanyIs", { name: actor.name, members: members.join(", ") || "—" }))}</p>
        <div class="pa-row pa-tools">${btn("company-sheet", "fa-id-card", t("Console.CompanySheet"))}${btn("company-members", "fa-user-plus", t("Console.AddHeroes"), tip(t("Console.AddHeroesHint")))}${btn("place-company", "fa-location-dot", t("Road.PlaceCompany"), tip(t("Road.PlaceCompanyHint")))}</div>`);
    } else {
      out.push(`<p class="pa-hint">${esc(t("Console.NoCompany"))}</p><div class="pa-row pa-tools">${btn("create-company", "fa-people-group", t("Console.CreateCompany"))}</div>`);
    }

    // The atlases
    out.push(`<h3 class="pa-session"><i class="fa-solid fa-map"></i> ${esc(t("Console.Atlases"))}</h3>`);
    const list = atlases();
    if (!list.length) out.push(`<p class="pa-hint">${esc(t("Console.NoAtlases"))}</p>`);
    const here = atlasIdOf(canvas.scene);
    for (const a of list) {
      const places = a.scene ? placesOn(a.id) : [];
      const parked = places.filter(x => x.note?.getFlag(MODULE_ID, "parked")).length;
      const packCount = (p?.places ?? []).filter(x => x.atlas === a.id).length;
      out.push(`<div class="pa-atlas-row">
        <div><strong>${esc(a.name)}</strong> ${a.def.map ? `<span class="pa-meta">${esc(a.def.map)}</span>` : ""}<br>
          <span class="pa-meta">${a.scene ? esc(t("Console.SceneIs", { name: a.scene.name })) : esc(t("Console.NoSceneYet"))} · ${esc(t("Console.PlaceCount", { n: places.length, pack: packCount }))}${parked ? ` · <span class="pa-warn">${esc(t("Console.Parked", { n: parked }))}</span>` : ""}</span></div>
        <div class="pa-row">
          ${a.scene ? btn("view", "fa-eye", "", `data-atlas="${esc(a.id)}" ${tip(t("Console.View"))}`) : btn("create-scene", "fa-image", t("Console.CreateScene"), `data-atlas="${esc(a.id)}" ${tip(t("Console.CreateSceneHint"))}`)}
          ${canvas.scene && here !== a.id ? btn("bind", "fa-link", "", `data-atlas="${esc(a.id)}" ${tip(t("Console.BindHint", { scene: canvas.scene.name }))}`) : ""}
          ${a.scene ? btn("setup", "fa-map-pin", t("Console.SetUp"), `data-atlas="${esc(a.id)}" ${tip(t("Console.SetUpHint"))}`) : ""}
          ${a.scene ? btn("places", "fa-list", "", `data-atlas="${esc(a.id)}" ${tip(t("Console.ListPlaces"))}`) : ""}
        </div></div>`);
    }

    // Reveal sets
    const sets = Object.entries(defs().sets ?? {});
    if (sets.length) {
      out.push(`<h3 class="pa-session"><i class="fa-solid fa-lightbulb"></i> ${esc(t("Console.Sets"))}</h3><p class="pa-hint">${esc(t("Console.SetsHint"))}</p>`);
      out.push(`<div class="pa-row pa-tools">${sets.map(([id, s]) => btn("reveal-set", "fa-eye", local(s.name) || id, `data-set="${esc(id)}" ${tip(local(s.hint) || "")}`)).join("")}</div>`);
    }

    // Pages and settings
    out.push(`<h3 class="pa-session"><i class="fa-solid fa-book"></i> ${esc(t("Console.Pages"))}</h3>
      <div class="pa-row pa-tools">${btn("sync-pages", "fa-rotate", t("Console.SyncPages"), tip(t("Console.SyncPagesHint")))}${btn("open-notes", "fa-feather-pointed", t("Notes.Open"))}</div>
      <div class="form-group"><label>${esc(t("Settings.imageBase.Name"))}</label>
        <div class="form-fields"><input type="text" name="imageBase" value="${esc(setting("imageBase"))}" placeholder="worlds/…/visuals"></div>
        <p class="hint">${esc(t("Settings.imageBase.Hint"))}</p></div>`);
    return out.join("\n");
  }

  #places() {
    const list = atlases().filter(a => a.scene);
    if (!list.length) return `<p class="pa-hint">${esc(t("Console.NoScenes"))}</p>`;
    const id = this.#atlas && list.some(a => a.id === this.#atlas) ? this.#atlas : (atlasIdOf(canvas.scene) ?? list[0].id);
    this.#atlas = id;
    const opts = list.map(a => `<option value="${esc(a.id)}" ${a.id === id ? "selected" : ""}>${esc(a.name)}</option>`).join("");
    const places = placesOn(id).sort((a, b) => placeName(a.place).localeCompare(placeName(b.place), language()));
    const counts = Object.fromEntries(STATUSES.map(s => [s, places.filter(x => x.place.status === s).length]));
    const rows = places.map(({ page, place, note }) => {
      const cat = defs().categories[place.cat] ?? defs().categories.landmark;
      const status = STATUSES.map(s => `<option value="${s}" ${s === place.status ? "selected" : ""}>${esc(t(`Status.${s}.Name`))}</option>`).join("");
      const parked = note?.getFlag(MODULE_ID, "parked");
      const search = fold(`${localText(place.name, "el")} ${localText(place.name, "en")} ${place.id}`);
      return `<li class="pa-place s-${place.status}" data-search="${esc(search)}">
        <img class="pa-cat" src="${esc(cat.icon)}" style="--pa-tint:${esc(cat.color ?? "#fff")}" alt="">
        <a data-act="card" data-uuid="${esc(page.uuid)}">${esc(placeName(place))}</a>
        ${parked ? `<span class="pa-warn" ${tip(t("Console.ParkedHint"))}><i class="fa-solid fa-square-parking"></i></span>` : ""}
        ${!note ? `<span class="pa-warn" ${tip(t("Console.NoNote"))}><i class="fa-solid fa-triangle-exclamation"></i></span>` : ""}
        <span class="pa-grow"></span>
        <select name="status" data-uuid="${esc(page.uuid)}">${status}</select>
      </li>`;
    }).join("");
    return `<div class="pa-row pa-tools">
        <select name="atlas">${opts}</select>
        <input type="search" name="filter" value="${esc(this.#filter)}" placeholder="${esc(t("Console.Search"))}">
        ${atlasIdOf(canvas.scene) === id ? btn("new-place", "fa-plus", t("Console.NewPlace"), tip(t("Console.NewPlaceHint"))) : ""}
      </div>
      <p class="pa-meta">${STATUSES.map(s => `${esc(t(`Status.${s}.Name`))}: ${counts[s]}`).join(" · ")}</p>
      ${rows ? `<ul class="pa-places">${rows}</ul>` : `<p class="pa-hint">${esc(t("Console.NoPlaces", { name: atlasName(id) }))}</p>`}`;
  }

  #applyFilter() {
    const q = fold(this.#filter);
    for (const li of this.element.querySelectorAll(".pa-place")) li.hidden = !!q && !li.dataset.search.includes(q);
  }

  /* ---------------- actions ---------------- */

  async #onChange(ev) {
    const el = ev.target;
    if (el.name === "pack-file") return this.#readPack(el);
    if (el.name === "atlas") { this.#atlas = el.value; return this.render(); }
    if (el.name === "imageBase") return setSetting("imageBase", el.value.trim());
    if (el.name === "status") {
      const from = foundry.utils.fromUuidSync ?? globalThis.fromUuidSync;
      const page = from(el.dataset.uuid);
      if (page) await setStatus(page, el.value);
    }
  }

  async #readPack(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { return warn("Notify.PackNotJson"); }
    const errors = await importPack(data);
    if (errors.length) {
      console.warn(`${MODULE_ID} | pack problems`, errors);
      return warn("Notify.PackInvalid", { n: errors.length, first: errors[0] });
    }
    info("Notify.PackImported", { name: local(data.name) || data.id });
    this.render();
  }

  async #onClick(ev) {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const atlasId = el.dataset.atlas;
    try {
      switch (act) {
        case "tab": this.#tab = el.dataset.tab; this.render(); break;
        case "lang": await toggleLanguage(); break;
        case "party": PartyWindow.open(); break;
        case "import": el.closest(".pa-file")?.querySelector("input[type=file]")?.click(); break;
        case "export": downloadPack(); break;
        case "create-company": await createCompany(); this.render(); break;
        case "company-sheet": company()?.sheet?.render(true); break;
        case "company-members": {
          const actor = company();
          if (actor) await addMembers(actor, game.actors.filter(a => a.type === "character" && a.hasPlayerOwner));
          this.render();
          break;
        }
        case "place-company": await placeCompany(); break;
        case "create-scene": await createAtlasScene(atlasId); this.render(); break;
        case "bind": await bindScene(canvas.scene, atlasId); this.render(); break;
        case "view": await game.scenes.find(s => s.getFlag(MODULE_ID, "atlas") === atlasId)?.view(); break;
        case "setup": await setupPlaces(atlasId); this.render(); break;
        case "places": this.#atlas = atlasId; this.#tab = "places"; this.render(); break;
        case "reveal-set": await revealSet(el.dataset.set); break;
        case "sync-pages": await syncRoadPage(); await syncPursePage(); info("Notify.PagesSynced"); break;
        case "open-notes": await openNotes(); break;
        case "card": {
          const from = foundry.utils.fromUuidSync ?? globalThis.fromUuidSync;
          const page = from(el.dataset.uuid);
          if (page) PlaceCard.show(page);
          break;
        }
        case "new-place": {
          const page = await createPlace();
          if (page) PlaceCard.show(page, { edit: true });
          break;
        }
      }
    } catch (err) {
      console.error(`${MODULE_ID} | console ${act}`, err);
      warn("Notify.Failed");
    }
  }
}
