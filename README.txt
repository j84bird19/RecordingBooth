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


V1.11 AUDIO MONITORING + LATENCY COMPENSATION
- Adds Recording Offset control from -300 ms to +300 ms in 5 ms steps.
- Offset is applied when a vocal take is saved, so late/early recordings can be lined up without moving each take manually.
- Adds per-vocal-track I button for Input Monitoring.
- Input Monitoring routes live mic through the selected vocal track FX chain before output.
- Monitoring follows track mute/volume/pan/gain and does not restore as ON after project reload to avoid surprise feedback.
- Saves and restores the Recording Offset value.

Recommended latency test:
1. Load a beat/music file.
2. Record a short clap or sharp syllable on Vocal 1.
3. If the vocal lands late, set Recording Offset more negative, like -100 ms.
4. If the vocal lands early, set Recording Offset positive, like +40 ms.
5. Record another quick test until it lines up.

Input monitoring test:
1. Tap Enable Audio / Mic.
2. On a vocal track, tap I.
3. Adjust that vocal track FX sliders.
4. Turn Record On and Play to record while hearing the live processed mic.

Note: Bluetooth/headset monitoring delay is partly controlled by Android/Chrome/headset hardware. The offset fixes recorded timing, while the I button lets you hear the live FX path. Wired headphones usually monitor with less delay.


V1.12 MANUAL VOCAL NUDGE / ALIGNMENT FIX
- Added manual vocal alignment controls in Selected Track Edit.
- Select a recorded vocal track, choose a Nudge Step, then tap Nudge Left or Nudge Right.
- Fine steps: 5 ms, 10 ms, 25 ms.
- Big steps: 50 ms, 100 ms, 250 ms.
- Added Clip Start input so a vocal take can be placed at an exact timeline time.
- If playback is running, the app reschedules audio after each nudge so alignment changes can be auditioned immediately.
- Latency slider and input monitoring from V1.11 remain included, but manual nudge is now the reliable fallback when browser/device latency is inconsistent.


Fresh V1.12 Manual Vocal Nudge
- Adds Clip Start and Nudge Step controls to the Selected Track Edit panel.
- Select a recorded vocal track, then nudge left/right by 5 ms, 10 ms, 25 ms, 50 ms, 100 ms, or 250 ms.
- Clip Start can be typed directly for exact manual alignment.
- If playback is running, nudging reschedules the track so you can hear the alignment change immediately.

Fresh V1.13 Playhead + Split Editing
- Adds a Playhead time box and Jump Playhead button for manually starting playback/editing from an exact time.
- Adds Playhead = Edit Start for quick auditioning from the selected edit area.
- Adds Split At Playhead for recorded vocal tracks.
- Split At Playhead keeps the left side on the selected vocal track and moves the right side into the next empty vocal track.
- This keeps editing simple without changing the locked one-audio-region-per-track engine.

Recommended manual alignment test:
1. Load music and record a short vocal/clap.
2. Select the vocal track.
3. Use 25 ms or 50 ms nudge steps until it is close.
4. Switch to 5 ms or 10 ms for final timing.
5. Use Playhead and Split At Playhead for cutting sections before/after the edit point.
