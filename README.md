# Profile Gallery

An Instagram-profile-style site: your avatar, bio, and a grid of photos/videos in the center, with ad space columns on the left and right for revenue. Only you (signed in) can post or delete; anyone can view.

## Stack
- **React + Vite** — the site itself
- **Supabase** (free) — login, database, and photo/video storage
- **Netlify** (free) — hosting
- **Google AdSense** (free to join) — the ad columns

Photos are automatically compressed in your browser before upload (resized to max 1920px, ~80% smaller) so your free storage quota stretches much further.

---

## 1. Set up Supabase
1. Go to [supabase.com](https://supabase.com) → sign up → **New project**.
2. Once ready, open **SQL Editor** → paste the contents of `supabase-setup.sql` → **Run**. This creates your `media` and `profile` tables with the right permissions.
3. Go to **Storage** → **New bucket** → name it exactly `media` → toggle **Public bucket** on → Create.
4. Go to **Authentication → Users** → **Add user** → your email + a password. This is your one and only login.
5. Go to **Project Settings → API** → copy the **Project URL** and **anon public** key.

## 2. Configure the app
```bash
cp .env.example .env
```
Paste your Supabase URL and anon key into `.env`. Leave the `VITE_ADSENSE_*` lines blank for now.

## 3. Run it locally
```bash
npm install
npm run dev
```
Sign in with the email/password from step 1.4, click **+ New post**, and try uploading a photo or video.

## 4. Deploy to Netlify (free)
1. Push this folder to a GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
2. Go to [netlify.com](https://netlify.com) → sign up with GitHub → **Add new site → Import an existing project** → pick your repo.
3. Netlify auto-detects the build settings from `netlify.toml`. Before deploying, go to **Site settings → Environment variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADSENSE_CLIENT_ID` (leave blank for now)
   - `VITE_ADSENSE_SLOT_ID` (leave blank for now)
4. Click **Deploy**. You'll get a live URL like `your-site.netlify.app` in about a minute.
5. Sign in on the live site and post some real photos — you'll want genuine content before applying to AdSense.

## 5. Set up AdSense (once your site has real content, live)
1. Go to [google.com/adsense](https://www.google.com/adsense) → sign up with your live Netlify URL.
2. Google reviews your site (can take a few days to a couple weeks) — it needs to see original content and comply with their policies. Empty placeholder pages get rejected, so make sure your gallery has posts first.
3. Once approved, AdSense gives you:
   - A **Publisher ID** like `ca-pub-1234567890123456`
   - An ad unit with a **Slot ID**
4. In `index.html`, uncomment the `<script>` tag near the top and put your Publisher ID in place of `YOUR-PUBLISHER-ID`.
5. In your `.env` (and in Netlify's environment variables), set:
   - `VITE_ADSENSE_CLIENT_ID=ca-pub-1234567890123456`
   - `VITE_ADSENSE_SLOT_ID=` (the slot ID from your ad unit)
6. Redeploy (push to GitHub — Netlify rebuilds automatically). The placeholder ad boxes will now show real ads.

## Notes
- Supabase's free tier: 500MB database, 1GB file storage, no card required. See the "how to get more storage" conversation for upgrade paths if you outgrow it.
- Ad columns automatically hide on narrower screens (under ~1200px) and a single ad appears below your posts instead — real Instagram doesn't have side ads on mobile either, so this keeps things clean.
- Want to edit your name/bio/avatar later? Sign in and click **Edit profile**.
