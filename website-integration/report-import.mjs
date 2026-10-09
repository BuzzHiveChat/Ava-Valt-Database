import { randomUUID } from 'node:crypto';
import { notifyAvaValtImportComplete } from './notify-ava-valt.mjs';

/**
 * Best-effort message after a SUCCESSFUL database commit. Safe to call from
 * Next.js server routes and background importers; NEVER from browser code.
 * Discord unavailability must not change an already-successful import into a
 * failed import or cause retries that duplicate database writes.
 */
export async function reportCommittedImport(source = 'import') {
  // No secret or URL means the existing bot's GitHub polling stays in charge.
  if (!process.env.AVA_VALT_BOT_WEBHOOK_URL || !process.env.AVA_VALT_BOT_WEBHOOK_SECRET) {
    return { skipped: true, reason: 'Ava-Valt Discord push is not configured' };
  }
  const safeSource = String(source).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'import';
  try {
    return await notifyAvaValtImportComplete(`${safeSource}_${randomUUID()}`);
  } catch (err) {
    console.warn(`Ava-Valt Discord notification failed (GitHub polling will catch up): ${err?.message || err}`);
    return { skipped: true, reason: 'Discord endpoint unavailable; polling fallback remains active' };
  }
}
