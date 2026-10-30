import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the lane banner and the nights on disk', async () => {
    vi.stubEnv('LANE_MARKER', 'TEST-MARKER');
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest so the board leads to the page', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
  });

  it('shows the ok, retry and fail counts of a night with failures', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('ok 10 · retry 4 · fail 1');
  });

  it('shows zero retry and fail counts for a clean night', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('ok 7 · retry 0 · fail 0');
  });

  it('lists a night whose log cannot be read with a dash for its counts, so the night stays visible', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    mkdirSync(join(tmp, '2026-11-05.jsonl'));
    try {
      const html = await (await createApp({ ...config, runsDir: tmp }).request('/')).text();
      expect(html).toMatch(/<a href="\/digest\/2026-11-05">2026-11-05<\/a>\s*—/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    vi.stubEnv('LANE_ID', undefined);
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
