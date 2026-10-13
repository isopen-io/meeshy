import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PROGRESSION_CONCEPTS } from '@meeshy/shared/utils/progression-layout';

import { loadGameCatalog, loadGameScreenCatalog, unloadGameCatalog } from '@/lib/i18n-game-catalog';
import { DEFAULT_INTERFACE_LANGUAGE, interfaceDirection, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { gameRules, RULES_GLOSSARY, rulesGlossary } from '@/lib/view/game-rules-copy';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { RulesBody } from './progression-rules';

/**
 * LES RÈGLES SONT COMPLÈTES (#10540) — aucun concept que Progression affiche n'est absent du carnet.
 * Les huit règles restent huit ; sous elles, « Chaque concept, en clair » dit pour chacun ce que c'est,
 * à quoi ça sert, comment ça se gagne et comment s'en servir.
 */
beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/regles' });
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterEach(() => {
  document.documentElement.lang = DEFAULT_INTERFACE_LANGUAGE;
  document.documentElement.dir = 'ltr';
});
afterAll(async () => {
  unloadGameCatalog();
  await loadGameCatalog(DEFAULT_INTERFACE_LANGUAGE);
  await releaseHappyDomIfRegistered();
});

const LANGUAGES = SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[];

const page = (): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<RulesBody />);
  return host;
};

describe('aucun concept affiché n’est absent des règles', () => {
  test('les quinze concepts de Progression ont leur entrée', () => {
    for (const concept of PROGRESSION_CONCEPTS) expect({ concept, listed: (RULES_GLOSSARY as readonly string[]).includes(concept) }).toEqual({ concept, listed: true });
  });

  test('et ce que Progression montre sans en faire une fiche : coffre, trésor, étapes des niveaux, Vent arrière, duo', () => {
    for (const extra of ['chest', 'treasury', 'steps', 'tailwind', 'duo']) expect({ extra, listed: (RULES_GLOSSARY as readonly string[]).includes(extra) }).toEqual({ extra, listed: true });
  });

  test('la page les montre tous, dans l’ordre de Progression, chacun avec son nom et sa phrase', () => {
    const shown = [...page().querySelectorAll('[data-rules-concept]')];
    expect(shown.map((entry) => entry.getAttribute('data-rules-concept'))).toEqual([...RULES_GLOSSARY]);
    const glossary = rulesGlossary('fr');
    for (const [index, entry] of shown.entries()) {
      expect(entry.textContent).toContain(glossary[index]?.name ?? '∅');
      expect(entry.textContent).toContain(glossary[index]?.body ?? '∅');
    }
  });

  test('les huit règles restent huit, au-dessus', () => {
    expect(gameRules('fr')).toHaveLength(8);
    const html = page().innerHTML;
    expect(html.indexOf('id="regle-8"')).toBeLessThan(html.indexOf('data-rules-concept='));
  });
});

describe('les règles disent les deux soldes de points', () => {
  test('le niveau se lit sur les points en poche, la frappe se paie en points à convertir', () => {
    const rules = gameRules('fr');
    expect(rules[1]?.body).toContain('points en poche');
    expect(rules[2]?.body).toContain('points à convertir');
    expect(rules[2]?.body).toContain('30 %');
    expect(rules[3]?.body).toContain('niveau record');
  });

  test('l’entrée Points nomme les deux soldes et dit qu’ils peuvent différer, sans en inventer la cause', () => {
    const points = rulesGlossary('fr').find((entry) => entry.key === 'points')?.body ?? '';
    expect(points).toContain('points en poche');
    expect(points).toContain('points à convertir');
    expect(points).toContain('ils peuvent être différents');
  });
});

describe('dans les sept langues', () => {
  for (const language of LANGUAGES) {
    test(`${language} : chaque entrée a un nom et une phrase, traduits`, () => {
      const french = rulesGlossary('fr');
      const own = rulesGlossary(language);
      expect(own).toHaveLength(RULES_GLOSSARY.length);
      for (const [index, entry] of own.entries()) {
        expect({ language, key: entry.key, filled: entry.name.trim() !== '' && entry.body.trim() !== '' }).toEqual({ language, key: entry.key, filled: true });
        if (language !== 'fr') expect({ language, key: entry.key, copied: entry.body === french[index]?.body }).toEqual({ language, key: entry.key, copied: false });
      }
    });

    test(`${language} : la page se rend avec la seule partie « règles » du catalogue`, async () => {
      unloadGameCatalog();
      document.documentElement.lang = language;
      document.documentElement.dir = interfaceDirection(language);
      await loadGameScreenCatalog(language, 'rules');
      expect(page().querySelectorAll('[data-rules-concept]')).toHaveLength(RULES_GLOSSARY.length);
      await loadGameCatalog(language);
    });
  }
});
