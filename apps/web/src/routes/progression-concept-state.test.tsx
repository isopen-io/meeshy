import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { PROGRESSION_CONCEPTS, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { ALL_LEVEL_STEPS, GAME_EXTRAS_TODAY, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { interfaceDirection, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { conceptView, ficheView } from '@/lib/view/progression-concepts';
import { conceptState } from '@/lib/view/progression-state';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProgressionBody } from './progression';
import { ConceptFiche } from './progression-concept';
import type { GameActions } from './progression-game-actions';

/**
 * CHAQUE SECTION DIT CE QU'ELLE CONTIENT ET COMMENT S'EN SERVIR (#10540) — la fiche d'un concept répond
 * à quatre questions (ce que c'est, à quoi ça sert, comment ça se gagne, comment s'en servir). La phrase
 * d'état ne paraît que sur la fiche, et seulement quand elle ne redit rien de la tête (#11178).
 */
beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterEach(() => {
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const idle: GameActions = {
  mint: () => undefined,
  reroll: () => undefined,
  claimChest: () => undefined,
  buyFreeze: () => undefined,
  relight: () => undefined,
  pending: { mint: false, rerollId: null, chest: false, freeze: false, relight: false },
  errors: {},
  celebration: null,
  strikeKey: 0,
};

const NOW = new Date(`${GAME_EXTRAS_TODAY}T10:00:00.000Z`);
const before = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const wallet = before.meesh;
if (wallet === undefined) throw new Error('la fixture sert un porte-monnaie');
const jcnm: EngagementWithGame = {
  ...before,
  game: gameBlockWithExtrasFixture({ ...ALL_LEVEL_STEPS, score: 77_099, levelRecord: 27, debitablePoints: 5_823, mintedLifetime: 78, balance: 3 }),
  meesh: { ...wallet, balance: 3, mintedLifetime: 78, debitablePoints: 5_823, mintCost: 7_662, missingPoints: 1_839, canMint: false },
};

const dom = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};
const plain = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();
const hub = (progress: EngagementWithGame): HTMLElement => dom(renderToStaticMarkup(<ProgressionBody progress={progress} now={NOW} />));
const fiche = (concept: ProgressionConcept, progress: EngagementWithGame): HTMLElement =>
  dom(renderToStaticMarkup(<ConceptFiche concept={concept} progress={progress} host={{ actions: idle, online: true }} now={NOW} />));

describe('la carte : un nom, une valeur, une ligne — plus de phrase (#11178)', () => {
  test('aucune carte ne porte la phrase d’état : elle redisait la valeur', () => {
    expect(hub(jcnm).querySelectorAll('[data-concept-state]')).toHaveLength(0);
  });

  test('le porteur lit ses chiffres avec leur cible, sur la première page', () => {
    const page = hub(jcnm);
    expect(plain(page.querySelector('[data-concept-card="level"] [data-concept-line]')?.textContent)).toBe('1 301 étincelles jusqu’au 28');
    expect(plain(page.querySelector('[data-concept-card="points"] [data-concept-value]')?.textContent)).toBe('77 099 étincelles');
    // UNE poche : plus de second solde « à convertir » à côté de la poche (porteur, 2026-10-16).
    expect(plain(page.querySelector('[data-concept-card="points"]')?.textContent)).not.toContain('5 823');
  });

  test('une carte sans ligne ne rend pas de ligne vide', () => {
    for (const progress of [jcnm, before]) {
      for (const line of hub(progress).querySelectorAll('[data-concept-line]')) expect(plain(line.textContent)).not.toBe('');
    }
  });
});

describe('la fiche : quatre questions, et l’état avant les données', () => {
  for (const concept of PROGRESSION_CONCEPTS) {
    test(`${concept} : ce que c’est, à quoi ça sert, comment ça marche — puis comment s’en servir`, () => {
      const page = fiche(concept, jcnm);
      const what = page.querySelector('[data-fiche-section="what"]');
      const labels = [...(what?.querySelectorAll('[data-fiche-question]') ?? [])].map((label) => label.textContent);
      expect(labels).toEqual(['Ce que c’est', 'À quoi ça sert', 'Comment ça marche']);
      const view = conceptView(concept, jcnm, NOW);
      expect(view.what.trim()).not.toBe('');
      expect(view.use.trim()).not.toBe('');
      expect(what?.textContent).toContain(view.what);
      const use = page.querySelector('[data-fiche-section="use"]');
      expect(use?.querySelector('h2')?.textContent).toBe('Comment m’en servir');
      expect(use?.textContent).toContain(view.use);
      const order = [...page.querySelectorAll('[data-fiche-section]')].map((section) => section.getAttribute('data-fiche-section'));
      expect(order.indexOf('earn')).toBeLessThan(order.indexOf('use'));
    });

    test(`${concept} : « Où j’en suis » ne rend la phrase d’état que si elle ne redit rien de la tête`, () => {
      const said = ficheView(concept, jcnm, NOW).state;
      const rendered = fiche(concept, jcnm).querySelector('[data-fiche-section="where"] [data-fiche-state]');
      if (said === null) expect({ concept, rendered: rendered !== null }).toEqual({ concept, rendered: false });
      else expect({ concept, line: plain(rendered?.textContent) }).toEqual({ concept, line: plain(conceptState(concept, jcnm)) });
    });
  }

  test('une phrase qui apporte ce que la tête ne dit pas reste, en tête de « Où j’en suis » — et sa donnée n’est pas redite', () => {
    const game = jcnm.game;
    if (game === undefined) throw new Error('fixture sans jeu');
    const out: EngagementWithGame = { ...jcnm, game: { ...game, flame: { ...game.flame, status: 'out' } } };
    const where = fiche('flame', out).querySelector('[data-fiche-section="where"]');
    expect(plain(where?.querySelector('[data-fiche-state]')?.textContent)).toBe(plain(conceptState('flame', out)));
    expect(where?.querySelector('li[data-fact="flame_state"]')).toBeNull();
  });

  test('la fiche de l’Héritage passe ta lumière au cadre de la frappe', () => {
    const page = plain(fiche('meesh', jcnm).querySelector('#game-mint')?.textContent);
    expect(page).toContain('qui en compte 77 099.');
    expect(page).toContain('Il en manque encore 1 839 pour la frapper.');
  });
});

describe('dans les sept langues', () => {
  for (const language of SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[]) {
    test(`${language} : chaque concept dit ce qu’il est et comment s’en servir, traduit`, () => {
      const french = PROGRESSION_CONCEPTS.map((concept) => conceptView(concept, jcnm, NOW));
      document.documentElement.lang = language;
      document.documentElement.dir = interfaceDirection(language);
      for (const [index, concept] of PROGRESSION_CONCEPTS.entries()) {
        const view = conceptView(concept, jcnm, NOW);
        expect({ language, concept, filled: view.what.trim() !== '' && view.use.trim() !== '' }).toEqual({ language, concept, filled: true });
        if (language !== 'fr') expect({ language, concept, copied: view.what === french[index]?.what || view.use === french[index]?.use }).toEqual({ language, concept, copied: false });
      }
    });
  }
});
