import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { interfaceDirection, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ElansHero } from './progression-heroes';

/**
 * LE TITRE DE LA CARTE DES ÉLANS SE LIT DANS LA LANGUE DU LECTEUR (#10438).
 *
 * Il rendait « Élan ×n » et « Vos élans » en dur : un lecteur anglais, allemand
 * ou arabe lisait un mot français en tête de la carte. Parité avec iOS
 * (`ProgressionCopy.elanTitle(factor:)`, #7757) : mêmes mots dans les sept langues.
 */

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/elans' });
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterEach(() => {
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const accelerated = { factor: 3, activeFamilyCount: 3, hasStanding: false, windowDays: 7, activeFamilies: ['content', 'comment', 'conversation'] };
const neutral = { factor: 1, activeFamilyCount: 1, hasStanding: false, windowDays: 7, activeFamilies: ['content'] };

const titleIn = (language: InterfaceLanguage, elan: typeof accelerated): string => {
  document.documentElement.lang = language;
  document.documentElement.dir = interfaceDirection(language);
  const markup = renderToStaticMarkup(<ElansHero progress={resolveEngagementProgress({ ...ENGAGEMENT_PROGRESS_FIXTURE, elan })} />);
  const match = markup.match(/<h2 id="progression-elans"[^>]*>([\s\S]*?)<\/h2>/);
  return (match?.[1] ?? '').replace(/[⁦-⁩]/g, '');
};

const ACCELERATED: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'Élan ×3',
  en: 'Momentum ×3',
  de: 'Schwung ×3',
  es: 'Impulso ×3',
  it: 'Slancio ×3',
  pt: 'Impulso ×3',
  ar: 'الزخم ×3',
};

const AT_REST: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'Tes élans',
  en: 'Your streaks in motion',
  de: 'Dein Schwung',
  es: 'Tus impulsos',
  it: 'I tuoi slanci',
  pt: 'Seus impulsos',
  ar: 'زخمك',
};

describe('ElansHero — le titre dans la langue du lecteur (#10438)', () => {
  for (const language of SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[]) {
    test(`${language} : l’élan en cours se dit avec le mot d’iOS et son facteur`, () => {
      expect(titleIn(language, accelerated)).toBe(ACCELERATED[language]);
    });

    test(`${language} : sans élan, la carte se titre dans la langue du lecteur`, () => {
      expect(titleIn(language, neutral)).toBe(AT_REST[language]);
    });
  }

  test('hors français, le titre ne dit jamais « Élan » ni « élans »', () => {
    const foreign = (SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[]).filter((language) => language !== 'fr');
    for (const language of foreign) {
      expect(titleIn(language, accelerated)).not.toMatch(/[ÉE]lan/i);
      expect(titleIn(language, neutral)).not.toMatch(/élans/i);
    }
  });

  test('la carte ne porte plus le titre écrit en dur', () => {
    const source = readFileSync(new URL('./progression-heroes.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('`Élan ×');
    expect(source).not.toContain("'Vos élans'");
  });
});
