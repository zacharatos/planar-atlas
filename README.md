# Planar Atlas

Living campaign maps for **Foundry VTT v14** and the **dnd5e** system: a big map becomes an atlas with places, notes and the road your party has travelled, and the party gets a window of its own with that road, a common purse and shared notes.

<!-- Screenshot: docs/images/atlas.webp (to add after the first table test) -->

## Features

- **Atlas scenes.** Any scene can be the map of an atlas, or one click makes a new scene at the map image's own size (no grid, vision or fog).
- **Places as pins**, each with a **card**: a picture, what the players know, when they were there; for the GM also the secrets, the book reference and buttons. Places are ordinary map notes, so you drag, move and delete them as usual.
- **Players only see what they know.** Each place is *hidden* (no pin for them), *rumoured* (a "?" pin and the rumour text), *known* or *visited*. Change one by one, or reveal a **whole set** at once ("everything the guide told them").
- **The party's road.** The party is a dnd5e **group actor** with a token you drag on the atlas: every drop is a **stop**, snapped to the nearest place, stamped with the session, the in-world day and time and how they travelled. The road is drawn on the map with numbered stops, one shade per session (older sessions fainter) and a pulse where the party stands. It stays until you **archive** it (a new journey starts where the party stands) or clear it. **Undo** takes back the last stop and moves the token back.
- **Maps that wrap around.** A pack can split a map into zones whose edges join (a ring city drawn as two strips): the road goes off one edge and comes back in at the other, with arrows, instead of cutting across the poster.
- **Area labels** (wards, regions) drawn on the map.
- **Only the GM moves the party** on an atlas, even though the players own the party actor.
- **The party window** for everyone (toolbar button, or Alt+P):
  - **Road**: every stop by session; the GM sets what the next stop is stamped with, and edits notes on stops.
  - **Purse**: the party actor's own dnd5e coins, with **a history of every change** (who, how much, why, which session). Players put coins in and pay, with change made for them; the change goes through the GM's Foundry, so two players paying at once can't overwrite each other. Coins changed on the sheet or by `/award` are written down too. The GM can undo any line.
  - **Notes**: a journal page the whole party can write in.
- **Place cards do things** (GM): move the party there, show the place on the map, show its **Planar Theater** place over the map, start its **Planar Soundboard** soundscape, switch everyone to its battle map, open its prep note, **pay its price** from the purse.
- **Journal buttons** for prep notes (GM only; players see plain text):
  - `@Atlas[The Salty Lantern]` the place's card
  - `@Atlas[The Salty Lantern | move]{Go there}` move the party there
  - `@Atlas[reveal: Temple of the Closed Door]`, `@Atlas[rumour: …]`, `@Atlas[hide: …]`
  - `@Atlas[set: guide]{The guide talks}` reveal a whole set
  - `@Atlas[pay: 5sp | a room for the night]` pay from the party's purse
- **Journal pages** for your records: the road (GM), the purse (players can read), the party's notes (players can write). With **Planar Codex** they are Codex notes and export to your vault.
- **Campaign packs.** Maps, places, texts, categories, ways of travelling and reveal sets come from a JSON pack you import. **Save pack** writes the places back with the positions you dragged them to, so the pack stays your source of truth.
- English and Greek, switchable per user (the EN/ΕΛ button) without changing Foundry's language.

The module ships no maps, art or publisher content. `data/example-pack.json` is a small made-up example.

## Install

In Foundry: **Add-on Modules → Install Module**, paste this manifest URL, then enable *Planar Atlas* in your world:

```
https://github.com/zacharatos/planar-atlas/releases/latest/download/module.json
```

## Setting up

1. **Import a pack** in the console (map-and-pin button in the token controls, GM only). Start from `data/example-pack.json` to see the shape.
2. **Create the party actor** (Setup tab): a dnd5e group with every player character as a member, owned by all players, set as the primary party.
3. For each atlas: **Create scene** (pick the map image) or open a scene you made and **use it for this atlas** (link button). Then **Set up places**: every place in the pack gets a page and a pin. Places without a position wait in a row at the bottom of the map: drag them where they belong, then **Save pack** to keep the positions.
4. **Party token here** puts the party on the atlas. Drag it to travel.

