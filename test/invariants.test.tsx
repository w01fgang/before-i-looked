import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const htmlRoutes = ['/'];

function runsDigest(dir: string): string {
  const hash = createHash('sha256');
  for (const f of readdirSync(dir).sort()) hash.update(f).update(readFileSync(join(dir, f)));
  return hash.digest('hex');
}

describe('invariants of the primitives map', () => {
  it.each(htmlRoutes)('%s shows the lane banner so a copy names its lane', async (route) => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const html = await (await createApp(config).request(route)).text();
    expect(html).toContain('lane-07');
    expect(html).toContain('TEST-MARKER');
  });

  it.each(htmlRoutes)('%s renders no script element because pages carry no client JS', async (route) => {
    const html = await (await createApp(config).request(route)).text();
    expect(html).not.toMatch(/<script/i);
  });

  it('leaves runs/ byte for byte unchanged after every HTML route is served', async () => {
    const before = runsDigest(config.runsDir);
    for (const route of htmlRoutes) await createApp(config).request(route);
    expect(runsDigest(config.runsDir)).toBe(before);
  });
});
