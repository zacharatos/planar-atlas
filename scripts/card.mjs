// The place card: what a place is, as each user may see it. Players get the name, a picture, what they know
// and when they were there; the GM also gets the secrets, the links (Theater, Soundboard, battle map, prep note)
// and the buttons that change the place, move the party there or pay its price from the purse.
import { MODULE_ID } from "./constants.mjs";
import { t, warn, local, language } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import { defs, road, atlasDef } from "./state.mjs";
import { placeOfPage, placeName, savePlace, setStatus, deletePlace, noteOfPage, setDone } from "./places.mjs";
import { rollEncounters } from "./travel.mjs";
import { moveCompanyTo } from "./road.mjs";
import { change as purseChange } from "./purse.mjs";
import { atlasName, sceneOfAtlas, pickImage } from "./atlas.mjs";
import { escapeHTML as esc, localText, visitsOf, STATUSES, parseCoins, coinsText, fold, encounterTables } from "./util.mjs";

/** A scene by exact name, else the first whose name contains it (accents and case ignored). */
const sceneNamed = name => (name ? game.scenes.getName(name) ?? game.scenes.find(s => fold(s.name).includes(fold(name))) ?? null : null);

const { ApplicationV2 } = foundry.applications.api;
const STATUS_ICON = { hidden: "fa-eye-slash", rumoured: "fa-question", known: "fa-eye", visited: "fa-shoe-prints" };

/** A picture path from the pack: absolute, or relative to the "image folder" setting. */
export function imagePath(src) {
  if (!src) return "";
  if (/^(https?:|data:|\/|worlds\/|modules\/|systems\/|icons\/)/i.test(src)) return src;
  const base = String(setting("imageBase") ?? "").replace(/\/+$/, "");
  return base ? `${base}/${src}` : src;
}

const btn = (act, icon, label, extra = "") => `<button type="button" data-act="${act}" ${extra}><i class="fa-solid ${icon}"></i>${label ? ` ${esc(label)}` : ""}</button>`;
const tip = s => `data-tooltip="${esc(s)}"`;

