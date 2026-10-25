// Journal pages, so what the module tracks reaches the vault: the road (GM), the purse (players can read)
// and the party's notes (players can write). Planar Codex notes when the Codex is installed (they export to
// the vault), otherwise ordinary Markdown pages in the "Planar Atlas" folder.
import { MODULE_ID, FOLDER } from "./constants.mjs";
import { t, local } from "./i18n.mjs";
import { setting, setSetting } from "./settings.mjs";
import { road, defs, company, isActiveGM, serial, onRoadWrite } from "./state.mjs";
import { roadMarkdown, purseMarkdown } from "./util.mjs";
import { stopName, howName } from "./road.mjs";
import { atlasName } from "./atlas.mjs";
import { purse, purseLog } from "./purse.mjs";

const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;
const codexApi = () => { const m = game.modules.get("planar-codex"); return m?.active ? m.api : null; };

function toHTML(md, { gm }) {
  const api = codexApi();
  if (api?.convert) return api.convert(md, { gm }).html;
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, "");
  const conv = globalThis.showdown ? new globalThis.showdown.Converter({ tables: true }) : null;
  return conv ? conv.makeHtml(body) : `<pre>${foundry.utils.escapeHTML?.(body) ?? body}</pre>`;
}

/** The name of one of our pages: the pack's (Greek for our table), else the interface's. */
const nameOf = key => local(defs().pages?.[key]) || t(`Page.${key}.Title`);

async function pageByKey(key) {
  const uuid = setting("pages")?.[key];
  const from = foundry.utils.fromUuid ?? globalThis.fromUuid;
  return uuid ? from(uuid).catch(() => null) : null;
}

/** Create a page (Codex note when possible) with an ownership for everyone else. */
async function createPage(key, md, defaultOwnership, { gm }) {
  const api = codexApi();
  const name = nameOf(key);
  let page;
  if (api?.createCodexNote) {
    page = await api.createCodexNote({ name, markdown: md });
    if (page && defaultOwnership !== OWN().NONE) await page.parent.update({ ownership: { default: defaultOwnership } });
  } else {
    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === FOLDER);
    folder ??= await getDocumentClass("Folder").create({ name: FOLDER, type: "JournalEntry" });
    const entry = await getDocumentClass("JournalEntry").create({
      name, folder: folder.id, ownership: { default: defaultOwnership },
      pages: [{ name, type: "text", text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN, markdown: md, content: toHTML(md, { gm }) } }]
    });
    page = entry.pages.contents[0];
  }
  if (page?.uuid) await setSetting("pages", { ...(setting("pages") ?? {}), [key]: page.uuid });
  return page;
}

async function writePage(key, md, defaultOwnership, { gm }) {
  const page = await pageByKey(key);
  if (page) {
    if (page.text?.markdown === md) return page;
    await page.update({ "text.markdown": md, "text.content": toHTML(md, { gm }) });
    return page;
  }
  return createPage(key, md, defaultOwnership, { gm });
}

/* ---------------- the road ---------------- */

export function roadMarkdownNow() {
  const cols = Object.fromEntries(["n", "session", "day", "place", "how", "cost", "note"].map(c => [c, t(`Page.road.Col.${c}`)]));
  return roadMarkdown(road(), {
    title: nameOf("road"), intro: t("Page.road.Intro"), none: t("Page.road.None"),
    active: t("Page.road.Active"), archived: t("Page.road.Archived"), cols
  }, { place: stopName, how: howName, atlas: atlasName });
}
export const syncRoadPage = () => writePage("road", roadMarkdownNow(), OWN().NONE, { gm: true });

/* ---------------- the purse ---------------- */

export function purseMarkdownNow() {
  const cols = Object.fromEntries(["when", "session", "who", "amount", "why"].map(c => [c, t(`Page.purse.Col.${c}`)]));
  return purseMarkdown(purse(), purseLog(), {
    title: nameOf("purse"), intro: t("Page.purse.Intro"), now: t("Page.purse.Now"), none: t("Page.purse.None"), cols
  });
}
export const syncPursePage = () => (company() ? writePage("purse", purseMarkdownNow(), OWN().OBSERVER, { gm: false }) : null);

/* ---------------- the party's notes ---------------- */

/** The notes page (players own it). Made once, never overwritten. */
export async function notesPage({ create = false } = {}) {
  const found = await pageByKey("notes");
  if (found || !create || !game.user.isGM) return found;
  const md = `---\ntype: notes\ntags: [party]\nvisibility: players\n---\n# ${nameOf("notes")}\n\n${t("Page.notes.Starter")}\n`;
  return createPage("notes", md, OWN().OWNER, { gm: false });
}

/** Open the notes for writing (players too: they own it). */
export async function openNotes() {
  const page = await notesPage({ create: game.user.isGM });
  if (!page) return ui.notifications.warn(t("Notify.NoNotes"));
  page.parent.sheet.render(true, { pageId: page.id });
  return page;
}

/* ---------------- keeping them in step ---------------- */

let roadTimer = null, purseTimer = null;
const later = (fn, ms) => setTimeout(() => serial(fn).catch(err => console.warn(`${MODULE_ID} | page`, err)), ms);

export function scheduleRoadPage() {
  if (!isActiveGM()) return;
  clearTimeout(roadTimer);
  roadTimer = later(syncRoadPage, 2000);
}
export function schedulePursePage() {
  if (!isActiveGM()) return;
  clearTimeout(purseTimer);
  purseTimer = later(syncPursePage, 2000);
}

export function wirePages() {
  onRoadWrite(scheduleRoadPage);
}
