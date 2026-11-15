import { describe, expect, test } from 'bun:test';

import { OPUS_MT_LANGUAGES, opusMtRoute, opusMtSupports } from './opus-mt-routes';

const models = (source: string, target: string): readonly string[] => opusMtRoute(source, target).map((hop) => hop.model.replace('Xenova/opus-mt-', ''));

describe('opusMtRoute — quels modèles Opus-MT traduisent une paire (#9898)', () => {
  test('la même langue ne se traduit pas', () => {
    expect(opusMtRoute('fr', 'fr')).toEqual([]);
  });

  test('une paire directe est un seul saut, sans jeton de langue', () => {
    expect(opusMtRoute('fr', 'es')).toEqual([{ model: 'Xenova/opus-mt-fr-es', prefix: '' }]);
    for (const pair of ['fr>es', 'es>fr', 'fr>de', 'de>fr', 'es>de', 'de>es', 'it>fr', 'es>it', 'it>es']) {
      const [source = '', target = ''] = pair.split('>');
      expect(models(source, target)).toEqual([`${source}-${target}`]);
    }
  });

  test('depuis l’anglais : un saut, vers chaque langue', () => {
    expect(models('en', 'fr')).toEqual(['en-fr']);
    expect(models('en', 'es')).toEqual(['en-es']);
    expect(models('en', 'de')).toEqual(['en-de']);
    expect(models('en', 'it')).toEqual(['en-it']);
  });

  test('vers l’anglais : un saut, depuis chaque langue', () => {
    expect(models('fr', 'en')).toEqual(['fr-en']);
    expect(models('es', 'en')).toEqual(['es-en']);
    expect(models('de', 'en')).toEqual(['de-en']);
    expect(models('it', 'en')).toEqual(['it-en']);
    expect(models('ar', 'en')).toEqual(['ar-en']);
  });

  test('l’arabe et le portugais n’ont qu’un modèle multi-cibles : le jeton de langue précède le texte', () => {
    expect(opusMtRoute('en', 'ar')).toEqual([{ model: 'Xenova/opus-mt-en-ar', prefix: '>>ara<< ' }]);
    expect(opusMtRoute('en', 'pt')).toEqual([{ model: 'Xenova/opus-mt-en-ROMANCE', prefix: '>>pt<< ' }]);
    expect(opusMtRoute('pt', 'en')).toEqual([{ model: 'Xenova/opus-mt-ROMANCE-en', prefix: '' }]);
  });

  test('sans modèle direct, la paire passe par l’anglais : deux sauts', () => {
    expect(models('fr', 'it')).toEqual(['fr-en', 'en-it']);
    expect(models('de', 'it')).toEqual(['de-en', 'en-it']);
    expect(opusMtRoute('de', 'ar')).toEqual([
      { model: 'Xenova/opus-mt-de-en', prefix: '' },
      { model: 'Xenova/opus-mt-en-ar', prefix: '>>ara<< ' },
    ]);
    expect(opusMtRoute('fr', 'pt')).toEqual([
      { model: 'Xenova/opus-mt-fr-en', prefix: '' },
      { model: 'Xenova/opus-mt-en-ROMANCE', prefix: '>>pt<< ' },
    ]);
    expect(models('pt', 'ar')).toEqual(['ROMANCE-en', 'en-ar']);
    expect(models('ar', 'fr')).toEqual(['ar-en', 'en-fr']);
  });

  test('aucune route ne dépasse deux sauts, et chaque saut est un modèle publié sous Xenova/', () => {
    for (const source of OPUS_MT_LANGUAGES) {
      for (const target of OPUS_MT_LANGUAGES) {
        const route = opusMtRoute(source, target);
        expect(route.length).toBeLessThanOrEqual(2);
        for (const hop of route) expect(hop.model).toMatch(/^Xenova\/opus-mt-[A-Za-z]+-[A-Za-z]+$/);
      }
    }
  });

  test('une langue hors des sept n’a pas de route, dans aucun sens', () => {
    expect(opusMtRoute('fr', 'sw')).toEqual([]);
    expect(opusMtRoute('ff', 'en')).toEqual([]);
    expect(opusMtRoute('en', 'ewo')).toEqual([]);
  });
});

describe('opusMtSupports — ce que l’appareil sait traduire avec Opus-MT', () => {
  test('les sept langues du produit, deux à deux, dans les deux sens', () => {
    for (const source of OPUS_MT_LANGUAGES) {
      for (const target of OPUS_MT_LANGUAGES) expect(opusMtSupports(source, target)).toBe(source !== target);
    }
  });

  test('une paire qui sort des sept reste au serveur', () => {
    expect(opusMtSupports('fr', 'sw')).toBe(false);
    expect(opusMtSupports('wo', 'fr')).toBe(false);
    expect(opusMtSupports('fr', 'fr')).toBe(false);
  });

  test('exactement fr, en, es, pt, de, it, ar', () => {
    expect([...OPUS_MT_LANGUAGES].sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
  });
});
