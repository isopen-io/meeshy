import { describe, expect, test } from 'bun:test';

import {
  auditKitRegistry,
  boardViewIds,
  candidatePaths,
  catalogueProblems,
  expectedStems,
  imageStem,
  KIT_BOARD_ID,
  kitLotsOf,
  lotProblems,
  variantsOf,
  witnessPath,
  type KitAuditEntry,
  type KitLot,
} from './kit-registry-audit.mjs';

const TARGET = 'apps/web/src/components/kit/meeshy-glass-button.tsx';
const WITNESS = 'apps/web/src/components/kit/meeshy-glass-button.test.tsx';
const LOT: KitLot = { key: 'K02', name: 'MeeshyGlassButton', target: TARGET };

const entry = (states: KitAuditEntry['states']): KitAuditEntry => ({ key: 'K02', name: 'MeeshyGlassButton', states });
const state = (id: string, extra: Partial<KitAuditEntry['states'][number]> = {}): KitAuditEntry['states'][number] => ({
  id,
  boardView: null,
  isTouchable: false,
  ...extra,
});

const imagesOf = (name: string, states: KitAuditEntry['states']): readonly string[] => expectedStems(states).map((stem) => `${name}/${stem}.png`);
const CATALOGUE_IMAGES = imagesOf('Catalogue', [{ id: 'vide', boardView: null, isTouchable: false }]);

describe('le registre du kit, côté web', () => {
  test('lit la cible web et le nom de chaque lot de type kit', () => {
    const lots = kitLotsOf({
      lots: [
        { cle: 'K00', type: 'socle', nom: 'Catalogue', cible_web: 'apps/web/src/components/kit/' },
        { cle: 'K02', type: 'kit', nom: 'MeeshyGlassButton', cible_web: TARGET },
        { cle: 'I1', type: 'integration' },
      ],
    });
    expect(lots).toEqual([LOT]);
  });

  test('le témoin d’un composant est son jumeau .test.tsx', () => {
    expect(witnessPath(TARGET)).toBe(WITNESS);
    expect(candidatePaths([LOT])).toEqual([TARGET, WITNESS]);
  });

  test('les noms d’image portent la variante et la largeur', () => {
    expect(imageStem({ id: 'actif', variant: 'presse', width: 390 })).toBe('actif.presse-390');
    expect(variantsOf({ isTouchable: true })).toEqual(['clair', 'sombre', 'presse']);
    expect(variantsOf({ isTouchable: false })).toEqual(['clair', 'sombre']);
  });

  test('la planche sous la largeur compacte porte la grande police et le RTL', () => {
    const stems = expectedStems([state('repos')]);
    expect(stems).toContain(`${KIT_BOARD_ID}.grande-police-390`);
    expect(stems).toContain(`${KIT_BOARD_ID}.rtl-390`);
    expect(stems.filter((stem) => stem.startsWith('repos.'))).toEqual([
      'repos.clair-390',
      'repos.clair-820',
      'repos.clair-1440',
      'repos.sombre-390',
      'repos.sombre-820',
      'repos.sombre-1440',
    ]);
  });

  test('les vues de la planche se lisent dans sa table S', () => {
    const html = "const S=[\n{h:'a',b:[\n{id:'R1',t:'x'},{id:'A2',t:'y'}]},{h:'b',b:[{id:'C1',t:'z'}]}];";
    expect([...boardViewIds(html)].sort()).toEqual(['A2', 'C1', 'R1']);
    expect(() => boardViewIds('<html></html>')).toThrow();
  });

  const problems = (entryUnderTest: KitAuditEntry, existing: readonly string[], images: readonly string[], known: readonly string[] = ['R1']) =>
    lotProblems({ lot: LOT, entry: entryUnderTest, boardViewIds: new Set(known), disk: { existing: new Set(existing), images } });

  test('cible absente, entrée vide : en règle', () => {
    expect(problems(entry([]), [], [])).toEqual([]);
  });

  test('cible absente, entrée garnie : un problème qui nomme la clé', () => {
    const found = problems(entry([state('repos')]), [], []);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('K02');
  });

  test('cible présente, entrée vide : un problème', () => {
    expect(problems(entry([]), [TARGET, WITNESS], [])).toHaveLength(1);
  });

  test('cible présente sans témoin : le témoin est nommé', () => {
    const found = problems(entry([state('repos')]), [TARGET], imagesOf('MeeshyGlassButton', [state('repos')]));
    expect(found.some((line) => line.includes(WITNESS))).toBe(true);
  });

  test('tout présent : en règle', () => {
    const states = [state('repos', { boardView: 'R1' }), state('actif', { isTouchable: true })];
    expect(problems(entry(states), [TARGET, WITNESS], imagesOf('MeeshyGlassButton', states))).toEqual([]);
  });

  test('l’image pressée manquante est nommée', () => {
    const states = [state('actif', { isTouchable: true })];
    const images = imagesOf('MeeshyGlassButton', states).filter((image) => !image.includes('actif.presse-390'));
    const found = problems(entry(states), [TARGET, WITNESS], images);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('actif.presse-390');
  });

  test('une vue inconnue de la planche est un problème', () => {
    const states = [state('repos', { boardView: 'Z9' })];
    const found = problems(entry(states), [TARGET, WITNESS], imagesOf('MeeshyGlassButton', states));
    expect(found.some((line) => line.includes('Z9'))).toBe(true);
  });

  test('le catalogue lui-même doit porter les images de son état vide', () => {
    expect(catalogueProblems({ images: CATALOGUE_IMAGES })).toEqual([]);
    expect(catalogueProblems({ images: [] })).toHaveLength(CATALOGUE_IMAGES.length);
  });

  test('les entrées qui ne suivent pas le registre sont un problème', () => {
    const found = auditKitRegistry({ lots: [LOT], entries: [], boardViewIds: new Set(), disk: { existing: new Set(), images: CATALOGUE_IMAGES } });
    expect(found).toEqual(["le catalogue ne porte pas les clés et les noms du registre, dans l'ordre"]);
  });
});
