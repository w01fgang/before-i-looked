import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const get = (night: string, cfg = config) => createApp(cfg).request(`/api/digest/${night}`);

describe('digest JSON', () => {
  it('lists the jobs of a night in the order the page shows them', async () => {
    const res = await get('2026-10-28');
    const body = (await res.json()) as NightDigest;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('reports the lines that did not parse so an agent can distrust the counts', async () => {
    const body = (await (await get('2026-10-28')).json()) as NightDigest;
    expect(body.badLines).toBe(1);
  });

  it('keeps the retry history of a job that recovered', async () => {
    const body = (await (await get('2026-10-28')).json()) as NightDigest;
    const row = body.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toMatchObject({
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
    });
  });

  it('sends a job without an owner as JSON null so agents do not read a dash as a name', async () => {
    const body = (await (await get('2026-10-28')).json()) as NightDigest;
    const row = body.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
  });

  it('answers 404 with the same message the page shows when the night has no log', async () => {
    const res = await get('2026-10-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for 2026-10-01' });
  });

  it('answers 200 with no rows for an empty log so it differs from a missing one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'digest-api-'));
    writeFileSync(join(dir, '2026-10-30.jsonl'), '');
    const res = await get('2026-10-30', { ...config, runsDir: dir });
    const body = (await res.json()) as NightDigest;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
  });
});
