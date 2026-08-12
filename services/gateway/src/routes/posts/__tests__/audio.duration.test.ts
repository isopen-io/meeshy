import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** L'écrêtage `Math.min(durationRaw, 60)` ne rejetait rien : il enregistrait
 *  60 s pour un son de trois minutes. Métadonnée corrompue, pas garde-fou. */
describe('routes/posts/audio.ts — durée', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'audio.ts'), 'utf-8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('test_audioRoute_hasNoDurationCap', () => {
    expect(code).not.toContain('MAX_AUDIO_DURATION_SEC');
  });

  it('test_audioRoute_uploadDirDefault_isNotTmp', () => {
    expect(code).not.toContain('/tmp/meeshy-uploads');
  });
});
