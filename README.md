# Eddy — AI podcast editor

Browser-based editor that auto-places intro/outro, background music, SFX and disclaimers on AI-voice podcast episodes.

- `index.html` — the whole app (single file). Open it in a browser, or serve this folder.
- `team/library.json` + `team/audio/` — the shared team audio library and storytelling guidelines.
- `tools/build_local.py` — builds the offline single-file copy: `python3 tools/build_local.py index.html team eddy.html`
- `tools/make_srt.py` — makes fine-grained SRT subtitles from a transcript.

See `CHANGELOG.md` for version history.
