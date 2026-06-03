Recording Booth / Mic Check — Fresh V1.4 Loop + FX + Save Restore Fix

Current locked systems preserved:
- music files load
- vocals record
- mute, solo, and volume work
- existing track count and transport workflow remain unchanged

This patch fixes only:
1. Visible Loop / Cycle Tool panel
2. Adjustable vocal FX controls
3. Save/refresh restore so tracks come back after reopening/refreshing

Testing:
1. Full replace files in the branch.
2. Clear browser/site cache if the old app still appears.
3. Open app and tap Enable Audio / Mic.
4. Load Music 1 and record a short Vocal 1.
5. Tap Save Project.
6. Refresh the app. Tracks should auto-restore visually.
7. Press Load Project manually if needed.
8. Test Loop / Cycle Tool: set start/end, turn Loop On, press Play.
9. Test FX while vocal plays: Low Cut, Presence, Air, Comp, Rev, Delay should be adjustable sliders.

Important:
Loop is playback/editing only. Recording automatically disables loop in this version to avoid broken takes.


Fresh V1.5 Install Prompt Fix
- Adds Android/PWA install button in the header and Install App panel.
- Captures the browser beforeinstallprompt event when Chrome exposes it.
- If Chrome does not expose the prompt yet, the app shows manual install instructions: Chrome menu → Add to Home screen / Install app.
- Updates manifest id/scope/start_url/icons for stronger PWA eligibility.
- Updates service worker cache and includes app icons in offline cache.

Important: Android install prompts require HTTPS. GitHub Pages works. Opening index.html directly from files will not trigger an install prompt.


V1.6 HEADSET PLAYBACK FIX
- Added Headset Output Fix button.
- This routes the app mix through a browser MediaStream audio element instead of only the Web Audio destination.
- Use this when a Bluetooth/headset mic records but music is not heard in the headset.
- Android/Chrome still controls final Bluetooth routing, so this cannot guarantee every headset model, but it gives the browser a second playback path that often behaves better with headset mode.

Recommended headset test:
1. Connect headset before opening the app.
2. Open app over HTTPS/GitHub Pages.
3. Tap Enable Audio / Mic.
4. Tap Headset Output Fix On.
5. Load music and press Play.
6. If silent, press phone volume up and tap Play again.


Fresh V1.7 Fixed Navigation
- Top app header is fixed.
- Main transport stays sticky below the header while scrolling.
- Bottom fixed control bar added for Rewind, Record, Play, Stop, and Save.
- Audio/recording/headset systems unchanged from V1.6.
