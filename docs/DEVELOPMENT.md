# Development

## Layout

```
module.json            manifest (id = planar-atlas; the id is permanent once published)
scripts/
  main.mjs             hooks: init, ready, toolbar, canvas, notes, tokens, pages, actor; the macro API
  constants.mjs        ids, sizes, built-in categories and ways of travelling, session colours
  settings.mjs         world settings (hidden data + options) and the per-user language
  i18n.mjs             the module's own EN/EL dictionaries, per-user language
  state.mjs            the road, the pack, the definitions, the party actor; serial() write queue (active GM only)
  atlas.mjs            atlas scenes: bind a scene, create one from a map image, map rectangle, 0–1 coordinates
  places.mjs           places: atlas journal, one page + one map note per place, set up from the pack, status,
                       reveal sets, new/delete, pack export, note styling per user, notes toggle on atlases
  card.mjs             the place card (ApplicationV2): player and GM views, edit form, actions
  road.mjs             the party actor and its token, recording stops on drop (snap), player lock, move to a
                       place, undo / archive / clear
  trail.mjs            the road drawn on the canvas (PIXI, in the interface group), area labels, the pulse
  purse.mjs            the common purse: changes through the active GM (socket), history, undo, outside changes
  party.mjs            the party window (ApplicationV2): Road, Purse, Notes
  console.mjs          the GM console (ApplicationV2): Setup, Places
  page.mjs             journal pages: road (GM), purse (players read), notes (players write); Codex notes if present
  enrich.mjs           @Atlas[…] journal buttons
  util.mjs             pure helpers (no Foundry globals), all unit-tested: coordinates, wrap-around routes,
                       coins (parse, pay with change), road edits, pack validation/export, Markdown pages
styles/atlas.css       window styles, scoped to .planar-atlas; styles/icons/ (portal, party)
lang/en.json el.json   interface strings (keys under PLANAR_ATLAS.*)
data/example-pack.json a small made-up pack (shipped; validated by the tests)
tests/                 node:test unit tests, manifest and language checks, a link test of main.mjs
tools/                 stamp-manifest, package, release-api, check-syntax
.github/workflows/     ci.yml, release.yml
```

There is no build step: Foundry loads `scripts/main.mjs` directly.

## How it fits together

- **Places** are `Note` documents on the atlas scene. Each note points to its own `JournalEntryPage` in a GM-only journal entry per atlas (flag `atlas`). The page's `flags.planar-atlas.place` holds the place (`placeData` in `util.mjs`); its ownership follows the status: *hidden* = none, anything else = Observer. Players need Observer, not just Limited: Foundry shows a note to Limited, but won't let them double-click a text page they can only see as Limited, so no card would open. GM secrets live only in the flag, never in the page text.
- **What a player sees on a pin** is drawn per user in `refreshNote` (`styleNote`): "?" for a rumour, the name otherwise. Players' "show map notes" toggle is switched on when they view an atlas and back off when they leave (`syncNotesToggle`).
- **The road** is one hidden world setting: `{schema, active, journeys: [{id, name, archived, stops: [...]}], next: {session, day, time, how}, hidden: {players, all}}`. A stop: `{id, date, atlas, scene, place|null, label, x, y (0–1), session, day, time, how, note, cost, heroes}`. Only the active GM writes it, through `mutateRoad` (one write at a time); every client redraws on the setting's `onChange`.
- **Recording:** `updateToken` on the active GM's client. A move of the party token on an atlas (not flagged `planarAtlasSkip`) becomes a stop; if a place is within *Snap distance*, the token is moved onto it (flagged, so it isn't recorded twice) and the place becomes visited.
- **The purse** is the party actor's `system.currency`. History: `flags.planar-atlas.purseLog` on the actor. Players send `{op: "purse"}` over the module socket; the active GM applies it (`spendCoins` makes change) and answers `{op: "purse-reply"}`. A currency change not made by us (sheet, `/award`) is diffed against the GM's last snapshot and logged.
- **Pages** are rewritten 2 s after a change (road, purse); the notes page is made once and never overwritten.
- **Coordinates** are stored as fractions of the map rectangle (`scene.dimensions` without padding), so packs survive a bigger image.

## Run the checks

```
npm test
```

A syntax check on every `.mjs` file and the tests: pure helpers, manifest and language parity (every key used in code exists in both languages, placeholders match, dynamic keys exist for every value), and a link test that imports `main.mjs` against stubbed Foundry globals.

These tests do not start Foundry. Anything touching notes, tokens, the canvas, sockets or file pickers is tried by hand (below).

## Try it in Foundry

Put (or symlink) the repo into your user data as `Data/modules/planar-atlas/` and restart the world. Reload the browser (F5) after each change.

### Manual test checklist

Two browsers: the GM and a player who owns a character. dnd5e 6.x.

**Setup**
- Console (map button in token controls) → **Import pack** with `data/example-pack.json`: "1 atlases, 3 places". A broken JSON file and a pack with a duplicate id are refused with a message.
- **Create the party actor**: a group actor (type party) appears with every player character as a member; every player is its owner; dnd5e's primary party is set (check the setting, or the group sheet). With a hero added later, **Add the heroes** adds them.
- **Create scene** for "The Ring City", pick any big image: a scene at the image's size, no grid, the map visible (on v14 the background is on the scene's Level). Or open an existing scene and use the link button.
- **Set up places**: "3 new places … 3 pins (1 parked)". The parked one sits at the bottom-left; drag it: the ⓟ in the Places tab disappears. Run **Set up places** again: nothing new; edit a text in the pack, import, run again: "1 refreshed", the status you changed in the world is kept.

