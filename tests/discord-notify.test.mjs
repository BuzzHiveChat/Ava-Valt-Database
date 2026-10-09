import test from 'node:test';
import assert from 'node:assert/strict';
import {reportCommittedImport} from '../website-integration/report-import.mjs';
import {notifyAvaValtImportComplete} from '../website-integration/notify-ava-valt.mjs';

const snapshot = () => ({
  url: process.env.AVA_VALT_BOT_WEBHOOK_URL,
  secret: process.env.AVA_VALT_BOT_WEBHOOK_SECRET,
  fetch: globalThis.fetch
});
function restore(s) {
  if (s.url === undefined) delete process.env.AVA_VALT_BOT_WEBHOOK_URL;
  else process.env.AVA_VALT_BOT_WEBHOOK_URL = s.url;
  if (s.secret === undefined) delete process.env.AVA_VALT_BOT_WEBHOOK_SECRET;
  else process.env.AVA_VALT_BOT_WEBHOOK_SECRET = s.secret;
  globalThis.fetch = s.fetch;
}

test('disabled webhook: no network request and importer remains successful', async () => {
  const s = snapshot();
  try {
    delete process.env.AVA_VALT_BOT_WEBHOOK_URL;
    delete process.env.AVA_VALT_BOT_WEBHOOK_SECRET;
    globalThis.fetch = () => { throw new Error('unexpected network request'); };
    const result = await reportCommittedImport('auto');
    assert.equal(result.skipped, true);
  } finally { restore(s); }
});

test('configured webhook: send authenticated completion event with stable-form ID', async () => {
  const s = snapshot();
  try {
    process.env.AVA_VALT_BOT_WEBHOOK_URL = 'https://example.org/api/import-complete';
    process.env.AVA_VALT_BOT_WEBHOOK_SECRET = 'fake-test-secret-not-real';
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, process.env.AVA_VALT_BOT_WEBHOOK_URL);
      assert.equal(options.headers.Authorization, 'Bearer fake-test-secret-not-real');
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.equal(body.event, 'import.completed');
      assert.match(body.runId, /^manual_[a-f0-9-]{36}$/);
      return {ok:true, json: async()=>({ok:true,queued:true})};
    };
    const result=await reportCommittedImport('manual');
    assert.equal(result.queued,true);
    assert.equal(calls,1);
  } finally { restore(s); }
});

test('unreachable endpoint: notification error does not throw to import workflow', async () => {
  const s = snapshot();
  try {
    process.env.AVA_VALT_BOT_WEBHOOK_URL='https://example.org/api/import-complete';
    process.env.AVA_VALT_BOT_WEBHOOK_SECRET='fake-test-secret-not-real';
    globalThis.fetch=async()=>{throw new Error('simulated network failure')};
    const result=await reportCommittedImport('auto');
    assert.equal(result.skipped,true);
  } finally { restore(s); }
});

test('HTTP URL is rejected without contacting server', async () => {
  const s = snapshot();
  try {
    process.env.AVA_VALT_BOT_WEBHOOK_URL='http://example.org/api/import-complete';
    process.env.AVA_VALT_BOT_WEBHOOK_SECRET='fake-test-secret-not-real';
    globalThis.fetch=async()=>{throw new Error('unexpected request')};
    await assert.rejects(notifyAvaValtImportComplete('test_123'), /HTTPS/);
  } finally { restore(s); }
});
