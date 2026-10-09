/**
 * Website importer → Ava-Valt Discord bot, server-side only.
 * Call AFTER avatar-index.json is successfully committed to GitHub.
 * Never import this helper into browser/client components.
 */
export async function notifyAvaValtImportComplete(runId) {
  const url = process.env.AVA_VALT_BOT_WEBHOOK_URL;
  const secret = process.env.AVA_VALT_BOT_WEBHOOK_SECRET;
  if (!url || !secret) return { skipped: true, reason: 'Importer webhook is not configured' };
  if (!url.startsWith('https://')) throw new Error('Ava-Valt bot endpoint must use HTTPS');
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(runId)) {
    throw new Error('runId must be a stable unique import identifier (letters, digits, underscore or dash)');
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ event: 'import.completed', runId }),
    // Avoid adding a long delay to a Vercel function that may already be
    // close to its maxDuration limit. GitHub polling is the safe fallback.
    signal: AbortSignal.timeout(3500),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Ava-Valt bot webhook returned HTTP ${response.status}`);
  return response.json();
}
