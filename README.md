# Eddy — AI podcast editor

Eddy places intro/outro, background music, sound effects and disclaimers on AI-voice podcast episodes, with
projects, folders and full version history for the team.

## Repository layout

| Path | What it is |
|---|---|
| `apps/web` | **Eddy v2** — React + TypeScript + Vite editor (Konva timeline, Web Audio, MP3 export in a worker) |
| `apps/web/functions` | Cloudflare Pages Function that stores audio on R2 (`/api/audio/<sha256>`) |
| `packages/rules` | Shared data model and the auto-edit rules engine |
| `supabase/migrations` | Database schema: folders, projects, versions, library, guidelines, team access |
| `v1/` | Eddy v1 (single-file app, kept for reference until v2 replaces it) |

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

With no Supabase keys, Eddy stores everything in your browser (“This browser” mode). See `SETUP.md`
to connect the free team cloud (Supabase + Cloudflare R2 + Cloudflare Pages).

See `CHANGELOG.md` for version history.
