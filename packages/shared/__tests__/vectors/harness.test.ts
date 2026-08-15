import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { caseTestName, closeEnough, FLOAT_TOLERANCE, loadVectors, runVectors } from './harness.js';

// Fixtures temporaires HORS DÉPÔT — jamais sous packages/shared/fixtures/.
const tempDir = mkdtempSync(join(tmpdir(), 'meeshy-vectors-harness-'));
const runVectorsDir = mkdtempSync(join(tmpdir(), 'meeshy-vectors-harness-run-'));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(runVectorsDir, { recursive: true, force: true });
});

describe('loadVectors — les trois échecs de la leçon 257', () => {
  it('lève une erreur explicite si le fichier de vecteurs est ABSENT', () => {
    expect(() => loadVectors('does-not-exist', { baseDir: tempDir })).toThrow(/introuvable/);
  });

  it('lève une erreur explicite si le fichier est VIDE (JSON invalide)', () => {
    writeFileSync(join(tempDir, 'empty.vectors.json'), '');
    expect(() => loadVectors('empty', { baseDir: tempDir })).toThrow(/JSON invalide/);
  });

  it('lève une erreur explicite si le tableau contient ZÉRO CAS', () => {
    writeFileSync(join(tempDir, 'zero-cases.vectors.json'), '[]');
    expect(() => loadVectors('zero-cases', { baseDir: tempDir })).toThrow(/ZÉRO cas/);
  });

  it("lève une erreur explicite si le JSON n'est pas un tableau", () => {
    writeFileSync(join(tempDir, 'not-array.vectors.json'), JSON.stringify({ input: 1, expected: 1 }));
    expect(() => loadVectors('not-array', { baseDir: tempDir })).toThrow(/tableau JSON/);
  });

  it("lève une erreur explicite si un cas n'a pas la forme { input, expected }", () => {
    writeFileSync(join(tempDir, 'malformed.vectors.json'), JSON.stringify([{ foo: 'bar' }]));
    expect(() => loadVectors('malformed', { baseDir: tempDir })).toThrow(/input, expected/);
  });
});

describe('loadVectors — en-tête $format (RÉSERVE 6, revue REV-1)', () => {
  it('charge les cas depuis un objet { $format, vectors: [...] }, $format ignorée par la comparaison', () => {
    writeFileSync(
      join(tempDir, 'with-format.vectors.json'),
      JSON.stringify({
        $format: { hex: '#RRGGBB', provenance: 'exemple' },
        vectors: [{ input: 1, expected: 2 }],
      }),
    );

    const vectors = loadVectors<number, number>('with-format', { baseDir: tempDir });

    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toEqual({ input: 1, expected: 2 });
  });

  it('un objet SANS clé "vectors" échoue toujours avec le message "tableau JSON" (rétrocompatibilité stricte)', () => {
    writeFileSync(join(tempDir, 'no-vectors-key.vectors.json'), JSON.stringify({ input: 1, expected: 1 }));
    expect(() => loadVectors('no-vectors-key', { baseDir: tempDir })).toThrow(/tableau JSON/);
  });

  it('un objet avec "vectors" pointant vers un ZÉRO cas échoue toujours (leçon 257)', () => {
    writeFileSync(join(tempDir, 'format-zero.vectors.json'), JSON.stringify({ $format: {}, vectors: [] }));
    expect(() => loadVectors('format-zero', { baseDir: tempDir })).toThrow(/ZÉRO cas/);
  });
});

