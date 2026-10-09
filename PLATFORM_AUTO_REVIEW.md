# Ava-Valt: low-rate Platform Needs Review worker

This extension is **not** a VRChat website crawler. VRChat's Terms of Service
restrict unauthorised automated access and scraping; slowing requests to five
per hour does **not** make prohibited requests permitted. The worker makes **no**
automated HTTP requests to vrchat.com or api.vrchat.cloud and never handles VRChat
credentials. It checks the independent **NekoSuneVR exact-avatar-ID** metadata provider,
then KitsuneDB’s publicly advertised VRCX integration when the first has no
platform evidence (each provider’s own terms must be respected), saves
candidate platform evidence, and requires the owner to confirm each avatar
before publishing it. It does not bypass 401, 403 or 429 responses.

## Enable

1. Deploy the updated website files in the **private Ava-Valt-Database-importer**
   GitHub repository. Keep existing `.env` and database files.
2. In Vercel Project Settings → Environment Variables, set:
   `PLATFORM_REVIEW_AUTO_ENABLED=true`, `PLATFORM_REVIEW_PER_HOUR=5`, and
   `CRON_SECRET=<your existing long random private cron secret>`.
   Do not create a `NEXT_PUBLIC_` variable for secrets. Redeploy.
3. In GitHub → private *importer* repo → Settings → Secrets and variables → Actions,
   add repository secrets:
    - `CRON_SECRET`: **same value as Vercel**, not your Discord bot token.
    - `PLATFORM_REVIEW_SITE_URL`: `https://ava-valt-importer.vercel.app`.
4. Enable Actions for this repository. The included
   `.github/workflows/platform-review.yml` runs near minute 17 every hour.
   GitHub may delay scheduled runs; a public-facing Vercel project is needed.
5. Check `/platform-review`. Use the `CHECK NEXT BATCH NOW` button to test.

## Safety and behavior

- Maximum 5 avatars *reserved* per rolling 60 minutes, including manual triggers.
- At most one avatar at a time (no concurrency or VRChat traffic). A single
  automatic avatar check may require one NekoSuneVR request and one KitsuneDB API request (up to 3 seconds).
  Manual KitsuneDB lookups may try two supported API query modes.
  A 401/403/429 response stops further providers for that avatar and pauses the worker.
- At most one pass per avatar every 24 hours (configurable upward).
- Provider results are only *suggestions*; a human must visit the VRChat page
  and explicitly confirm the platforms using `VERIFY & ADD`.
- Creator opt-outs and marker-excluded avatars are never queried.
- 401/403 from the provider pauses all automatic checks until the owner confirms
  permission and explicitly resumes. 429 pauses them for at least 24 hours.
- All review state persists in the GitHub `platform-needs-review.json` file.
  Progress remains across Vercel restarts; two simultaneous runs cannot reserve
  the same quota because reservations use GitHub's file SHA.
- `OPEN VRCHAT` is a manual link, not an automated scraper.
- If the third-party provider disallows automated requests, **keep
  PLATFORM_REVIEW_AUTO_ENABLED=false**. Do not use another account, proxy or
  rotating IP to bypass a restriction.

## One avatar every two hours

Change the workflow schedule to `17 */2 * * *` and set
`PLATFORM_REVIEW_PER_HOUR=1`. Each run can check at most one avatar.

## Vercel Hobby

Vercel Hobby cron schedules may be limited to once daily. The GitHub Actions
workflow triggers this authenticated endpoint independently of Vercel Cron Jobs.
If you do not enable Actions, this feature won't run every hour, but you can
still run a batch from the authenticated Platform Review page.

## Error messages

- **Unauthorized (401):** `CRON_SECRET` values do not match.
- **Automatic review disabled:** Enable `PLATFORM_REVIEW_AUTO_ENABLED` in Vercel.
- **NOT_FOUND:** The review queue file doesn't exist yet; run Quarantine Repair
  to move unresolved avatars into it.
- **GitHub write HTTP 409:** Concurrent queue update. Retry a later scheduled
  run; no extra provider requests occur before the initial reservation.
- **PROVIDER_BLOCKED / RATE_LIMITED:** Respect the block/backoff. Never bypass it.

The feature does **not** change your Discord bot or VRChat world, and does not
make any changes to the live `avatar-index.json` except when you explicitly use
`VERIFY & ADD` as before.
