// The in-world clock. By default it is Foundry's own world time (game.time.worldTime), so anything else that
// counts time (dnd5e effect durations, a calendar module) moves with it; the module only keeps an "epoch":
// the world time at which day 1 began. Setting the clock ("it is day 3, 10:00") moves the epoch, never
// Foundry's time. Travel advances the clock; undoing a trip takes the time back.
import { t, local } from "./i18n.mjs";
import { setting, setSetting } from "./settings.mjs";
import { defs } from "./state.mjs";
import { clockParts, hhmm, bandAt, epochFor, durationParts } from "./util.mjs";

const linked = () => setting("useWorldTime") !== false;

/** The clock now, in seconds. */
export function now() {
  return linked() ? Number(game.time?.worldTime ?? 0) : Number(setting("clockSeconds") ?? 0);
}

export const epoch = () => Number(setting("clockEpoch") ?? 0);

/** { day, hour, minute, secondsOfDay, time: "14:20", band: "ζενίθ" } for a clock value (default: now). */
export function read(seconds = now()) {
  const p = clockParts(seconds, epoch());
  const band = bandAt(defs().calendar?.bands, p.secondsOfDay);
  return { ...p, time: hhmm(p), band: band ? local(band.name) : "" };
}

/** "Day 3 · 14:20 · peak" */
export function label(seconds = now()) {
  const c = read(seconds);
  return [t("Clock.Day", { day: c.day }), c.time, c.band].filter(Boolean).join(" · ");
}

/** "3 h 20 min" in this user's language. */
export function duration(seconds) {
  const { days, hours, minutes } = durationParts(seconds);
  const parts = [];
  if (days) parts.push(t(days === 1 ? "Clock.OneDay" : "Clock.Days", { n: days }));
  if (hours) parts.push(t("Clock.Hours", { n: hours }));
  if (minutes) parts.push(t("Clock.Minutes", { n: minutes }));
  return parts.join(" ") || t("Clock.Minutes", { n: 0 });
}

/** Move the clock (GM). Negative takes time back. */
export async function advance(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (!s || !game.user.isGM) return now();
  if (linked()) await game.time.advance(s);
  else await setSetting("clockSeconds", Math.max(0, now() + s));
  return now();
}

/** "It is day `day`, at `timeOfDay` seconds": moves the epoch, not the clock. */
export async function setTo(day, timeOfDay) {
  if (!game.user.isGM) return;
  await setSetting("clockEpoch", epochFor(now(), day, timeOfDay));
}

/** Hooks that mean "the clock changed". */
export function onClockChange(fn) {
  Hooks.on("updateWorldTime", () => fn());
}

export const isLinked = linked;
