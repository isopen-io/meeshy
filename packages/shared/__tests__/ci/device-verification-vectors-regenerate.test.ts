// packages/shared/__tests__/ci/device-verification-vectors-regenerate.test.ts
//
// #19153 (#18906) — les vecteurs de la COMPARAISON d'un appareil par code court se
// RÉGÉNÈRENT à l'octet depuis le dépôt seul : le script relit la table amont versée
// (`upstream/`), rejoue RFC 5869 A.1 et A.3 par trois chemins, et `--check` compare ce
// qu'il produit aux trois fichiers versés. Un fichier retouché à la main, ou un script
// qui diverge de ses fichiers, rougit ici. Le registre de confiance (§ 6 de la spec,
// `trust-ledger-v1.cases.json`) n'est pas encore versé : il arrive avec le lot 0b.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = join(SHARED, 'fixtures', 'e2ee-device-verification');
const SCRIPT = join(SHARED, 'scripts', 'generate-device-verification-vectors.mjs');
const UPSTREAM_TABLE_SHA256 = '2b4defb276d61f11cb9cbfb0ba326b96a8dbd9e768e6bc53fa0f565cd598e887';
const UPSTREAM_LICENSE_SHA256 = '0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594';
const LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'pt-BR', 'ar'] as const;

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const runCheck = (script: string, cwd: string) => spawnSync('node', [script, '--check'], { cwd, encoding: 'utf8', timeout: 120_000 });

/** Une copie du script et de ses fixtures, pour prouver le rouge sans toucher au dépôt. */
function copiedTree(): { readonly root: string; readonly script: string; readonly fixtures: string } {
  const root = mkdtempSync(join(tmpdir(), 'device-verification-check-'));
  const fixtures = join(root, 'fixtures', 'e2ee-device-verification');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(SCRIPT, join(root, 'scripts', 'generate-device-verification-vectors.mjs'));
  cpSync(FIXTURES, fixtures, { recursive: true });
  return { root, script: join(root, 'scripts', 'generate-device-verification-vectors.mjs'), fixtures };
}

describe('vecteurs de la comparaison d’un appareil par code (#19153)', () => {
  it('le script régénère les trois fichiers à l’octet, sans réseau', () => {
    const run = runCheck(SCRIPT, SHARED);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('--check : les trois fichiers versés sont identiques à l’octet');
  }, 130_000);

  it('un octet retouché dans un fichier versé fait échouer --check, en nommant le fichier', () => {
    const tree = copiedTree();
    try {
      const path = join(tree.fixtures, 'sas-v1.vectors.json');
      writeFileSync(path, readFileSync(path, 'utf8').replace('9780485edff4', '9780485edff5'));
      const run = runCheck(tree.script, tree.root);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('sas-v1.vectors.json');
    } finally {
      rmSync(tree.root, { recursive: true, force: true });
    }
  }, 130_000);

  it('une table amont qui n’est pas la copie conforme relevée arrête le script', () => {
    const tree = copiedTree();
    try {
      const path = join(tree.fixtures, 'upstream', 'matrix-sas-emoji.json');
      writeFileSync(path, readFileSync(path, 'utf8').replace('"Dog"', '"Hound"'));
      const run = runCheck(tree.script, tree.root);
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('source matrix-spec inattendue');
    } finally {
      rmSync(tree.root, { recursive: true, force: true });
    }
  }, 130_000);

  it('la table amont versée est la copie conforme relevée, et sa licence le texte Apache-2.0 amont', () => {
    expect(sha256(join(FIXTURES, 'upstream', 'matrix-sas-emoji.json'))).toBe(UPSTREAM_TABLE_SHA256);
    expect(sha256(join(FIXTURES, 'upstream', 'LICENSE'))).toBe(UPSTREAM_LICENSE_SHA256);
    expect(sha256(join(FIXTURES, 'LICENSE-sas-emoji.txt'))).toBe(UPSTREAM_LICENSE_SHA256);
    expect(readFileSync(join(FIXTURES, 'upstream', 'NOTICE.md'), 'utf8')).toContain(UPSTREAM_TABLE_SHA256);
  });

  it('la table dérivée dit sa source, sa modification par Meeshy et sa licence, et nomme 64 symboles dans les sept langues', () => {
    const table = readJson('sas-emoji-v1.json') as {
      readonly _doc: string;
      readonly source: { readonly sha256: string; readonly license: string };
      readonly modified: { readonly by: string; readonly changes: readonly string[] };
      readonly license: { readonly spdx: string; readonly file: string };
      readonly emoji: readonly { readonly number: number; readonly emoji: string; readonly names: Record<string, string> }[];
    };
    expect(table._doc).toContain('modifiée par Meeshy le 2026-11-17');
    expect(table.source).toMatchObject({ sha256: UPSTREAM_TABLE_SHA256, license: 'Apache-2.0' });
    expect(table.modified.by).toBe('Meeshy');
    expect(table.modified.changes.length).toBeGreaterThan(0);
    expect(table.license).toEqual({ spdx: 'Apache-2.0', file: 'LICENSE-sas-emoji.txt' });
    expect(table.emoji.map((entry) => entry.number)).toEqual(Array.from({ length: 64 }, (_, index) => index));
    table.emoji.forEach((entry) => {
      expect(Object.keys(entry.names).sort()).toEqual([...LANGUAGES].sort());
      LANGUAGES.forEach((language) => expect(entry.names[language]?.length ?? 0).toBeGreaterThan(0));
    });
  });

  it('le fichier des vecteurs porte la comparaison seule, sous sa forme publiée', () => {
    const file = readJson('sas-v1.vectors.json') as Record<string, readonly unknown[] | unknown>;
    expect(file.protocol).toBe('meeshy-device-verification:v1');
    expect(Object.keys(file).sort()).toEqual(['_doc', 'negatives', 'options', 'primitives', 'properties', 'protocol', 'rfc5869', 'vectors'].sort());
    expect((file.rfc5869 as readonly { name: string }[]).map((vector) => vector.name)).toEqual(['rfc5869-A.1', 'rfc5869-A.3']);
    expect((file.vectors as readonly unknown[]).length).toBe(4);
    expect((file.properties as readonly unknown[]).length).toBe(2);
    expect((file.negatives as readonly unknown[]).length).toBe(18);
    expect((file.options as readonly { name: string }[]).map((option) => option.name)).toEqual(['carre-du-code-vecteur-1', 'carre-de-l-accuse-vecteur-1']);
  });
});
