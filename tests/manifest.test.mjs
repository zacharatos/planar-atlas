import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { MODULE_ID } from "../scripts/constants.mjs";

const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const file = p => new URL(`../${p}`, import.meta.url);

test("manifest has the fields Foundry requires", () => {
  for (const k of ["id", "title", "description", "version", "compatibility"]) assert.ok(manifest[k], k);
  assert.match(manifest.id, /^[a-z0-9-]+$/);
  assert.equal(manifest.id, MODULE_ID, "constants.mjs and module.json must agree");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.compatibility.minimum && manifest.compatibility.verified);
});

test("socket is enabled (purse requests need it)", () => {
  assert.equal(manifest.socket, true);
});

test("every referenced file exists", () => {
  for (const p of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(l => l.path)]) {
    assert.ok(existsSync(file(p)), p);
  }
});

const flatten = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) =>
  v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
const langs = Object.fromEntries(manifest.languages.map(l => [l.lang, JSON.parse(readFileSync(file(l.path), "utf8"))]));

test("all languages define exactly the same keys as English", () => {
  const en = flatten(langs.en).sort();
  for (const [code, data] of Object.entries(langs)) {
    assert.deepEqual(flatten(data).sort(), en, `${code} differs from en`);
  }
});

test("placeholders match between languages", () => {
  const get = (o, path) => path.split(".").reduce((x, k) => x[k], o);
  const holders = s => (s.match(/\{\w+\}/g) ?? []).sort().join();
  for (const key of flatten(langs.en)) {
    for (const [code, data] of Object.entries(langs)) {
      assert.equal(holders(get(data, key)), holders(get(langs.en, key)), `${code}: ${key}`);
    }
  }
});

test("every localization key used in the code exists", () => {
  const known = new Set(flatten(langs.en).map(k => k.replace(/^PLANAR_ATLAS\./, "")));
  const sources = readdirSync(new URL("../scripts/", import.meta.url)).filter(n => n.endsWith(".mjs"))
    .map(n => readFileSync(file(`scripts/${n}`), "utf8")).join("\n");
  // t("Key"), warn("Key"), info("Key"), t(`Bar.${...}`) are checked by prefix
  const used = [...sources.matchAll(/\b(?:t|warn|info)\(\s*"([\w.]+)"/g)].map(m => m[1]);
  for (const key of used) assert.ok(known.has(key), `missing key ${key}`);
  const raw = [...sources.matchAll(/"PLANAR_ATLAS\.([\w.]+)"/g)].map(m => m[1]);
  for (const key of raw) assert.ok(known.has(key), `missing key ${key}`);
});

test("dynamic keys used with a variable exist for every value", () => {
  const known = new Set(flatten(langs.en).map(k => k.replace(/^PLANAR_ATLAS\./, "")));
  const groups = {
    "Status.{s}.Name": ["hidden", "rumoured", "known", "visited"], "Status.{s}.Hint": ["hidden", "rumoured", "known", "visited"],
    "Party.Tab.{s}": ["road", "purse", "notes"], "Console.Tab.{s}": ["setup", "places"],
    "Enricher.{s}": ["open", "move", "reveal", "rumour", "hide", "set", "pay"],
    "Page.{s}.Title": ["road", "purse", "notes"],
    "Page.road.Col.{s}": ["n", "session", "day", "place", "how", "cost", "note"],
    "Page.purse.Col.{s}": ["when", "session", "who", "amount", "why"],
    "Purse.Error.{s}": ["NoCompany", "NoAmount", "TooPoor", "PlayersOff", "NoGM", "NoReply"],
    "Settings.{s}.Name": ["imageBase", "lockCompany", "snapRadius", "purseForPlayers", "playerButton", "textLanguage", "language", "showLabels"]
  };
  for (const [pattern, values] of Object.entries(groups)) {
    for (const v of values) assert.ok(known.has(pattern.replace("{s}", v)), `missing key ${pattern.replace("{s}", v)}`);
  }
});
