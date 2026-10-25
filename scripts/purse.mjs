// The common purse: the coins are the Company actor's own dnd5e currency (so /award party and the group sheet
// work as usual); this module keeps the history: who put in or took out how much, why, in which session.
// Every change goes through the active GM, so two players paying at once can't overwrite each other.
// Coins changed anywhere else (the sheet, an award) are noticed and written down too.
import { MODULE_ID, EVENT, PURSE_LOG_MAX, REPLY_TIMEOUT_MS } from "./constants.mjs";
import { t, info, warn } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import { company, isActiveGM, serial, road } from "./state.mjs";
import { cleanCoins, addCoins, spendCoins, diffCoins, negCoins, isZero, coinsText, COINS } from "./util.mjs";

const pendingReplies = new Map();
const snapshot = new Map(); // actor id -> coins the GM last saw

export const purse = (actor = company()) => cleanCoins(actor?.system?.currency);
export const purseLog = (actor = company()) => {
  const l = actor?.getFlag?.(MODULE_ID, "purseLog");
  return Array.isArray(l) ? l : [];
};

/** Who did it, for the history (the user's character if they have one). */
function whoName(userId) {
  const u = game.users.get(userId);
  return u?.character?.name ?? u?.name ?? "?";
}

/* ---------------- GM side ---------------- */

/** Apply a change (GM): dir "in" adds, "out" pays (making change). Returns { ok, error?, purse? }. */
export function applyChange({ coins, dir, why = "", userId = game.user.id }) {
  return serial(async () => {
    const actor = company();
    if (!actor) return { ok: false, error: "NoCompany" };
    const amount = cleanCoins(coins);
    if (isZero(amount)) return { ok: false, error: "NoAmount" };
    const before = purse(actor);
    const after = dir === "out" ? spendCoins(before, amount) : addCoins(before, amount);
    if (!after) return { ok: false, error: "TooPoor", have: coinsText(before) };
    snapshot.set(actor.id, cleanCoins(after));
    const entry = {
      id: foundry.utils.randomID(), date: new Date().toISOString(), session: road().next.session ?? "",
      who: whoName(userId), user: userId, delta: dir === "out" ? negCoins(amount) : amount, why: String(why ?? "").slice(0, 200)
    };
    const log = [...purseLog(actor), entry].slice(-PURSE_LOG_MAX);
    await actor.update({ "system.currency": after, [`flags.${MODULE_ID}.purseLog`]: log }, { planarAtlasPurse: true });
    return { ok: true, purse: after, entry };
  });
}

/** Undo one line of the history (GM): the opposite change, written as its own line. */
export async function undoEntry(id) {
  if (!game.user.isGM) return null;
  const actor = company();
  const entry = purseLog(actor).find(e => e.id === id);
  if (!entry || entry.undone) return null;
  const back = negCoins(entry.delta);
  const pos = cleanCoins(Object.fromEntries(COINS.map(k => [k, Math.max(0, back[k])])));
  const neg = cleanCoins(Object.fromEntries(COINS.map(k => [k, Math.max(0, -back[k])])));
  let res = { ok: true };
  if (!isZero(pos)) res = await applyChange({ coins: pos, dir: "in", why: t("Purse.UndoOf", { why: entry.why || coinsText(entry.delta, { signed: true }) }) });
  if (res.ok && !isZero(neg)) res = await applyChange({ coins: neg, dir: "out", why: t("Purse.UndoOf", { why: entry.why || coinsText(entry.delta, { signed: true }) }) });
  if (!res.ok) return warn(`Purse.Error.${res.error}`, { have: res.have ?? "" });
  const log = purseLog(company()).map(e => (e.id === id ? { ...e, undone: true } : e));
  await company().setFlag(MODULE_ID, "purseLog", log);
  return true;
}

/** updateActor (active GM): coins changed somewhere else (the sheet, /award) → a line in the history. */
export async function onActorUpdated(actor, changed, options, userId) {
  if (!isActiveGM() || actor?.id !== company()?.id || options?.planarAtlasPurse) return;
  if (!foundry.utils.hasProperty(changed ?? {}, "system.currency")) return;
  const before = snapshot.get(actor.id);
  const now = purse(actor);
  snapshot.set(actor.id, now);
  if (!before) return;
  const delta = diffCoins(before, now);
  if (isZero(delta)) return;
  await serial(async () => {
    const entry = {
      id: foundry.utils.randomID(), date: new Date().toISOString(), session: road().next.session ?? "",
      who: whoName(userId), user: userId, delta, why: t("Purse.SheetChange")
    };
    await actor.setFlag(MODULE_ID, "purseLog", [...purseLog(actor), entry].slice(-PURSE_LOG_MAX));
  });
}

/** Remember the coins the GM starts from (ready, and when the Company changes). */
export function rememberPurse() {
  const actor = company();
  if (actor) snapshot.set(actor.id, purse(actor));
}

/* ---------------- anyone ---------------- */

/** Put coins in or pay out of the purse. The GM applies it directly; a player asks the GM. */
export async function change({ coins, dir, why }) {
  if (!company()) return warn("Notify.NoCompany");
  if (game.user.isGM) {
    const res = await applyChange({ coins, dir, why });
    if (!res.ok) warn(`Purse.Error.${res.error}`, { have: res.have ?? "" });
    return res;
  }
  if (!setting("purseForPlayers")) return warn("Purse.Error.PlayersOff");
  if (!game.users.activeGM) return warn("Purse.Error.NoGM");
  const id = foundry.utils.randomID();
  const reply = new Promise(resolve => {
    const timer = setTimeout(() => { pendingReplies.delete(id); resolve({ ok: false, error: "NoReply" }); }, REPLY_TIMEOUT_MS);
    pendingReplies.set(id, res => { clearTimeout(timer); pendingReplies.delete(id); resolve(res); });
  });
  game.socket.emit(EVENT, { op: "purse", id, from: game.user.id, coins: cleanCoins(coins), dir: dir === "out" ? "out" : "in", why: String(why ?? "") });
  const res = await reply;
  if (!res.ok) warn(`Purse.Error.${res.error}`, { have: res.have ?? "" });
  else info("Purse.Done");
  return res;
}

/* ---------------- socket ---------------- */

export async function onMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  try {
    if (msg.op === "purse" && isActiveGM()) {
      const user = game.users.get(msg.from);
      if (!user) return;
      const res = setting("purseForPlayers") || user.isGM
        ? await applyChange({ coins: msg.coins, dir: msg.dir, why: msg.why, userId: msg.from })
        : { ok: false, error: "PlayersOff" };
      game.socket.emit(EVENT, { op: "purse-reply", id: msg.id, to: msg.from, from: game.user.id, res: { ok: res.ok, error: res.error, have: res.have } });
    } else if (msg.op === "purse-reply" && msg.to === game.user.id && game.users.get(msg.from)?.isGM) {
      pendingReplies.get(msg.id)?.(msg.res ?? { ok: false });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | socket ${msg.op}`, err);
  }
}

export function registerSocket() {
  game.socket.on(EVENT, onMessage);
}
