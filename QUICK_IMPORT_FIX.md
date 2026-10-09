# Quick Import save verification update

The Save button now reports the GitHub destination (owner/repo, branch, path), the number added, and IDs confirmed present by reading `avatar-index.json` back from GitHub. Already-present or privacy-held records are reported separately; failed verification produces an error rather than a misleading success message.

If the destination is not `BuzzHiveChat/Ava-Valt-Database / main / avatar-index.json`, check Vercel's `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, and `GITHUB_DATABASE_PATH` settings. The token needs access to write repository contents. A redeploy is required after changes.

This update does not bypass provider errors, override creator opt-outs, or claim that submissions were saved unless the database read confirms their IDs are present.
