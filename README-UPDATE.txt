OFFCOURSE V2 UPDATE

Replace/upload these four files in the repository root:
- app.js (replace)
- index.html (replace)
- sw.js (replace)
- v2.css (new)

Existing Adventure Seeds, history, settings and photos remain stored locally under the same Offcourse storage/database names.

New in v2:
- Real nearby discovery from OpenStreetMap / Overpass
- Weather, rain chance, wind and sunset context from Open-Meteo
- Live-place Disappear adventures with offline fallback
- Return Quests from old Adventure Seeds
- Couple matching on one phone
- Two-phone private pick-code sharing/import (no server/account required)
- Nearby discoveries can be turned directly into Seeds
- Seed category filtering
- Improved service worker update behavior

Note: Live tide predictions are NOT included yet. Offcourse recognises tide-related Seed notes but does not fabricate tide data. A reliable Australian tide source/backend can be added later.
