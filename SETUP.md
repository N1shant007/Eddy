# Setting up the free team cloud

Eddy v2 works straight away in **“This browser” mode**: everything is stored in your browser and nothing needs an account.
To share projects, folders, version history and the audio library across the team, connect these three free services.
It takes about 20 minutes. Total cost: ₹0 within the free limits (500 MB of project data, 10 GB of audio).

| Service | Used for | Free allowance |
|---|---|---|
| Supabase | database, Google sign-in, version history | 500 MB database, 50,000 users, pauses after 7 idle days (the GitHub Action below prevents that) |
| Cloudflare R2 | audio files | 10 GB storage per month, free downloads |
| Cloudflare Pages | hosting the app + the audio function | unlimited bandwidth, commercial use allowed |

---

## 1. Supabase (database + sign-in)

1. Go to <https://supabase.com>, sign in with GitHub and click **New project**. Name it `eddy`, pick the Mumbai region, set a database password and save it somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of `supabase/migrations/0001_eddy.sql` and click **Run**.
3. Still in the SQL Editor, add yourself as admin and allow your company’s email domain (edit the values):
   ```sql
   insert into team_members(email, role) values ('nishanthipparagi25@gmail.com', 'admin');
   insert into team_domains(domain) values ('your-company-domain.com');
   ```
   Anyone signing in with an email on that domain joins the team. Add individual people with more `team_members` rows
   (`role` = `admin`, `editor` or `viewer`; viewers can open everything but not change it).
4. **Google sign-in:** in Supabase open **Authentication → Sign In / Providers → Google** and switch it on. Follow the link there to create
   a Google OAuth client (Google Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application).
   Use the callback URL Supabase shows as the *Authorized redirect URI*. Paste the client ID and secret back into Supabase.
5. In **Authentication → URL Configuration**, set *Site URL* to your Pages address from step 3 (e.g. `https://eddy.pages.dev`)
   and add `http://localhost:5173` to *Redirect URLs* for local development.
6. From **Project Settings → API** copy the **Project URL** and the **anon public** key. You need both below.

## 2. Cloudflare R2 (audio files)

1. Sign up at <https://dash.cloudflare.com> (free). Open **R2 Object Storage** and click **Create bucket**; name it `eddy-audio`.
   R2 asks for a payment method even on the free plan; you are only charged above 10 GB.
2. Nothing else is needed here: the bucket stays private and the app reaches it through the function in step 3.

## 3. Cloudflare Pages (hosting)

1. In Cloudflare open **Workers & Pages → Create → Pages → Connect to Git** and pick the `N1shant007/Eddy` repository.
2. Build settings:
   - **Framework preset:** None
   - **Root directory:** `apps/web`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variables:** `VITE_SUPABASE_URL` = your Project URL, `VITE_SUPABASE_ANON_KEY` = your anon key, `NODE_VERSION` = `22`
3. Click **Save and Deploy**. When it finishes, open the project’s **Settings**:
   - **Bindings → Add → R2 bucket:** variable name `AUDIO`, bucket `eddy-audio`
   - **Variables and Secrets:** add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same values as above) for the audio function
4. **Deployments → Retry deployment** so the bindings take effect. Every push to `main` now deploys automatically.

## 4. Keep Supabase awake (GitHub)

In the GitHub repo open **Settings → Secrets and variables → Actions → New repository secret** and add
`SUPABASE_URL` and `SUPABASE_ANON_KEY`. The *Keep Supabase awake* workflow pings the database once a day.

## 5. First run

1. Open your Pages address and **Sign in with Google**.
2. **Audio library → Import starter library** uploads the Bajaj sounds and storytelling guidelines once for the whole team.
3. Create folders and projects. Projects made earlier in “This browser” mode stay in that browser; open one, export the MP3, or re-create it in the cloud.

---

## Local development

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # optional: fill in to use the team cloud
npm run dev                                      # http://localhost:5173
npm test                                         # rules engine tests
```

To test the audio function locally with the cloud: `npx wrangler pages dev apps/web/dist --r2 AUDIO` (after `npm run build`).
