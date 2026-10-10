# Setting up ChronKeep in the cloud

The cloud server (`cloud/server.js`) gives ChronKeep accounts, keeps each person's data in Postgres (Supabase), serves the landing page and the web app, and syncs the phone app. Everything below is a one-time setup.

## What is already done

- The database is Supabase. The server creates its tables the first time it connects (the SQL is in `cloud/schema.sql`, safe to run again), with row level security on.
- Your account exists in that database. To make another, or reset a password, run
  `CK_EMAIL=you@example.com CK_NAME="Your Name" CK_PASSWORD='…' node scripts/create-user.js` (reads `.env`).
- `.env` (git-ignored) holds your `DATABASE_URL` and a `SESSION_SECRET` for running locally: `npm run start:cloud`, then open http://localhost:3000.

## 1. Deploy to Render

1. Push the repo to GitHub.
2. Render dashboard → **New → Blueprint** → pick the repo. It reads `render.yaml` (a Starter web service in Frankfurt).
3. Fill in the variables Render asks for:
   - `DATABASE_URL`: your Supabase **Session pooler** string (port 5432, user `postgres.<project-ref>`). The direct connection is IPv6 only and does not work from Render.
   - `APP_URL`: the service's address, for example `https://chronkeep.onrender.com` (no trailing slash). Sign-in redirects and emails use it.
   - `SESSION_SECRET` is generated for you. Never change it afterwards unless you want everyone signed out.
4. Deploy. `https://<your-service>/healthz` should answer `{"ok":true}`, and `/` shows the landing page.

Render's free web service has no permanent disk, but ChronKeep keeps nothing on disk (people, items and files are all in Postgres), so Starter is simply for staying awake. Reminders are scheduled on the phones, so the server need not run around the clock for them.

## 2. Sign in with Google

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: app name ChronKeep, your support email, publish it.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Authorised redirect URI: `<APP_URL>/auth/google/callback`.
4. Put the client id and secret in Render as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The "Continue with Google" button appears on the web and in the phone app by itself.

## 3. Sign in with Apple

You need the Apple Developer Program (you will have it for the App Store anyway).

1. **Identifiers → App IDs**: the app `com.victorabuchi.chronkeep` with the **Sign in with Apple** capability on.
2. **Identifiers → Services IDs**: create one (for example `com.victorabuchi.chronkeep.web`), enable Sign in with Apple, configure it with your domain (the Render host) and the return URL `<APP_URL>/auth/apple/callback`. This is `APPLE_CLIENT_ID`.
3. **Keys**: create a key with Sign in with Apple, download the `.p8` once. Its id is `APPLE_KEY_ID`; the text of the file is `APPLE_PRIVATE_KEY` (paste it with its line breaks, or with `\n` in place of each).
4. `APPLE_TEAM_ID` is on your membership page.
5. `APPLE_APP_ID` is already `com.victorabuchi.chronkeep`: the audience of the identity token the iPhone app gets from Apple.

On iPhone the button uses Apple's own sheet; on Android it opens the browser flow.

## 4. Password-reset emails

Create a free account at resend.com, verify a sending domain, and set `RESEND_API_KEY` and `RESEND_FROM` (for example `ChronKeep <hello@yourdomain.com>`). Until then, the reset link is printed in the Render log instead of sent.

## 5. The phone app

- `eas.json` sets `EXPO_PUBLIC_API_URL` for the build profiles. Change it to your real Render address.
- The browser sign-in (Google, and Apple on Android) hands the answer back through the `chronkeep://auth` address (`scheme` in `app.json`). Nothing to configure.
- `eas build --platform all --profile production`, then `eas submit`. Apple reviewers will want a demo account: make one with the script above.
- For trying the app against a local server in development: `EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start`. (`EXPO_PUBLIC_DEV_LOGIN="email:password"` signs in at start, development builds only.)

## 6. A custom domain (optional)

Render → your service → **Custom Domains**. Then change `APP_URL`, the Google redirect URI and the Apple return URL and domain to the new address, and set `EXPO_PUBLIC_API_URL` in `eas.json`.

## How it fits together

| Piece | Where |
| --- | --- |
| Accounts, sessions, Google, Apple, password reset | `cloud/auth.js`, `cloud/server.js`, `cloud/pages.js` |
| Each person's data (one document) and files | `cloud/db.js`, `cloud/schema.sql` |
| The routes the web app uses (items, bin, calendars, profile, backups, files) | `lib/api.js`, shared with the local server |
| Keeping devices the same | `lib/sync.js` on the server, `lib/sync.ts` in the phone app (they are tested against each other) |
| Landing page, sign-in pages, the animated film | `site/`, rebuilt with `node scripts/shots.js` |

## Good to know

- **One server instance.** People's documents are cached in memory while they are active, so run one instance (the Blueprint does). Running several needs a change to how documents are cached.
- **Rotate secrets that were pasted anywhere.** If your database password was ever shared in a chat or a ticket, reset it in Supabase (Project settings → Database) and update `DATABASE_URL`.
- **Backups.** Each person's data is copied once a day (14 days kept) and before restores. Supabase keeps its own database backups on top.
- **Deleting an account** removes the person, their data, files and backups from the database straight away.
