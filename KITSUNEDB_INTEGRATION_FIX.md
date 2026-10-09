# Ava-Valt — KitsuneDB platform/IMPORT correction

## KitsuneDB on the main IMPORT page

The website `https://avtr.fumikoecho.net/avatars` is **KitsuneDB**. It now appears
under **IMPORT providers** on the main admin page, as well as under
**AUTO IMPORT SETTINGS → Providers**. It is enabled by default.

Choose **KITSUNEDB ONLY** to test its results without involving failing providers,
or **SELECT ALL ENABLED** to run the normal multi-provider search. The search
response shows the working/blocked/unavailable state of each selected provider.
Manual selection does not change the saved auto-import settings.

The parser now accepts a record with an empty `platforms` array but a separate
`platformLabel`, skips negative or missing performance evidence, and retains
KitsuneDB platform metadata if a different provider listed the same avatar
first without platform evidence. No second duplicate provider was added.

## Platform Needs Review changes

- **LOOK UP KITSUNEDB API** queries `https://avtr.fumikoecho.net/api/integrations/avatars/vrcx`
  using the **exact** `avtr_` ID, not a fuzzy avatar name match.
- Explicit `PC + Quest` metadata becomes `PC` + `Android` (Quest platform).
- Supports arrays, combined labels, positive platform flags and named build metadata.
- If the public API returns the avatar but omits platform information, the page
  explains that clearly; it does not invent a platform.
- **OPEN KITSUNEDB** opens the provider website. Check the avatar *and its exact
  ID* there, and select platforms manually if needed. You may need to paste
  the ID into the website search box if the URL query is not pre-filled.
- Auto Platform Review still checks at most 5 **avatars** per rolling hour and
  requires Owner approval before adding them. After an unresolved NekoSuneVR
  lookup it can try one KitsuneDB API request. No VRChat site scraping.
- The resolver stops rather than circumvents 401/403/429 access restrictions.
  You must confirm providers allow this use before enabling automatic checks.

## Install

1. Back up your importer GitHub repository/branch. Upload updated project files
   **preserving their folders**, rather than moving them into an extra folder.
2. Redeploy your `ava-valt-importer` Vercel project.
3. In AUTO IMPORT SETTINGS, confirm `KitsuneDB` remains enabled.
4. On the main IMPORT page click **KITSUNEDB ONLY**, choose Search, and RUN. Check the result/provider status.
5. Open PLATFORM NEEDS REVIEW, pick an avatar and press LOOK UP KITSUNEDB API.
   Check the exact-ID evidence before VERIFY & ADD.
6. Optional auto worker: follow `PLATFORM_AUTO_REVIEW.md`, enable the GitHub
   Actions workflow and `PLATFORM_REVIEW_AUTO_ENABLED=true` only after checking
   provider permissions. Use `PLATFORM_REVIEW_KITSUNE_FALLBACK=false` to disable
   KitsuneDB use by the hourly worker without removing it from IMPORT.

No new secret, VRChat cookie, Discord bot change or browser extension is needed.

## Important limitation

The KitsuneDB **website** may display a PC + Quest badge even if its publicly
advertised **VRCX integration** returns no platform data for that same avatar.
This patch improves extraction of structured metadata, but it cannot guarantee
that the API exposes the website-only badge. In that case manually confirm
the visible badge against the exact avatar and choose PC + Android yourself.
We did not scrape listing HTML or fake exact-ID matches. Tests use mocked API
responses; a live production request to KitsuneDB was not possible here.
