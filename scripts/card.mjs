// The place card: what a place is, as each user may see it. Players get the name, a picture, what they know
// and when they were there; the GM also gets the secrets, the links (Theater, Soundboard, battle map, prep note)
// and the buttons that change the place, move the party there or pay its price from the purse.
import { MODULE_ID, PORTAL_KIND_STYLE } from "./constants.mjs";
import { t, warn, local, language } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import { defs, road, atlasDef } from "./state.mjs";
import { placeOfPage, placeName, savePlace, setStatus, deletePlace, noteOfPage, setDone, pageOfPlace, allPlaces, createPortal, pinPortal } from "./places.mjs";
import { portalsOf, keyCarriers } from "./portals.mjs";
import { rollEncounters } from "./travel.mjs";
import { moveCompanyTo, travelThrough } from "./road.mjs";
import { change as purseChange } from "./purse.mjs";
import { atlasName, sceneOfAtlas, pickImage } from "./atlas.mjs";
import { escapeHTML as esc, localText, visitsOf, STATUSES, parseCoins, coinsText, fold, encounterTables, PORTAL_KINDS, portalForPlayer, playerLabel } from "./util.mjs";

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
    return `<div class="pa-card">${head}${body}${this.#portalPart(pl, gm, lang)}${this.#portalList(pl, gm, lang)}${gm ? this.#gmPart(pl) : ""}</div>`;
  }

  /* ---------------- portals ---------------- */

  /** A link to another place's card, as this user may see it (plain text if they can't open it). */
  #placeLink(place, gm, lang, text = null) {
    const page = pageOfPlace(place?.id);
    const label = text ?? (gm ? placeName(place, lang) : playerLabel(place, lang));
    if (!label) return "";
    if (!page || (!gm && place.status === "hidden")) return esc(label);
    return `<a data-act="open" data-uuid="${esc(page.uuid)}">${esc(label)}</a>`;
  }

  /** What a portal is: where it stands, where it leads, its key and quirk (players: what they've been told). */
  #portalPart(pl, gm, lang) {
    const po = pl.portal;
    if (!po) return "";
    const host = po.at ? placeOfPage(pageOfPlace(po.at)) : null;
    const dest = po.to ? placeOfPage(pageOfPlace(po.to)) : null;
    const style = PORTAL_KIND_STYLE[po.kind] ?? PORTAL_KIND_STYLE.hb;
    const row = (icon, label, value) => (value ? `<li><i class="fa-solid ${icon}"></i> <span class="pa-k">${esc(label)}:</span> ${value}</li>` : "");
    if (!gm) {
      const seen = portalForPlayer(pl, dest, lang);
      if (!seen || seen.rumoured) return "";
      const hostLink = host && host.status !== "hidden" && host.status !== "rumoured" ? this.#placeLink(host, false, lang) : "";
      const destText = seen.dest ? (dest && dest.status !== "hidden" ? this.#placeLink(dest, false, lang, seen.dest) : esc(seen.dest)) : esc(t("Portal.DestUnknown"));
      return `<ul class="pa-portal">
        ${row("fa-door-open", t("Portal.StandsIn"), hostLink)}
        ${row("fa-arrow-right", t("Portal.LeadsTo"), destText)}
        ${row("fa-key", t("Portal.Key"), esc(seen.key))}
        ${seen.oneWay ? `<li><i class="fa-solid fa-arrow-right-long"></i> ${esc(t("Portal.OneWay"))}</li>` : ""}
      </ul>`;
    }
    const destText = dest ? this.#placeLink(dest, true, lang) + (dest.atlas !== pl.atlas ? ` <span class="pa-meta">(${esc(atlasName(dest.atlas))})</span>` : "")
      : (localText(po.toText, lang) ? esc(localText(po.toText, lang)) : `<span class="pa-hint">${esc(t("Portal.NoDest"))}</span>`);
    const carriers = po.keyItem ? keyCarriers(po.keyItem) : null;
    const keyLine = [localText(po.key, lang) && esc(localText(po.key, lang)), po.keyKnown ? `<span class="pa-meta">(${esc(t("Portal.PlayersKnow"))})</span>` : ""].filter(Boolean).join(" ");
    const carrierLine = carriers ? (carriers.length
      ? `<span class="pa-ok"><i class="fa-solid fa-check"></i> ${esc(carriers.map(c => `${c.name}: ${c.item}`).join(" · "))}</span>`
      : `<span class="pa-warn"><i class="fa-solid fa-xmark"></i> ${esc(t("Portal.NobodyCarries", { item: po.keyItem }))}</span>`) : "";
    return `<ul class="pa-portal" style="--pa-kind:${esc(style.color)}">
      <li class="pa-kind"><i class="fa-solid ${esc(style.icon)}"></i> ${esc(t(`Portal.Kind.${po.kind}`))}${po.oneWay ? ` · ${esc(t("Portal.OneWay"))}` : ""}</li>
      ${row("fa-door-open", t("Portal.StandsIn"), host ? this.#placeLink(host, true, lang) : "")}
      ${row("fa-arrow-right", t("Portal.LeadsTo"), destText + (po.destKnown ? "" : ` <span class="pa-meta">(${esc(t("Portal.DestSecret"))})</span>`))}
      ${row("fa-key", t("Portal.Key"), keyLine)}
      ${carrierLine ? `<li class="pa-carriers">${carrierLine}</li>` : ""}
      ${row("fa-shuffle", t("Portal.Quirk"), esc(localText(po.quirk, lang)))}
    </ul>`;
  }

  /** The portals inside this place and the ones that lead to it. */
  #portalList(pl, gm, lang) {
    const { here, to } = portalsOf(pl.id);
    const item = ({ page, place }, other) => {
      const po = place.portal;
      const style = PORTAL_KIND_STYLE[po.kind] ?? PORTAL_KIND_STYLE.hb;
      if (!gm) {
        const otherPlace = other ? placeOfPage(pageOfPlace(other)) : null;
        const seen = portalForPlayer(place, other === po.to ? otherPlace : placeOfPage(pageOfPlace(po.to)), lang);
        if (!seen) return "";
        if (seen.rumoured) return `<li class="pa-portal-row"><i class="fa-solid fa-dungeon"></i> ${esc(t("Portal.Rumoured"))}</li>`;
        const where = other === po.at
          ? (otherPlace && otherPlace.status !== "hidden" && otherPlace.status !== "rumoured" ? ` <span class="pa-meta">${esc(t("Portal.InPlace", { name: placeName(otherPlace, lang) }))}</span>` : "")
          : (seen.dest ? ` <span class="pa-meta">→ ${esc(seen.dest)}</span>` : "");
        return `<li class="pa-portal-row"><i class="fa-solid fa-dungeon"></i> <a data-act="open" data-uuid="${esc(page.uuid)}">${esc(seen.name)}</a>${where}${seen.oneWay ? ` <i class="fa-solid fa-arrow-right-long" ${tip(t("Portal.OneWay"))}></i>` : ""}</li>`;
      }
      const target = other === po.at ? placeOfPage(pageOfPlace(po.at)) : placeOfPage(pageOfPlace(po.to));
      const where = other === po.at
        ? (target ? t("Portal.InPlace", { name: placeName(target, lang) }) : "")
        : (target ? `→ ${placeName(target, lang)}${target.atlas !== pl.atlas ? ` (${atlasName(target.atlas)})` : ""}` : (localText(po.toText, lang) ? `→ ${localText(po.toText, lang)}` : ""));
      return `<li class="pa-portal-row s-${place.status}" style="--pa-kind:${esc(style.color)}">
        <i class="fa-solid fa-dungeon pa-kind-dot" ${tip(t(`Portal.Kind.${po.kind}`))}></i>
        <a data-act="open" data-uuid="${esc(page.uuid)}">${esc(placeName(place, lang))}</a>
        <span class="pa-meta">${esc(where)}</span>
        <i class="fa-solid ${STATUS_ICON[place.status]} pa-st-mini" ${tip(t(`Status.${place.status}.Name`))}></i>
      </li>`;
    };
    const hereRows = here.map(x => item(x, x.place.portal.to)).filter(Boolean).join("");
    const toRows = to.map(x => item(x, x.place.portal.at)).filter(Boolean).join("");
    if (!hereRows && !toRows) return "";
    return `<section class="pa-portals">
      ${hereRows ? `<h4><i class="fa-solid fa-dungeon"></i> ${esc(t("Portal.Here"))}</h4><ul>${hereRows}</ul>` : ""}
      ${toRows ? `<h4><i class="fa-solid fa-right-to-bracket"></i> ${esc(t("Portal.ToHere"))}</h4><ul>${toRows}</ul>` : ""}
    </section>`;
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
    const po = pl.portal;
    const inside = po?.at && !noteOfPage(this.page);
    const actions = [
      po?.to ? btn("through", "fa-dungeon", t("Portal.Through"), tip(t("Portal.ThroughHint"))) : "",
      inside ? btn("pin", "fa-map-pin", t("Portal.Pin"), tip(t("Portal.PinHint"))) : "",
      btn("move", "fa-person-walking-arrow-right", t("Card.Move")),
      btn("pan", "fa-crosshairs", "", tip(t("Card.Pan"))),
      theater ? btn("theater", "fa-masks-theater", t("Card.Theater"), tip(t("Card.TheaterHint", { name: L.theater }))) : "",
      theater ? btn("theater-off", "fa-eye-slash", "", tip(t("Card.TheaterOff"))) : "",
      scape ? btn("scape", "fa-music", t("Card.Scape"), tip(L.scape)) : "",
      battle ? btn("battle", "fa-chess-rook", t("Card.Battle"), tip(L.scene)) : "",
      L.prep ? btn("prep", "fa-book-open", t("Card.Prep"), tip(L.prep)) : "",
      price ? btn("pay", "fa-coins", t("Card.Pay", { price: coinsText(price) })) : "",
      encounterTables(atlasDef(pl.atlas), pl.area).length ? btn("encounter", "fa-dice", t("Card.Encounter"), tip(t("Card.EncounterHint"))) : "",
      btn("done", pl.done ? "fa-circle-check" : "fa-circle", t(pl.done ? "Card.Done" : "Card.MarkDone"), `${tip(t("Card.DoneHint"))} class="${pl.done ? "on" : ""}"`),
      po ? "" : btn("add-portal", "fa-dungeon", t("Portal.AddHere"), tip(t("Portal.AddHereHint")))
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
    // A portal's own fields come first (key, destination); for an ordinary place they wait at the bottom.
    const portalPart = this.#portalForm(pl, field);
    return `<form class="pa-form">
      ${field("name.el", t("Form.NameEl"), localText(pl.name, "el"))}
      ${field("name.en", t("Form.NameEn"), localText(pl.name, "en"))}
      <div class="form-group"><label>${esc(t("Form.Category"))}</label><div class="form-fields"><select name="cat">${cats}</select></div></div>
      ${pl.portal ? portalPart : ""}
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
      ${pl.portal ? "" : portalPart}
      <footer class="pa-foot"><button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${esc(t("Form.Save"))}</button>${btn("cancel", "fa-xmark", t("Form.Cancel"))}</footer>
    </form>`;
  }

  /** The portal fields of the edit form: off for an ordinary place until "This place is a portal" is ticked. */
  #portalForm(pl, field) {
    const po = pl.portal ?? {};
    const lang = language();
    const places = allPlaces().filter(p => p.id !== pl.id);
    const byAtlas = new Map();
    for (const p of places) { if (!byAtlas.has(p.atlas)) byAtlas.set(p.atlas, []); byAtlas.get(p.atlas).push(p); }
    const sorted = list => [...list].sort((a, b) => placeName(a, lang).localeCompare(placeName(b, lang), lang));
    const opt = (p, sel) => `<option value="${esc(p.id)}" ${p.id === sel ? "selected" : ""}>${esc(placeName(p, lang))}${p.portal ? " ◈" : ""}</option>`;
    // Inside: a place on the same atlas that isn't itself inside another one.
    const atOpts = sorted((byAtlas.get(pl.atlas) ?? []).filter(p => !p.portal?.at)).map(p => opt(p, po.at)).join("");
    const toOpts = [...byAtlas.entries()].map(([a, list]) => `<optgroup label="${esc(atlasName(a))}">${sorted(list).map(p => opt(p, po.to)).join("")}</optgroup>`).join("");
    const kinds = PORTAL_KINDS.map(k => `<option value="${k}" ${k === (po.kind ?? "hb") ? "selected" : ""}>${esc(t(`Portal.Kind.${k}`))}</option>`).join("");
    const check = (name, label, on, hint = "") => `<div class="form-group"><label>${esc(label)}</label><div class="form-fields"><input type="checkbox" name="${name}" ${on ? "checked" : ""}></div>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
    return `<fieldset class="pa-portal-form"><legend><i class="fa-solid fa-dungeon"></i> ${esc(t("Portal.Legend"))}</legend>
      ${check("portal.on", t("Portal.IsPortal"), !!pl.portal, t("Portal.IsPortalHint"))}
      <div class="form-group"><label>${esc(t("Portal.KindLabel"))}</label><div class="form-fields"><select name="portal.kind">${kinds}</select></div></div>
      <div class="form-group"><label>${esc(t("Portal.StandsIn"))}</label><div class="form-fields"><select name="portal.at"><option value="">${esc(t("Portal.OnItsOwn"))}</option>${atOpts}</select></div>
        <p class="hint">${esc(t("Portal.StandsInHint"))}</p></div>
      <div class="form-group"><label>${esc(t("Portal.LeadsTo"))}</label><div class="form-fields"><select name="portal.to"><option value="">${esc(t("Portal.Elsewhere"))}</option>${toOpts}</select></div></div>
      ${field("portal.toText", t("Portal.ToText"), localText(po.toText, "el"), { hint: t("Portal.ToTextHint") })}
      ${field("portal.key", t("Portal.Key"), localText(po.key, "el"))}
      ${field("portal.keyItem", t("Portal.KeyItem"), po.keyItem ?? "", { hint: t("Portal.KeyItemHint") })}
      ${field("portal.quirk", t("Portal.Quirk"), localText(po.quirk, "el"), { hint: t("Portal.QuirkHint") })}
      ${check("portal.oneWay", t("Portal.OneWay"), !!po.oneWay)}
      ${check("portal.destKnown", t("Portal.DestKnown"), po.destKnown !== false, t("Portal.DestKnownHint"))}
      ${check("portal.keyKnown", t("Portal.KeyKnown"), !!po.keyKnown)}
    </fieldset>`;
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
    const on = name => !!form.elements[name]?.checked;
    if (on("portal.on")) {
      const old = pl.portal ?? {};
      const withEl = (value, el) => ({ ...(typeof value === "object" && value ? value : { en: typeof value === "string" ? value : "" }), el });
      patch.portal = {
        kind: v("portal.kind") || "hb", at: v("portal.at"), to: v("portal.to"),
        toText: withEl(old.toText, v("portal.toText")), key: withEl(old.key, v("portal.key")), keyItem: v("portal.keyItem"),
        quirk: withEl(old.quirk, v("portal.quirk")),
        oneWay: on("portal.oneWay"), destKnown: on("portal.destKnown"), keyKnown: on("portal.keyKnown")
      };
      // A place that holds portals can't stand inside another one (portals nest one level deep).
      if (patch.portal.at && portalsOf(pl.id).here.length) {
        warn("Portal.HostCantBeInside", { name: placeName(pl) });
        patch.portal.at = "";
      }
      // A new portal takes the portal pin (an ordinary category stays if the GM picked one on purpose).
      if (!pl.portal && patch.cat === pl.cat && pl.cat === "landmark") patch.cat = "portal";
    } else patch.portal = null;
    const saved = await savePlace(page, patch);
    // Taken out of the place it stood in (or no longer a portal): it needs a pin of its own.
    if (saved && !saved.portal?.at && !noteOfPage(page)) await pinPortal(page);
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
        case "open": {
          const other = (foundry.utils.fromUuidSync ?? globalThis.fromUuidSync)(el.dataset.uuid);
          if (other) PlaceCard.show(other);
          break;
        }
        case "through": await travelThrough(page); break;
        case "pin": await pinPortal(page); this.render(); break;
        case "add-portal": {
          const made = await createPortal({ at: pl.id });
          if (made) PlaceCard.show(made, { edit: true });
          break;
        }
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
