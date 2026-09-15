# OFFCOURSE v1

A local-first, installable iPhone web app for mystery adventures and remembering unfinished curiosity.

## Included
- Mystery **Disappear** generator with time, budget, range and vibe controls
- **Surprise Me** instant adventure mode
- Step-by-step clue reveal and branching choices
- **Adventure Seeds** with notes, category, optional current location and photos
- Photos stored in IndexedDB instead of filling localStorage
- **Our World** map using OpenStreetMap/Leaflet when online
- Adventure history
- JSON export/import backup
- PWA manifest + service worker for offline core app usage
- iPhone home-screen install support

## Publish with GitHub Pages
1. Create a new GitHub repository, e.g. `Offcourse`.
2. Upload every file in this folder to the repository root.
3. In GitHub: **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then Save.
6. Open the GitHub Pages URL in Safari on iPhone.
7. Tap **Share → Add to Home Screen**.

## Important V1 behaviour
- App data is stored on the device/browser where it is created.
- The core app works offline after it has loaded once.
- Map tiles and the Leaflet library need an internet connection the first time they are loaded; individual map tiles are cached after use.
- Couple sync across two phones is intentionally not enabled in this build. That needs a small shared backend (Supabase is a good fit).

## Suggested next build
- Supabase shared couple accounts and private wish matching
- Live weather/tide/sunset-aware adventure generation
- Smarter location-based discovery
- Return Quests from old seeds
- Push notifications for ideal conditions
- Share-to-Offcourse from Safari/TikTok/Instagram links
