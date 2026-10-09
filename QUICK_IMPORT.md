# Quick Import — Discord avatar submissions

Visit `/quick-import` from the Ava-Valt Admin home page. Paste avatar IDs (or Discord messages containing them), click **Fetch Avatar Names**, choose PC / Android / iOS yourself, and then **Save Reviewed Avatars to GitHub**.

- Existing avatar IDs are skipped, not overwritten.
- Lookup asks enabled provider APIs for exact matching IDs. When no API returns the avatar, manually enter the name. No fabricated metadata.
- A name and at least one manually selected platform are mandatory for each submission.
- Creator opt-outs and marker reviews are applied before writing.
- Live GitHub DB is updated through the existing conflict-aware save routine.
- The existing importer, settings, and quarantine pages are unchanged.
- Requires the same existing environment variables and login as the admin website.
- Name lookup depends on enabled providers and their access; a 403/timeout is not bypassed.

Note: The page does not yet pull messages directly from Discord. It accepts pasted avatar IDs; the existing bot's pending-submissions list can be integrated separately later.