**What players see**
- The player on the atlas: sees the tavern pin (known) with its name, not the temple (hidden) or the arch. The GM sees all three; hidden ones faded with ⦸.
- Set the temple to **Rumoured**: the player sees a "?" pin; double-click → a card "Somewhere you've heard about" with the rumour text and no picture. **Known**: the name and the text. No reload needed on the player's side.
- The player double-clicks the tavern: the card opens (not the journal page). The GM's card has statuses, secrets, actions, Edit; the player's has none of those.
- **Reveal set** "What the guide knows": the temple becomes known.
- Leave the atlas for a battle map as the player: their own "show map notes" choice is back as it was.

**The road**
- **Party token here** on the atlas. In the party window (Alt+P) Road tab set Session `S03`, Day `1`, Time, How.
- Drag the token next to the tavern: it snaps onto the pin, "Stop 1: The Salty Lantern", the tavern becomes *visited*. Drag it to an empty spot: "Stop 2: Somewhere on the map". The road appears: dashed, numbered, with a pulse at the last stop; the player sees it too.
- Drag from the top half to the bottom half near the left/right edges: the road leaves at one edge with an arrow and comes back at the other.
- Change Session to `S04`, move twice: the S03 part of the road is fainter.
- **Undo**: the last stop goes and the token moves back. **Hide from players**: the player's map and window lose the road; the GM still sees it. **Hide on the map**: nobody sees it on the map.
- As the player, try to drag the party token on the atlas: "Only the GM moves the party". On a battle map their own hero moves normally.
- **Archive** with a name: the list empties except one stop (where the party stands); the archived journey is listed. **Clear** asks first.
- A stop's note typed in the Road tab shows for the player.
- Card → **Move the party here**: the token goes there and the stop is recorded.

**The purse**
- Purse tab as the player: put in `10gp` "loot": the coins update on both screens, a history line with the player's character name. Pay `3 χρυσά` "Parisa": 7 gp left. Pay `5sp` with only gold: one gold piece is broken (6 gp, 5 sp). Pay more than there is: "Not enough in the purse".
- GM changes the gold on the group sheet by hand: a line "changed on the sheet" with the GM's name. `/award party 20gp` (dnd5e): a line too.
- GM **undo** on a line: the coins go back, the line is struck through, an "Undo: …" line is added.
- With the GM logged out, the player's Pay: "The GM needs to be online".
- With *Players use the common purse* off: the player sees "The GM keeps the purse".

**Cards, buttons, pages**
- Card with a Theater link (Planar Theater active, a place with that name exists): **Theater** shows it over the map; the eye-slash takes it down. **Sound** starts the soundscape (Planar Soundboard). **Battle map** activates that scene. **Prep** opens the note at the heading. **Pay** takes the place's price from the purse.
- Edit a place: change the Greek name and category: the pin's label and icon change; Save pack → the downloaded JSON has the new name and the dragged position, and the pack's starting status.
- In a journal (GM): `@Atlas[The Salty Lantern]`, `@Atlas[The Salty Lantern | move]{Go}`, `@Atlas[reveal: Temple]`, `@Atlas[set: guide]`, `@Atlas[pay: 5sp | a room]`: buttons that work. A player who can read the journal sees plain text (never a hidden place's name looked up from the atlas).
- Pages: after a move, «The party's road» (GM-only) is rewritten within a few seconds; after a payment, «The party's purse» (players can read). Notes tab → **Open the party's notes**: the GM's first click creates the page; players can then edit it. With Planar Codex active they are Codex notes.
- EN/ΕΛ button: the window switches language for that user only; pin labels follow.

## Changing things

- **New user-facing text**: add the key to `lang/en.json` and `lang/el.json`. The language tests fail if they differ.
- **New pure logic**: put it in `util.mjs` with a test.
- **Never delete files.** Deleting a place removes its note and page only.
- **Data shapes**: the road (`ROAD_SCHEMA`), the pack (`PACK_SCHEMA`) and a place (`placeData`). If one changes, bump the schema and migrate in `normalizeRoad` / on import; people will have worlds with the old shape.
- **v14 notes**: a scene has no `backgroundColor`/background on the scene itself (`atlas.mjs#setBackground` uses the Level); tokens may have their x/y at the centre, so tokens are moved by measuring `getCenterPoint()` and shifting (`road.mjs#moveTokenCenter`).
- **Canvas**: the road is one `PIXI.Graphics` + labels in a container at index 0 of `canvas.interface`, rebuilt on change (debounced), destroyed on `canvasTearDown`. Only the pulse runs per frame, and only while an atlas with a road is on screen. Uses PIXI v7-style calls (`lineStyle`, `beginFill`), which v8 still accepts.

## Versions

Follow [SemVer](https://semver.org/). Update `CHANGELOG.md` first, then tag. Compatibility lives in `module.json` (`minimum`, `verified`); raise `verified` only after testing on that Foundry version.
