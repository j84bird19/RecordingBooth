Recording Booth / Mic Check - Fresh V1 Logic-Style DAW Core

This is a fresh-start PWA build, not a patch of the older unstable branch.

Purpose:
- Load up to 2 music tracks.
- Record up to 5 vocal tracks.
- Use Logic-style DAW behavior: transport controls song playback, R arms vocal tracks, top Record mode + Play records.
- Show waveforms in the song overview and each individual track lane.
- Show live mic input meters from the active microphone stream.
- Export dry stems from 0:00 for Logic Pro alignment.

Recommended upload:
1. Create a NEW GitHub branch or repo.
2. Delete all old files in that branch.
3. Upload all files from this ZIP.
4. Use GitHub Pages / HTTPS.
5. On Android, clear site data if an older PWA is cached.

Android/Bluetooth note:
The app requests microphone access and uses Android-safe browser audio constraints, but Android/Chrome decides the final Bluetooth mic routing. Connect the headset before opening the app.

Test flow:
1. Tap Enable Audio / Mic.
2. Load Music 1.
3. Confirm Music 1 plays and shows waveform in overview and track lane.
4. Tap R on Vocal 1.
5. Confirm INPUT meter moves when speaking.
6. Turn Record On.
7. Tap Play.
8. Tap Stop.
9. Confirm Vocal 1 saves and shows waveform.
10. Export dry stems and import into Logic.


V1.1 Vocal FX Routing Fix
- Vocal FX controls are now wired into the Web Audio playback graph.
- EQ, Compression, Reverb, and Delay affect recorded vocal playback live.
- FX state saves/loads with the project.
- Rough Mix export uses wet FX when OfflineAudioContext is available.
- Dry Stems remain dry for final mixing in Logic.

Testing:
1. Load music and record a short vocal.
2. Play the vocal back.
3. Turn EQ on/off and listen for more clarity/air.
4. Turn Comp on/off and listen for a tighter/steadier vocal.
5. Raise Rev and Delay and confirm obvious space/echo.
6. Export Rough Mix to confirm the wet demo bounce includes FX.
