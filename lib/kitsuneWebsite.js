// Backwards-compatible export. The old HTML badge scraping routine could not
// safely distinguish another avatar's badge; use KitsuneDB's advertised
// structured VRCX integration instead.
export {kitsuneExactPlatformLookup as kitsuneWebsitePlatformLookup} from './kitsuneLookup.mjs';
