import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

async function page(route: string, cfg = config) {
  const res = await createApp(cfg).request(route);
  return { status: res.status, html: await res.text() };
}

function rowOf(html: string, job: string): string {
  const m = html.match(new RegExp(`<tr[^>]*>(?:(?!</tr>).)*${job}(?:(?!</tr>).)*</tr>`));
  if (!m) throw new Error(`no row for ${job}`);
  return m[0];
}

function tmpNight(night: string, body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'digest-'));
  writeFileSync(join(dir, `${night}.jsonl`), body);
  return { ...config, runsDir: dir };
}

describe('digest page', () => {
  it('lists the five jobs of the night in job order so the reader scans a stable table', async () => {
    const { status, html } = await page('/digest/2026-10-28');
    expect(status).toBe(200);
    const jobs = [...html.matchAll(/<tr[^>]*><td>([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(jobs).toHaveLength(5);
    expect(jobs).toEqual([...jobs].sort());
    expect(jobs).toContain('digest/render');
  });

  it('marks the retry-heavy and the failed job and leaves lane/sync unmarked so only real trouble stands out', async () => {
    const { html } = await page('/digest/2026-10-28');
    const warned = [...html.matchAll(/<tr class="warn"><td>([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(warned.sort()).toEqual(['fixtures/refresh', 'notes/backup']);
    expect(rowOf(html, 'lane/sync')).not.toContain('class="warn"');
  });

  it('renders a null owner as a dash so no cell is empty', async () => {
    const { html } = await page('/digest/2026-10-28');
    expect(rowOf(html, 'digest/render')).toMatch(/digest\/render<\/td><td>—<\/td>/);
  });

  it('prints times with the stored +01:00 offset so the reader sees local night time', async () => {
    const { html } = await page('/digest/2026-10-28');
    expect(html).toContain('2026-10-28T23:00:06+01:00');
  });

  it('shows the bad-line count even when it is zero so a clean log is visible', async () => {
    const cfg = tmpNight('2026-11-01', '{"at":"2026-11-01T01:00:00+01:00","job":"a","status":"ok","owner":"x"}\n');
    const { html } = await page('/digest/2026-11-01', cfg);
    expect(html).toContain('bad lines: 0');
  });

  it('answers 404 with the shared message when the night has no run log', async () => {
    const { status, html } = await page('/digest/2026-10-01');
    expect(status).toBe(404);
    expect(html).toContain('no run log for 2026-10-01');
    expect(html).toContain('<header>');
  });

  it('says nothing ran for an empty log and still counts bad lines', async () => {
    const { status, html } = await page('/digest/2026-11-02', tmpNight('2026-11-02', ''));
    expect(status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
    expect(html).toContain('bad lines: 0');
  });
});
