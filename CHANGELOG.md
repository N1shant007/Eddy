# Changelog

## v2.0.0-alpha.2 — 2026-10-25
- Auto-edit ported from v1 into the shared rules package (`packages/rules`), with 12 automated tests: script tags, subtitle timings (.srt/.vtt/ElevenLabs/Whisper JSON), story play / story rewrite, Unfolding Insights under questions, coin chime on every low-interest mention and on savings, warm keys for the guest, harp glide, takeaway ding, caution music, intro (2.5 s full then fade) and CTA intro reprise (-8 dB), one background music at a time, story rewrite in gaps, +1 dB beds, product + AI disclaimers.
- Auto-edit panel: script box, script and subtitle files, product (guessed from the script), hosts, a cue list explaining every sound with on/off switches.
- SETUP.md for the free team cloud; CI workflow (typecheck, tests, build); daily Supabase keep-alive.

## v2.0.0-alpha.1 — 2026-10-25
- New app: React + TypeScript + Vite, Konva timeline, Supabase + Cloudflare R2 (free tiers), Cloudflare Pages hosting.
- Projects in nested folders: create, rename, move (menu or drag and drop), delete, duplicate, search, sort.
- Version history per project: autosave, Save version with a note, history panel, compare two versions, restore (saved as a new version, nothing lost), copy a version as a new project.
- Editor: import episode audio, add sounds from the library (drag or +), move/trim/split/duplicate/delete clips, overlapping clips in rows, clip volume and fades, track mute/solo/volume, music dips under voices, undo/redo, MP3 export in the background.
- Audio library: categories, upload, rename, tags, move, delete, preview; one-click Bajaj starter library. Guidelines editor with a default.
- Works with no account (this browser) or as a shared team cloud with Google sign-in.

v1 versions below match the published Eddy artifact on claude.ai.

## v64 — 2026-10-24
- Only one background music plays at a time: where two overlap, the later one takes over; the earlier one resumes after it if time is left. Manual clips always win.
- Opening: intro music starts right after the disclaimer, plays at full volume for 2.5 s, then fades out over 1.5 s; voices start at 2.5 s.
- CTA: the intro music plays again, lightly (-8 dB, ducked), under the whole CTA; the outro follows.
- Defaults: voices enter at 2.5 s, intro tail 1.5 s. Storytelling guideline text updated.

## v63 — 2026-10-24
- Fixed deleting clips (Delete/Backspace key, right-click "Delete clip"): overlapping clips on one track are drawn in separate rows so clicks hit the right clip.
- Red Delete button in the clip bar; a message names the deleted clip; Ctrl+Z restores it.

## v62
- All background music at +1 dB.

## v59–v61
- Subtitle/SRT timings kept exact, so SFX like Coin Chime land on the right words.
- Guest introduction (Character Intro – Warm Keys) placed by every engine.
- "Unfolding Insights" (Curiosity) under questions from any speaker; story play under valuable information from any speaker.

## Earlier
- Team library sharing (export, add library .zip, share with everyone); guidelines Save / Save for everyone.
- Player ⋮ menu with Download; offline build; Connect Claude / ChatGPT (API key or Claude Pro copy-paste).
- Replace / delete audio library items; clip quick bar (volume, fades).
- Storytelling rules: story rewrite / story play beds, Coin Chime on every low-interest mention, Harp Glide on guest acknowledgement, intro music at CTA then Warm Close.
- Script / subtitle popup after an audio-only import.
