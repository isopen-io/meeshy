import { describe, expect, test } from 'bun:test';

import { isOutsideKit, measureKitGlass, ratchetProblems } from './kit-glass-ratchet.mjs';

const source = (path: string, text: string) => ({ path, text });

describe('le cliquet du verre hors du kit', () => {
  test('compte chaque classe de verre d’un littéral, une fois', () => {
    const measured = measureKitGlass([source('src/a.tsx', `const A = <div className="glass px-4" />; const B = <div className={'glass-prominent glass-card'} />;`)]);
    expect(measured).toEqual({ calls: 3, files: 1, rounds: 0 });
  });

  test('un verre rond est un littéral qui porte aussi rounded-full ou le disque d’appel', () => {
    const measured = measureKitGlass([
      source('src/a.tsx', `const A = "glass rounded-full"; const B = "glass-call glass-call-disc"; const C = "glass rounded-card";`),
    ]);
    expect(measured).toEqual({ calls: 3, files: 1, rounds: 2 });
  });

  test('ignore les commentaires, les tests et le dossier du kit', () => {
    const measured = measureKitGlass([
      source('src/a.tsx', `// className="glass"\n/* "glass-card" */ const A = 1;`),
      source('src/a.test.tsx', `const A = "glass";`),
      source('src/components/kit/b.tsx', `const A = "glass rounded-full";`),
      source('src/a.ts', `const A = "glass";`),
    ]);
    expect(measured).toEqual({ calls: 0, files: 0, rounds: 0 });
  });

  test('un nom qui contient glass sans en être un n’est pas compté', () => {
    expect(measureKitGlass([source('src/a.tsx', `const A = "glassy not-glass glass-site glass-call-disc";`)])).toEqual({ calls: 0, files: 0, rounds: 0 });
  });

  test('isOutsideKit', () => {
    expect(isOutsideKit('src/components/kit/x.tsx')).toBe(false);
    expect(isOutsideKit('src/components/avatar.tsx')).toBe(true);
    expect(isOutsideKit('src/components/avatar.test.tsx')).toBe(false);
  });

  test('le plafond ne fait que descendre : au-dessus et en dessous échouent', () => {
    const ceiling = { calls: 10, files: 5, rounds: 2 };
    expect(ratchetProblems({ measured: ceiling, ceiling })).toEqual([]);
    expect(ratchetProblems({ measured: { calls: 11, files: 5, rounds: 2 }, ceiling })).toHaveLength(1);
    const below = ratchetProblems({ measured: { calls: 9, files: 5, rounds: 2 }, ceiling });
    expect(below).toHaveLength(1);
    expect(below[0]).toContain('abaisse');
  });
});
