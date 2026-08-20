import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

const DIR = join(__dirname, '../../../../../../../packages/shared/fixtures/canvas-v3');

describe('canvas-v3 fixtures (le gel inter-lots)', () => {
  it('every v3 fixture parses strictly', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('v1-') && !f.endsWith('.v3.json'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const raw = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
      const res = CanvasV3Schema.safeParse(raw);
      expect(res.success ? true : { f, issues: res.error.issues }).toBe(true);
    }
  });

  it('the v1 legacy fixture does NOT parse as v3 (it feeds the converter)', () => {
    const raw = JSON.parse(readFileSync(join(DIR, 'v1-legacy-full.json'), 'utf8'));
    expect(CanvasV3Schema.safeParse(raw).success).toBe(false);
  });
});
