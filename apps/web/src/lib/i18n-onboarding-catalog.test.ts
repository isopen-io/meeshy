import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadOnboardingCatalog, translateOnboarding, type OnboardingCatalog } from './i18n-onboarding-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';
import { greetingDraft } from './onboarding/journey';
import { greetingTemplates } from './onboarding/greetings';

/**
 * LE CATALOGUE DE L'ACCUEIL (#7729) — même discipline que
 * `i18n-admin-catalog.test.ts` : le français est la source des clés
 * `onboarding.*`, chaque autre langue en porte EXACTEMENT les mêmes, avec les
 * mêmes paramètres, et aucune valeur n'est vide ni recopiée de sa clé. Pas de
 * `defaultValue` ailleurs pour cacher un trou : une clé absente rougit ICI.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, OnboardingCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadOnboardingCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés onboarding.* du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadOnboardingCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé', async () => {
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        expect({ language, key, identifier: value === key }).toEqual({ language, key, identifier: false });
      }
    }
  });

  test('chaque valeur porte les MÊMES paramètres que le français', async () => {
    const french = await loadOnboardingCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        const expected = sorted(catalogPlaceholders(french[key as keyof OnboardingCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadOnboardingCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      expect({ language, title: catalog['onboarding.global.title'] === french['onboarding.global.title'] }).toEqual({ language, title: false });
    }
  });
});

describe('les huit saluts de chaque langue', () => {
  test('huit gabarits, chacun avec le pseudo et UN trou personnel', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await loadOnboardingCatalog(language);
      const templates = greetingTemplates(language);
      expect({ language, count: templates.length }).toEqual({ language, count: 8 });
      for (const template of templates) {
        expect({ language, template, name: template.includes('{name}') }).toEqual({ language, template, name: true });
        expect({ language, template, holes: template.match(/\[\[[^\]]+\]\]/g)?.length ?? 0 }).toEqual({ language, template, holes: 1 });
      }
    }
  });

  test('aucun gabarit n’envoie de balise de trou : le trou devient du texte', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await loadOnboardingCatalog(language);
      const templates = greetingTemplates(language);
      templates.forEach((_, index) => {
        const draft = greetingDraft({ templates, index, name: 'Tom', languages: 'x' });
        expect(draft.text).not.toContain('[[');
        expect(draft.holeEnd).toBeGreaterThan(draft.holeStart);
      });
    }
  });

  test('le démonstrateur du Prisme part d’une AUTRE langue que celle du lecteur', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await loadOnboardingCatalog(language);
      expect({ language, from: translateOnboarding(language, 'onboarding.languages.demo.fromCode') === language }).toEqual({ language, from: false });
    }
  });
});

describe('translateOnboarding', () => {
  test('interpole les paramètres', async () => {
    await loadOnboardingCatalog('en');
    expect(translateOnboarding('en', 'onboarding.points.gauge', { points: '0', target: '10' })).toBe('0 / 10 pts to your level 1');
  });

  test('l’arabe rend de l’arabe', async () => {
    await loadOnboardingCatalog('ar');
    expect(translateOnboarding('ar', 'onboarding.skipAll')).toBe('تخطَّ الكل');
  });
});
