import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeEnough, FLOAT_TOLERANCE, loadVectors, runVectors } from './harness.js';

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
