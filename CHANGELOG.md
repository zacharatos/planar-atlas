# Changelog

All notable changes to this module. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [0.2.0]

### Added
- **The in-world clock.** Day, time and the named part of the day from the pack (e.g. «ζενίθ»). By default it *is* Foundry's world time, so effect durations and calendar modules move with it; the module only remembers when day 1 began. **Set** ("it is day 3, 10:00") moves that start, never Foundry's time. In the party window (everyone) with GM buttons: +10 min, +1 h, +8 h (Long Rest), +1 day, −1 h, Set. A **clock chip** on atlas maps (per-user setting). World setting *Use Foundry's world time* (off: the atlas keeps its own clock).
- **Travel time.** Each atlas in the pack has a rule per way of travelling: a time to cross the whole map (scaled by the road's length, wrap-around included), a roll ("3d6 days"), or a fixed time. When the GM drops the party token, a **trip window** shows the estimate or the roll; the GM can change the way of travelling (re-estimated), the time, and whether to roll for encounters, or say **No time passes**. The clock moves on and the stop is stamped with the day, the time and the trip's length. World setting *Travel time*: ask / pass it without asking / off. **Undo** also takes the trip's time back.
- **Encounters on the way.** Pack tables (inline rows with a formula, or the name of a world RollTable) for an atlas and for each area; ticked in the trip window, the destination area's table and the atlas's table are rolled and **whispered to the GM**. The place card's **Encounter** button rolls them any time.
- **Progress tracks.** A pack track lists places and steps ("2 completed → 7th level"); the GM marks a place **Completed** on its card; the party window shows the track (dots, count, step reached, next step), and the GM gets a lasting notice when a step is reached. A track can be hidden from players.
- The road page has a **Trip** column; stops in the party window show the trip's length.
- API: `clock()`, `clockLabel()`, `advanceClock(seconds)`, `setClock(day, "hh:mm")`, `rollTable(id)`, `setDone(name, done)`, `progress()`.
- Pack schema additions (still schema 1): `calendar.bands`, `tables`, `atlases[].travel`, `atlases[].encounters`, `areas[].table`, `progress`, a place's `done`. The example pack shows them all.

### Changed
- The party window's "next stop" fields keep the session and the way of travelling; the day and time now come from the clock.

## [0.1.0]

First release.

- **Atlas scenes:** use any scene as an atlas's map, or create one from the map image at its own size (no grid, vision or fog; v14 background set on the scene's Level).
- **Places** as map notes linked to one journal page each, with categories, icons and colours from the pack. A **place card** for players (picture, what they know, their visits) and the GM (secrets, book reference, status, links, actions), with an edit form.
- **What the players see:** hidden / rumoured ("?") / known / visited, per place or a whole reveal set at once. Map notes are switched on for everyone on an atlas (and back off when they leave it).
- **The party actor:** a dnd5e group (party) with the heroes as members, owned by every player, set as the primary party. **Only the GM moves its token** on an atlas.
- **The road:** every drop of the party token is a stop, snapped to the nearest place (which becomes *visited*), stamped with the session, the in-world day and time, and how they travelled. Drawn on the map: dashed road, numbered stops, one shade per session (older ones fainter), a pulse where the party stands. Undo, delete or annotate stops, hide the road from players or from the map, archive a journey (the next starts where the party stands), clear.
- **Maps that wrap around:** zones with linked edges in the pack; the road leaves one edge and comes back at the other, with arrows.
- **Area labels** (wards, regions) on the map, per-user toggle.
- **The party window** (everyone; Alt+P): Road, Purse, Notes. The **common purse** is the party actor's own coins with a history of every change (who, how much, why, session); players pay and put in through the GM's Foundry (change made automatically); changes made on the sheet or by `/award` are recorded; the GM can undo any line.
- **Card actions (GM):** move the party, show on the map, Planar Theater place over the map, Planar Soundboard soundscape, battle map, prep note, pay the place's price.
- **Journal buttons:** `@Atlas[name]`, `@Atlas[name | move]`, `@Atlas[reveal: name]`, `@Atlas[rumour: name]`, `@Atlas[hide: name]`, `@Atlas[set: id]`, `@Atlas[pay: 3gp | why]`.
- **Journal pages:** the road (GM), the purse (players read), the party's notes (players write); Planar Codex notes when the Codex is active.
- **Packs:** import with validation; **Save pack** downloads it with the positions dragged in Foundry and any new or edited places.
- English and Greek interface, switchable per user. Macro API (see the README).