## At the table

- Before moving, set the **session** label (e.g. `S03`), the in-world **day** and **time**, and **how** they travel in the party window's Road tab. They are stamped on every stop until you change them.
- Drag the party token. Near a place, it snaps there, the place becomes *visited* and its card is a click away.
- Double-click any pin for its card. Players get the player view of the same card.
- Pull the players to the atlas like any scene, or leave them on a battle map and let them open the party window.

## Pack format (schema 1)

```json
{
  "schema": 1, "id": "my-campaign", "name": { "en": "…", "el": "…" },
  "company": { "name": { "en": "The Company" }, "img": "path/to/party-token.webp" },
  "pages": { "road": { "en": "…" }, "purse": { "en": "…" }, "notes": { "en": "…" } },
  "categories": { "tavern": { "name": { "en": "Tavern" }, "icon": "icons/svg/tankard.svg", "color": "#f0b46a" } },
  "hows": { "foot": { "name": { "en": "On foot" }, "icon": "fa-person-walking" } },
  "times": [{ "en": "morning" }],
  "sets": { "guide": { "name": { "en": "What the guide knows" }, "status": "known" } },
  "atlases": [{
    "id": "city", "name": { "en": "The City" }, "map": "city.webp", "clock": "hours",
    "zones": [{ "id": "north", "x0": 0, "y0": 0, "x1": 1, "y1": 0.49 }],
    "links": [{ "a": { "zone": "north", "edge": "right" }, "b": { "zone": "south", "edge": "left" } }],
    "areas": [{ "id": "docks", "name": { "en": "The Docks" }, "x": 0.2, "y": 0.2, "size": 9 }]
  }],
  "places": [{
    "id": "tavern", "atlas": "city", "cat": "tavern", "status": "known", "area": "docks",
    "name": { "en": "…", "el": "…" }, "text": { "en": "…" }, "rumour": { "en": "…" },
    "gm": "secrets", "ref": "book reference", "img": "relative/or/full/path.webp", "price": "5sp",
    "x": 0.18, "y": 0.28, "sets": ["guide"],
    "links": { "theater": "Theater place name", "theaterScene": "", "scape": "Soundboard scape", "scene": "Battle map scene", "prep": "Note name#Heading", "faction": "faction-id" }
  }]
}
```

A reveal set raises its places to its `status` (`known` by default, or `rumoured`), never lowers one. Positions are fractions of the map (0 to 1), so a pack works with any size of the same image. `x`/`y` `null` means "not placed yet". Text fields can be a string or `{ "en": …, "el": … }`. Built-in categories: landmark, tavern, temple, shop, faction, portal, danger, home, town, wild, hb. Relative picture paths are read from the *Image folder* setting.

## Settings

- **Image folder**: where relative picture paths in the pack live.
- **Only the GM moves the party marker** (on by default).
- **Snap distance**: how close to a place a dropped party token snaps to it.
- **Players use the common purse** (on by default).
- **Party button for players** (on by default).
- **Default language**, and each user's own **language** for the module.
- **Area names on the atlas** (per user).

## Macro API

`game.modules.get("planar-atlas").api`:

| Function | What it does |
|---|---|
| `open()`, `openConsole()`, `openParty({tab})` | the windows |
| `places(atlasId)`, `findPlace(name)`, `showCard(name)` | places |
| `setStatus(name, "hidden"\|"rumoured"\|"known"\|"visited")`, `revealSet(id)` | what the players know |
| `move(name)`, `undo()`, `archive(name)`, `setNext({session, day, time, how})`, `road()` | the road |
| `pay("3gp", why, "out"\|"in")`, `purse()`, `purseLog()` | the purse |
| `company()`, `createCompany()`, `placeCompany(scene)` | the party actor |
| `setupPlaces(atlasId)`, `exportPack()`, `defs()`, `syncPages()`, `redraw()` | setup |

## Development

`docs/DEVELOPMENT.md` has the file map, the checks and the manual test checklist; `docs/PUBLISHING.md` the release steps.

## License

MIT. See `LICENSE`.