describe('loadVectors — chemin nominal', () => {
  it('charge un fichier de 2 cas {input, expected}, dont un flottant à 1e-4', () => {
    writeFileSync(
      join(tempDir, 'nominal.vectors.json'),
      JSON.stringify([
        { input: { distance: 400, variant: 'thread' }, expected: { alpha: 0.18 } },
        { input: { distance: 520, variant: 'list' }, expected: { alpha: 0.55009 } },
      ]),
    );

    const vectors = loadVectors<
      { readonly distance: number; readonly variant: string },
      { readonly alpha: number }
    >('nominal', { baseDir: tempDir });

    expect(vectors).toHaveLength(2);
    expect(vectors[0]?.input).toEqual({ distance: 400, variant: 'thread' });
    // 0.55009 est à 9e-5 de 0.55 — dans la tolérance 1e-4, pas une égalité stricte.
    expect(closeEnough(vectors[1]?.expected.alpha, 0.55)).toBe(true);
    expect(vectors[1]?.expected.alpha).not.toBe(0.55);
  });
});

describe('closeEnough', () => {
  it('accepte deux nombres à 1e-4 près', () => {
    expect(closeEnough(0.18, 0.18 + FLOAT_TOLERANCE)).toBe(true);
    expect(closeEnough(0.18, 0.18009)).toBe(true);
  });

  it('rejette deux nombres au-delà de 1e-4', () => {
    expect(closeEnough(0.18, 0.1802)).toBe(false);
  });

  it('compare récursivement objets et tableaux, clés dans un ordre indifférent', () => {
    expect(closeEnough({ b: 2.00001, a: 1 }, { a: 1.00002, b: 2 })).toBe(true);
    expect(closeEnough([1, { x: 0.30001 }], [1, { x: 0.3 }])).toBe(true);
    expect(closeEnough({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('compare le reste (chaînes, booléens, null) par égalité stricte', () => {
    expect(closeEnough('fr', 'fr')).toBe(true);
    expect(closeEnough('fr', 'en')).toBe(false);
    expect(closeEnough(null, null)).toBe(true);
    expect(closeEnough(true, false)).toBe(false);
  });
});

describe('runVectors', () => {
  it('propage l\'erreur ZÉRO cas de loadVectors sans jamais déclarer de test', () => {
    writeFileSync(join(tempDir, 'run-zero.vectors.json'), '[]');
    expect(() => runVectors('run-zero', (n: number) => n, { baseDir: tempDir })).toThrow(/ZÉRO cas/);
  });

  // Enregistrement réel : prouve que runVectors déclare un `it()` par cas et compare
  // via closeEnough (le second cas n'est vrai qu'avec la tolérance 1e-4).
  writeFileSync(
    join(runVectorsDir, 'double.vectors.json'),
    JSON.stringify([
      { input: 2, expected: 4 },
      { input: 3, expected: 6.00007 },
    ]),
  );
  runVectors<number, number>('double', (n) => n * 2, { baseDir: runVectorsDir });
});

describe('caseTestName — nommage `case N — <_label>` (RÉSERVE 8, revue REV-1)', () => {
  it('utilise `case N — <_label>` quand `_label` est présent', () => {
    expect(caseTestName(0, { input: 1, expected: 1, _label: 'diffDays 6 vs 7' })).toBe(
      'case 0 — diffDays 6 vs 7',
    );
  });

  it('retombe sur `case N` (rétrocompatible) quand `_label` est absent', () => {
    expect(caseTestName(2, { input: 1, expected: 1 })).toBe('case 2');
  });
});

describe('runVectors — nommage `case N — <_label>` (RÉSERVE 8, revue REV-1)', () => {
  const labelDir = mkdtempSync(join(tmpdir(), 'meeshy-vectors-harness-label-'));
  afterAll(() => rmSync(labelDir, { recursive: true, force: true }));

  // Enregistrement réel, comme la suite `double` ci-dessus : mélange volontairement
  // un cas AVEC `_label` et un cas SANS, pour prouver que le nommage reste
  // rétrocompatible (fixtures existantes, jamais de `_label`) tout en adoptant le
  // libellé dès qu'il est fourni.
  writeFileSync(
    join(labelDir, 'triple.vectors.json'),
    JSON.stringify([
      { input: 3, expected: 9, _label: 'carré de 3' },
      { input: 4, expected: 16 },
    ]),
  );
  runVectors<number, number>('triple', (n) => n * n, { baseDir: labelDir });
});