export class PlaceCard extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "planar-atlas-card",
    classes: ["planar-atlas", "pa-card-window"],
    window: { title: "PLANAR_ATLAS.Card.Title", icon: "fa-solid fa-map-pin", resizable: true },
    position: { width: 440, height: "auto" }
  };

  static #instance = null;
  static get instance() { return this.#instance; }

  /** Show a place's card (one card window, reused). */
  static show(page, { edit = false } = {}) {
    if (!page || !placeOfPage(page)) return null;
    this.#instance ??= new PlaceCard();
    const c = this.#instance;
    c.#pageUuid = page.uuid;
    c.#edit = edit && game.user.isGM;
    c.render({ force: true });
    if (c.rendered) c.bringToFront?.();
    return c;
  }

  #pageUuid = null;
  #edit = false;
  #boundTo = null;

  get page() {
    if (!this.#pageUuid) return null;
    try { return (foundry.utils.fromUuidSync ?? globalThis.fromUuidSync)(this.#pageUuid); } catch { return null; }
  }
  get pageUuid() { return this.#pageUuid; }

  get title() {
    const pl = placeOfPage(this.page);
    if (!pl) return t("Card.Title");
    return game.user.isGM || pl.status !== "rumoured" ? placeName(pl) : t("Card.Unknown");
  }

  async _prepareContext() { return {}; }
  async _renderHTML() { return this.#html(); }
  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender() {
    if (this.window?.title) this.window.title.textContent = this.title;
    if (this.#boundTo === this.element) return;
    this.#boundTo = this.element;
    this.element.addEventListener("click", ev => this.#onClick(ev));
    this.element.addEventListener("submit", ev => { ev.preventDefault(); this.#save(); });
  }

  refreshSoon() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if (!this.rendered || this.#edit) return;
      if (!placeOfPage(this.page)) return this.close();
      this.render();
    }, 120);
  }

  /* ---------------- markup ---------------- */

  #html() {
    const page = this.page;
    const pl = placeOfPage(page);
    if (!pl) return `<p class="pa-hint">${esc(t("Card.Gone"))}</p>`;
    if (this.#edit) return this.#form(pl);
    const gm = game.user.isGM;
    const lang = language();
    const cat = defs().categories[pl.cat] ?? defs().categories.landmark;
    const rumour = pl.status === "rumoured";
    const name = gm || !rumour ? placeName(pl, lang) : t("Card.Unknown");
    const text = rumour ? (localText(pl.rumour, lang) || t("Card.RumourDefault")) : localText(pl.text, lang);
    const img = !rumour || gm ? imagePath(pl.img) : "";
    const visits = visitsOf(road(), pl.id);
    const visitText = visits.length
      ? visits.map(v => [v.session, v.day && t("Card.Day", { day: v.day }), v.time].filter(Boolean).join(" · ") || "—").join(" — ")
      : "";
    const head = `<header class="pa-card-head">
      <img class="pa-cat" src="${esc(cat.icon)}" style="--pa-tint:${esc(cat.color ?? "#fff")}" alt="">
      <div><h2>${esc(name)}</h2>
        <p class="pa-sub">${esc(local(cat.name))}${pl.area ? ` · ${esc(local(defs().atlases.find(a => a.id === pl.atlas)?.areas?.find(a => a.id === pl.area)?.name) || pl.area)}` : ""} · ${esc(atlasName(pl.atlas))}</p></div>
      ${gm ? `<span class="pa-status s-${pl.status}" ${tip(t(`Status.${pl.status}.Hint`))}><i class="fa-solid ${STATUS_ICON[pl.status]}"></i> ${esc(t(`Status.${pl.status}.Name`))}</span>` : ""}
    </header>`;
    const body = `${img ? `<figure class="pa-figure"><img src="${esc(img)}" alt=""></figure>` : ""}
      ${text ? `<div class="pa-text">${esc(text).split(/\n+/).map(p => `<p>${p}</p>`).join("")}</div>` : `<p class="pa-hint">${esc(t("Card.NoText"))}</p>`}
      ${visitText ? `<p class="pa-visits"><i class="fa-solid fa-shoe-prints"></i> ${esc(t("Card.Visits"))}: ${esc(visitText)}</p>` : ""}
      ${pl.done ? `<p class="pa-done"><i class="fa-solid fa-circle-check"></i> ${esc(t("Card.Done"))}</p>` : ""}`;
    return `<div class="pa-card">${head}${body}${gm ? this.#gmPart(pl) : ""}</div>`;
  }

  #gmPart(pl) {
    const L = pl.links ?? {};
    const theater = game.modules.get("planar-theater")?.active && L.theater;
    const scape = !!globalThis.PlanarSoundboard?.activate && L.scape;
    const battle = sceneNamed(L.scene);
    const price = parseCoins(pl.price);
    const statusBtns = STATUSES.map(s => `<button type="button" class="pa-st ${s === pl.status ? "on" : ""}" data-act="status" data-status="${s}" ${tip(t(`Status.${s}.Hint`))}><i class="fa-solid ${STATUS_ICON[s]}"></i> ${esc(t(`Status.${s}.Name`))}</button>`).join("");
    const secrets = [
      pl.gm ? `<div class="pa-gm-text"><i class="fa-solid fa-user-secret"></i> ${esc(pl.gm).replace(/\n+/g, "<br>")}</div>` : "",
      `<p class="pa-meta">${[
        localText(pl.name, "en") && `EN: ${esc(localText(pl.name, "en"))}`,
        pl.ref && `<code>${esc(pl.ref)}</code>`,
        pl.sets?.length && `${esc(t("Card.Sets"))}: ${pl.sets.map(s => esc(local(defs().sets?.[s]?.name) || s)).join(", ")}`,
        L.faction && `${esc(t("Card.Faction"))}: ${esc(L.faction)}`
      ].filter(Boolean).join(" · ")}</p>`
    ].join("");
    const actions = [
      btn("move", "fa-person-walking-arrow-right", t("Card.Move")),
      btn("pan", "fa-crosshairs", "", tip(t("Card.Pan"))),
      theater ? btn("theater", "fa-masks-theater", t("Card.Theater"), tip(t("Card.TheaterHint", { name: L.theater }))) : "",
      theater ? btn("theater-off", "fa-eye-slash", "", tip(t("Card.TheaterOff"))) : "",
      scape ? btn("scape", "fa-music", t("Card.Scape"), tip(L.scape)) : "",
      battle ? btn("battle", "fa-chess-rook", t("Card.Battle"), tip(L.scene)) : "",
      L.prep ? btn("prep", "fa-book-open", t("Card.Prep"), tip(L.prep)) : "",
      price ? btn("pay", "fa-coins", t("Card.Pay", { price: coinsText(price) })) : "",
      encounterTables(atlasDef(pl.atlas), pl.area).length ? btn("encounter", "fa-dice", t("Card.Encounter"), tip(t("Card.EncounterHint"))) : "",
      btn("done", pl.done ? "fa-circle-check" : "fa-circle", t(pl.done ? "Card.Done" : "Card.MarkDone"), `${tip(t("Card.DoneHint"))} class="${pl.done ? "on" : ""}"`)
    ].join("");
    return `<section class="pa-gm">
      <div class="pa-statuses">${statusBtns}</div>
      ${secrets}
      <div class="pa-actions">${actions}</div>
      <footer class="pa-foot">${btn("edit", "fa-pen", t("Card.Edit"))}${btn("delete", "fa-trash", "", tip(t("Card.Delete")))}</footer>
    </section>`;
  }

  #form(pl) {
    const cats = Object.entries(defs().categories).map(([id, c]) => `<option value="${esc(id)}" ${id === pl.cat ? "selected" : ""}>${esc(local(c.name))}</option>`).join("");
    const L = pl.links ?? {};
    const field = (name, label, value, { area = false, hint = "" } = {}) => `<div class="form-group ${area ? "stacked" : ""}"><label>${esc(label)}</label>
      <div class="form-fields">${area ? `<textarea name="${name}" rows="3">${esc(value)}</textarea>` : `<input type="text" name="${name}" value="${esc(value)}">`}</div>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
    return `<form class="pa-form">
      ${field("name.el", t("Form.NameEl"), localText(pl.name, "el"))}
      ${field("name.en", t("Form.NameEn"), localText(pl.name, "en"))}
      <div class="form-group"><label>${esc(t("Form.Category"))}</label><div class="form-fields"><select name="cat">${cats}</select></div></div>
      ${field("text.el", t("Form.TextEl"), localText(pl.text, "el"), { area: true })}
      ${field("rumour.el", t("Form.RumourEl"), localText(pl.rumour, "el"), { area: true, hint: t("Form.RumourHint") })}
      ${field("gm", t("Form.Gm"), pl.gm, { area: true })}
      <div class="form-group"><label>${esc(t("Form.Img"))}</label><div class="form-fields"><input type="text" name="img" value="${esc(pl.img)}">${btn("pick-img", "fa-file-image", "")}</div>
        <p class="hint">${esc(t("Form.ImgHint"))}</p></div>
      ${field("ref", t("Form.Ref"), pl.ref)}
      ${field("price", t("Form.Price"), pl.price, { hint: t("Form.PriceHint") })}
      ${field("sets", t("Form.Sets"), (pl.sets ?? []).join(", "))}
      <fieldset><legend>${esc(t("Form.Links"))}</legend>
        ${field("links.theater", t("Form.Theater"), L.theater, { hint: t("Form.TheaterHint") })}
        ${field("links.theaterScene", t("Form.TheaterScene"), L.theaterScene)}
        ${field("links.scape", t("Form.Scape"), L.scape)}
        ${field("links.scene", t("Form.Scene"), L.scene)}
        ${field("links.prep", t("Form.Prep"), L.prep, { hint: t("Form.PrepHint") })}
        ${field("links.faction", t("Form.Faction"), L.faction)}
      </fieldset>
      <footer class="pa-foot"><button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${esc(t("Form.Save"))}</button>${btn("cancel", "fa-xmark", t("Form.Cancel"))}</footer>
    </form>`;
  }

  /* ---------------- actions ---------------- */

  async #save() {
    const page = this.page;
    const pl = placeOfPage(page);
    const form = this.element.querySelector("form.pa-form");
    if (!pl || !form) return;
    const v = name => form.elements[name]?.value?.trim() ?? "";
    const both = (key, el) => ({ ...(typeof pl[key] === "object" && pl[key] ? pl[key] : { en: typeof pl[key] === "string" ? pl[key] : "" }), el });
    const patch = {
      name: { el: v("name.el"), en: v("name.en") },
      cat: v("cat") || pl.cat,
      text: both("text", v("text.el")),
      rumour: both("rumour", v("rumour.el")),
      gm: v("gm"), img: v("img"), ref: v("ref"), price: v("price"),
      sets: v("sets").split(",").map(s => s.trim()).filter(Boolean),
      links: Object.fromEntries(["theater", "theaterScene", "scape", "scene", "prep", "faction"].map(k => [k, v(`links.${k}`)]))
    };
    await savePlace(page, patch);
    this.#edit = false;
    this.render();
  }

  async #onClick(ev) {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const page = this.page;
    const pl = placeOfPage(page);
    if (!pl) return;
    const L = pl.links ?? {};
    const act = el.dataset.act;
    try {
      switch (act) {
        case "status": await setStatus(page, el.dataset.status); break;
        case "move": await moveCompanyTo(page); break;
        case "pan": {
          const note = noteOfPage(page);
          const scene = sceneOfAtlas(pl.atlas);
          if (!note || !scene) return warn("Notify.NotPinned", { name: placeName(pl) });
          if (scene !== canvas.scene) await scene.view();
          await canvas.animatePan({ x: note.x, y: note.y, scale: Math.max(canvas.stage.scale.x, 0.6) });
          break;
        }
        case "theater": {
          const api = game.modules.get("planar-theater")?.api;
          await api?.showPlace?.(L.theater, L.theaterScene ? { scene: L.theaterScene } : {});
          break;
        }
        case "theater-off": await game.modules.get("planar-theater")?.api?.hide?.(); break;
        case "scape": await globalThis.PlanarSoundboard?.activate?.(L.scape); break;
        case "battle": {
          const scene = sceneNamed(L.scene);
          if (!scene) return warn("Notify.NoBattleScene", { name: L.scene });
          await scene.activate();
          break;
        }
        case "prep": openPrep(L.prep); break;
        case "pay": {
          const price = parseCoins(pl.price);
          if (price) await purseChange({ coins: price, dir: "out", why: placeName(pl, "el") });
          break;
        }
        case "done": await setDone(page, !pl.done); break;
        case "encounter": await rollEncounters(encounterTables(atlasDef(pl.atlas), pl.area), { where: placeName(pl) }); break;
        case "edit": this.#edit = true; this.render(); break;
        case "cancel": this.#edit = false; this.render(); break;
        case "pick-img": {
          const path = await pickImage(imagePath(this.element.querySelector("[name=img]")?.value));
          if (path) this.element.querySelector("[name=img]").value = path;
          break;
        }
        case "delete": if (await deletePlace(page)) this.close(); break;
      }
    } catch (err) {
      console.error(`${MODULE_ID} | card ${act}`, err);
      warn("Notify.Failed");
    }
  }
}

/** Open a prep note by name, with an optional "#heading" (Codex or any journal page with that name). */
export function openPrep(link) {
  const [name, heading] = String(link ?? "").split("#").map(s => s.trim());
  if (!name) return;
  for (const entry of game.journal) {
    const page = entry.pages.find(p => p.name === name) ?? (entry.name === name ? entry.pages.contents[0] : null);
    if (!page) continue;
    const anchor = heading ? Object.values(page.toc ?? {}).find(h => h.text?.startsWith?.(heading.replace(/[*`]/g, "")))?.slug : undefined;
    entry.sheet.render(true, { pageId: page.id, ...(anchor ? { anchor } : {}) });
    return;
  }
  warn("Notify.NoPrep", { name });
}
