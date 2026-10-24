/**
 * #11257 — les scripts de charge du chantier média (k6) sont DANS le dépôt :
 * un script ignoré par `tests/.gitignore` (`*.js`) n'existe pas pour la CI ni
 * pour une autre session. Le témoin vérifie trois choses : chaque script est
 * présent, n'est pas ignoré par git, et joue le scénario que le critère nomme
 * (un upload de 5 Mo, un vocal de 30 s).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(__dirname, '../../../../../..');
const UPLOAD_SCRIPT = 'tests/load/media-upload.js';
const VOICE_SCRIPT = 'tests/load/vocal-30s.js';

const readScript = (relativePath: string): string => readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');

const isIgnoredByGit = (relativePath: string): boolean => {
  const result = spawnSync('git', ['check-ignore', '-q', relativePath], { cwd: REPO_ROOT });
  return result.status === 0;
};

describe('scripts de charge k6 (#11257)', () => {
  it('sont suivis par git, et non ignorés par tests/.gitignore', () => {
    expect(isIgnoredByGit(UPLOAD_SCRIPT)).toBe(false);
    expect(isIgnoredByGit(VOICE_SCRIPT)).toBe(false);
  });

  it('media-upload joue un upload multipart de 5 Mo sur la route d’upload des pièces jointes', () => {
    const script = readScript(UPLOAD_SCRIPT);
    expect(script).toContain('export default');
    expect(script).toContain('/api/v1/attachments/upload');
    expect(script).toContain('5 * 1024 * 1024');
    expect(script).toContain('http.post');
  });

  it('vocal-30s joue un vocal de 30 secondes jusqu’au message qui le porte', () => {
    const script = readScript(VOICE_SCRIPT);
    expect(script).toContain('export default');
    expect(script).toContain('/api/v1/attachments/upload');
    expect(script).toContain('/api/v1/conversations/');
    expect(script).toContain('attachmentIds');
    expect(script).toContain('VOICE_SECONDS = 30');
  });
});
