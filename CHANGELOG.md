# Changelog

All notable changes to this module. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

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
