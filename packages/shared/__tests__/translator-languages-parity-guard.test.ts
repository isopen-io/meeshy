import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHARED_ROOT = resolve(HERE, '..');
const SCRIPT = resolve(SHARED_ROOT, 'scripts/generate-translator-languages.ts');
const OUTPUT = resolve(
  SHARED_ROOT,
  '../../services/translator/src/config/generated_languages.py'
);

const runCheck = (): { status: number; output: string } => {
  try {
    const output = execFileSync('npx', ['tsx', SCRIPT, '--check'], {
      cwd: SHARED_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number | null; stdout: string; stderr: string };
    return { status: err.status ?? 1, output: `${err.stdout}${err.stderr}` };
  }
};

/**
 * GARDE DE PARITÉ EN CI (critère de fin de #3658, moitié restante).
 *
 * `generated_languages.py` est écrit à la main comme un vrai fichier tracké
 * (pas un artefact de build) : rien n'empêchait un éditeur de le retoucher
 * directement, ou `packages/shared/utils/language-codes.ts` d'évoluer sans
 * que quiconque relance `translator-languages:generate`. Jumeau exact de
 * `generate-from-ios.mjs --check` (packages/design-tokens), qui pose la même
 * garde pour la palette dérivée de Swift.
 */
describe('generate-translator-languages --check (#3658)', () => {
  it('réussit quand generated_languages.py est à jour avec language-codes.ts', () => {
    const { status } = runCheck();
    expect(status).toBe(0);
  });

  it('échoue quand generated_languages.py a dérivé de sa source', () => {
    const original = readFileSync(OUTPUT, 'utf8');
    expect(original).toContain('"en",');
    writeFileSync(OUTPUT, original.replace('"en",', '"xx",'));
    try {
      const { status, output } = runCheck();
      expect(status).not.toBe(0);
      expect(output).toContain('DÉRIVÉ');
    } finally {
      writeFileSync(OUTPUT, original);
    }
  });

  it('échoue si generated_languages.py est absent', () => {
    const original = readFileSync(OUTPUT, 'utf8');
    rmSync(OUTPUT);
    try {
      const { status } = runCheck();
      expect(status).not.toBe(0);
    } finally {
      writeFileSync(OUTPUT, original);
    }
  });
});
