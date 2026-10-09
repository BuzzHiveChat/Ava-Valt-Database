# Ava-Valt importer → Discord bot integration

This website ZIP is patched to notify the existing **Ava-Valt Discord bot v2.12.0** after successful changes to the live GitHub `avatar-index.json`.

## Already connected in this build

- `lib/autoImport.js`: after a successful automatic import (manual Run Now or Vercel cron), if the live database was changed by new imports, platform fixes/restores, cleanup, or integrity repair.
- `app/api/import/add/route.js`: after successfully saving new manually submitted avatars, or an existing avatar metadata update.
- `website-integration/notify-ava-valt.mjs`: HTTPS POST to the bot, authenticated with a shared secret.
- `website-integration/report-import.mjs`: unique event ID per change, quick timeout and failure isolation.

Only **server-side** code calls the helper. It does **not** publish keys, avatar IDs or a user-controlled avatar total to Discord. The bot independently checks the official GitHub database and updates its stats, new-avatar alerts, and Road to 1 Million celebrations.

## Deployment

1. Upload **the contents of this ZIP** to the root of your existing `BuzzHiveChat/Ava-Valt-Database-importer` project, preserving `app/`, `lib/`, and `website-integration/` folders (do not nest them under another `website/` directory).
2. Allow your connected Vercel project to redeploy.
3. Configure these **server-only** environment variables in Vercel → Project → Settings → Environment Variables:

   ```dotenv
   AVA_VALT_BOT_WEBHOOK_URL=https://YOUR-BOT-HTTPS-DOMAIN/api/import-complete
   AVA_VALT_BOT_WEBHOOK_SECRET=YOUR_LONG_RANDOM_SECRET
   ```

4. On the WispByte bot hosting, use the **same secret**:

   ```dotenv
   IMPORT_WEBHOOK_PORT=YOUR_ALLOCATED_PORT
   IMPORT_WEBHOOK_HOST=0.0.0.0
   IMPORT_WEBHOOK_SECRET=YOUR_LONG_RANDOM_SECRET
   ```

   The bot listener must be available via a **real publicly reachable HTTPS endpoint** forwarding to its allocated port; a Discord bot token, Discord webhook URL, Vercel URL, or raw HTTP endpoint is **not** interchangeable with that HTTPS endpoint. Check with WispByte whether the plan supports this. Never expose the secret in screenshots, client-side `NEXT_PUBLIC_` variables or source code.

5. Restart the Discord bot after setting its environment variables; redeploy the website after setting its variables. On the Discord bot run `/integrationstatus` to inspect received website notifications. Do one successful small import and compare website importer count to the bot's LIVE STATS after sync.

## If the hosting plan cannot expose HTTPS

**Leave AVA_VALT_BOT_WEBHOOK_URL and AVA_VALT_BOT_WEBHOOK_SECRET unset**. The website imports continue working normally, and v2.12.0 still polls the GitHub database on its regular interval. In that mode the Discord announcements and milestones work, just not immediately. Use `/sync` to force a refresh, or set `DB_POLL_MINUTES` on WispByte to an appropriate value (2 is supported).

## Safety/behaviour

- Notifications are sent **only after GitHub saves succeed**, and only for actual changes. No notification for no-op imports, stopped/skipped runs, or a failed database write.
- Unconfigured, timed-out, or unreachable bot webhook: the GitHub import still succeeds. The importer logs a brief warning, and polling catches up automatically.
- A successful 202 HTTP response only means the bot queued the refresh; its remote GitHub read can complete later.
- The website never sends or overrides a trusted avatar total. No database writes are made by this integration helper.
- If another part of the site independently changes the database (e.g. owner-verifying a quarantined avatar outside the regular importer), normal GitHub polling still detects it.
- The bot release itself was **not modified** in this website ZIP; keep the v2.12.0 bot already installed.

## Quick test without touching live Discord

`node --test tests/discord-notify.test.mjs`
