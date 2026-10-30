import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const line = (job: string, status: string, at: string) => JSON.stringify({ at, job, status, owner: 'rook' });

const NORMAL = [
  line('notes/backup', 'ok', '2026-10-28T01:00:00+01:00'),
  line('digest/render', 'retry', '2026-10-28T02:00:00+01:00'),
  line('digest/render', 'ok', '2026-10-28T02:05:00+01:00'),
  line('lane/sync', 'fail', '2026-10-28T03:00:00+01:00'),
].join('\n');

const BAD_LINE = [
  line('notes/backup', 'ok', '2026-10-27T01:00:00+01:00'),
  line('digest/render', 'ok', '2026-10-27T02:00:00+01:00'),
  '{"at":"2026-10-27T03:00:00+01:00","job":"lane/sy',
].join('\n');

const temps: string[] = [];

function fixtures() {
  const dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  temps.push(dir);
  writeFileSync(join(dir, '2026-10-28.jsonl'), NORMAL);
  writeFileSync(join(dir, '2026-10-26.jsonl'), '');
  writeFileSync(join(dir, '2026-10-27.jsonl'), BAD_LINE);
  return createApp({ ...config, runsDir: dir });
}

function pageJobs(html: string): string[] {
  const body = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  return [...body.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]!.replace(/<[^>]*>/g, '').trim());
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest page', () => {
  it('answers 200 with a table of the jobs for a night that has a run log, so the reader sees the night', async () => {
    const res = await fixtures().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table');
    expect(pageJobs(html)).toEqual(['digest/render', 'lane/sync', 'notes/backup']);
    expect(html).toContain('bad lines: 0');
  });

  it('answers 404 with the night named for a night with no run log, so a reader sees no empty page', async () => {
    const res = await fixtures().request('/digest/2026-10-20');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2026-10-20');
  });

  it('says nothing ran for an empty log file, so silence is not read as a missing night', async () => {
    const res = await fixtures().request('/digest/2026-10-26');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).toContain('bad lines: 0');
  });

  it('still lists the good jobs and counts the cut-off line, so one bad line does not hide the night', async () => {
    const res = await fixtures().request('/digest/2026-10-27');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('bad lines: 1');
    expect(pageJobs(html)).toEqual(['digest/render', 'notes/backup']);
  });
});

describe('digest json', () => {
  it('answers 200 with the night digest exactly as readNight returns it', async () => {
    const res = await fixtures().request('/api/digest/2026-10-28');
    const body = (await res.json()) as NightDigest;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync', 'notes/backup']);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
  });

  it('answers 404 with an error body for a night with no run log, so a client can tell it from an empty night', async () => {
    const res = await fixtures().request('/api/digest/2026-10-20');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for 2026-10-20' });
  });

  it('answers 200 with no rows for an empty log file, so an empty night is not an error', async () => {
    const res = await fixtures().request('/api/digest/2026-10-26');
    const body = (await res.json()) as NightDigest;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('still lists the good jobs and reports badLines 1 for a night with a cut-off line', async () => {
    const res = await fixtures().request('/api/digest/2026-10-27');
    const body = (await res.json()) as NightDigest;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'notes/backup']);
  });
});

describe('digest page and json together', () => {
  it.each(['2026-10-28', '2026-10-27'])(
    'lists the same jobs in the same order on the page and in the json for %s, so the two views never disagree',
    async (night) => {
      const app = fixtures();
      const html = await (await app.request(`/digest/${night}`)).text();
      const body = (await (await app.request(`/api/digest/${night}`)).json()) as NightDigest;
      expect(body.rows.length).toBeGreaterThan(0);
      expect(pageJobs(html)).toEqual(body.rows.map((r) => r.job));
    },
  );
});
