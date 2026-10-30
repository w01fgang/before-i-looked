import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const temps: string[] = [];
function runsWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  temps.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads 2026-10-28 as 5 jobs and counts the cut-off last line as 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
  });

  it('counts log lines by status so the board can show retries that later passed', () => {
    expect(readNight('runs', '2026-10-28')?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps 3 retries and the last status of a job that recovered, with no stale error', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the error of a job whose last run failed', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'notes/backup');
    expect(row).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', retries: 0 });
  });

  it('keeps a row whose owner is null', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
  });

  it('returns null for a night with no file, so routes can answer 404', () => {
    expect(readNight('runs', '2026-10-01')).toBeNull();
  });

  it('returns null for a night that is not a YYYY-MM-DD date, so no path leaves runsDir', () => {
    const dir = runsWith({ 'x.jsonl': '{"at":"a","job":"j","status":"ok","owner":null}\n' });
    expect(readNight(dir, 'x')).toBeNull();
    expect(readNight('runs', '../runs/2026-10-28')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    const dir = runsWith({ '2026-11-01.jsonl': '' });
    expect(readNight(dir, '2026-11-01')).toEqual({
      night: '2026-11-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts valid JSON with the wrong shape as a bad line, never as a job', () => {
    const dir = runsWith({
      '2026-11-02.jsonl': [
        '{"at":"2026-11-02T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-11-02T01:00:00+01:00","job":"b","status":"done","owner":"rook"}',
        '[1,2]',
        'null',
      ].join('\n'),
    });
    const night = readNight(dir, '2026-11-02');
    expect(night?.rows.map((r) => r.job)).toEqual(['a']);
    expect(night?.badLines).toBe(3);
  });
});
