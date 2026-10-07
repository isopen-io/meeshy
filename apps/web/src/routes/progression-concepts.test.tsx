import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { PROGRESSION_CONCEPTS, progressionConcepts, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { GAME_EXTRAS_TODAY, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { gamePrefs } from '@/lib/game/preferences';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { interfaceDirection, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { conceptView } from '@/lib/view/progression-concepts';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProgressionBody } from './progression';
import { ConceptFiche } from './progression-concept';
import type { GameActions } from './progression-game-actions';
import { TableauBody } from './progression-tableau';

/**
 * « PROGRESSION » EN SOUS-MENUS (#9563) — la première page ne porte que des
 * cartes de concept (tête, données importantes, à quoi ça sert, comment ça
 * marche), chaque concept a sa fiche où vivent ses données et ses gestes, et le
 * tableau de bord regroupe tout, en lecture seule. Les trois écrans parcourent
 * la MÊME liste (`progressionConcepts`, `packages/shared`).
 */

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterEach(() => {
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
  gamePrefs.set({ hidden: false });
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
const playing: EngagementWithGame = { ...before, game: gameBlockWithExtrasFixture(), mintBadgeLoss: 2 };

const dom = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

const hub = (progress: EngagementWithGame): HTMLElement => dom(renderToStaticMarkup(<ProgressionBody progress={progress} now={NOW} />));
const fiche = (concept: ProgressionConcept, progress: EngagementWithGame): HTMLElement =>
  dom(renderToStaticMarkup(<ConceptFiche concept={concept} progress={progress} host={{ actions: idle, online: true }} now={NOW} />));
const tableau = (progress: EngagementWithGame): HTMLElement => dom(renderToStaticMarkup(<TableauBody progress={progress} now={NOW} />));

/** Rendu UNE fois, à la première lecture : le DOM et les catalogues n'existent qu'après `beforeAll`. */
const once = <T,>(make: () => T): (() => T) => {
  const made: { value?: T } = {};
  return () => {
    if (!('value' in made)) made.value = make();
    return made.value as T;
  };
};

const cards = (page: HTMLElement): readonly string[] =>
  [...page.querySelectorAll('[data-concept-card]')].map((card) => card.getAttribute('data-concept-card') ?? '');

const inLanguage = (language: InterfaceLanguage): void => {
  document.documentElement.lang = language;
  document.documentElement.dir = interfaceDirection(language);
};

describe('la fixture sert les quinze concepts', () => {
  test('sinon les témoins ci-dessous ne parcourraient qu’une partie de la liste', () => {
    expect(progressionConcepts(playing)).toEqual([...PROGRESSION_CONCEPTS]);
  });
});

describe('la première page : une carte par concept, et rien d’autre', () => {
  const page = once(() => hub(playing));

  test('chaque concept servi a sa carte, dans l’ordre partagé', () => {
    expect(cards(page())).toEqual([...progressionConcepts(playing)]);
  });

  for (const concept of PROGRESSION_CONCEPTS) {
    test(`${concept} : la carte entière ouvre la fiche, sa tête dit le nom puis la valeur sur une ligne`, () => {
      const card = page().querySelector(`[data-concept-card="${concept}"]`);
      expect(card?.tagName).toBe('A');
      expect(card?.getAttribute('href')).toBe(`/me/progression/concept/${concept}`);
      const view = conceptView(concept, playing, NOW);
      expect(card?.querySelector('[data-concept-name]')?.textContent).toBe(view.name);
      expect(card?.querySelector('[data-concept-value]')?.textContent).toBe(view.value);
      expect(view.value).not.toBe('');
      expect(card?.querySelector('[data-concept-value]')?.className).toContain('truncate');
    });
  }

  for (const concept of PROGRESSION_CONCEPTS) {
    test(`${concept} : au moins une donnée importante, à quoi ça sert, comment ça marche`, () => {
      const card = page().querySelector(`[data-concept-card="${concept}"]`);
      const chips = card?.querySelectorAll('[data-chip]').length ?? 0;
      expect(chips).toBeGreaterThanOrEqual(1);
      expect(chips).toBeLessThanOrEqual(3);
      const view = conceptView(concept, playing, NOW);
      expect(card?.querySelector('[data-concept-why]')?.textContent).toContain(view.why);
      expect(card?.querySelector('[data-concept-how]')?.textContent).toContain(view.how);
      expect(card?.querySelector('[data-concept-why]')?.className).toContain('line-clamp-2');
      expect(card?.querySelector('[data-concept-how]')?.className).toContain('line-clamp-2');
    });
  }

  test('aucun geste sur la première page : ni bouton, ni frappe, ni coffre, ni gel', () => {
    expect(page().querySelectorAll('button')).toHaveLength(0);
    for (const gesture of ['#game-mint', '#game-missions', '#game-flame-panel', '[data-game-mint-action]', '[data-meesh-mint]']) {
      expect({ gesture, found: page().querySelector(gesture) !== null }).toEqual({ gesture, found: false });
    }
  });

  test('les seules jauges sont les jauges fines des cartes, une au plus par concept', () => {
    const bars = [...page().querySelectorAll('[role="progressbar"]')];
    expect(bars.every((bar) => bar.closest('[data-concept-card]') !== null)).toBe(true);
    for (const card of page().querySelectorAll('[data-concept-card]')) expect(card.querySelectorAll('[role="progressbar"]').length).toBeLessThanOrEqual(1);
  });

  test('au-dessus de la liste : le tableau de bord ; en dessous : carnet, règles, réglages', () => {
    const rows = [...page().querySelectorAll('[data-progression-row]')].map((row) => [row.getAttribute('data-progression-row'), row.getAttribute('href')]);
    expect(rows).toEqual([
      ['tableau', '/me/progression/tableau-de-bord'],
      ['carnet', '/me/progression/carnet'],
      ['regles', '/me/progression/regles'],
      ['reglages', '/me/progression/reglages'],
    ]);
    const order = [...page().querySelectorAll('[data-progression-row], [data-concept-card]')].map((node) => node.getAttribute('data-progression-row') ?? 'carte');
    expect(order[0]).toBe('tableau');
    expect(order.slice(-3)).toEqual(['carnet', 'regles', 'reglages']);
  });

  test('chaque carte et chaque ligne est une cible de 44 points', () => {
    for (const target of page().querySelectorAll('[data-concept-card], [data-progression-row]')) {
      expect((target as HTMLElement).style.minHeight).toBe('44px');
    }
  });

  test('la ligne de Mee se pose au-dessus de tout quand l’hôte la fournit', () => {
    const withGuide = dom(renderToStaticMarkup(<ProgressionBody progress={playing} now={NOW} guide={<p data-guide-slot="">Mee</p>} />));
    const first = withGuide.querySelector('[data-guide-slot], [data-progression-row], [data-concept-card]');
    expect(first?.hasAttribute('data-guide-slot')).toBe(true);
  });
});

describe('un ancien serveur, sans bloc `game`', () => {
  const page = once(() => hub(before));

  test('les cartes que la progression d’avant sert restent ; aucune autre', () => {
    expect(cards(page())).toEqual([...progressionConcepts(before)]);
    for (const concept of ['level', 'meesh', 'flame', 'elans', 'badges', 'succes']) expect(cards(page())).toContain(concept);
    for (const concept of ['points', 'glory', 'missions', 'league', 'season', 'prestige', 'showcase', 'atlas']) expect(cards(page())).not.toContain(concept);
  });

  test('chaque carte restante dit une valeur, une donnée, son pourquoi et son comment', () => {
    for (const concept of progressionConcepts(before)) {
      const card = page().querySelector(`[data-concept-card="${concept}"]`);
      expect({ concept, value: card?.querySelector('[data-concept-value]')?.textContent === '' }).toEqual({ concept, value: false });
      expect({ concept, chips: (card?.querySelectorAll('[data-chip]').length ?? 0) >= 1 }).toEqual({ concept, chips: true });
      expect({ concept, why: card?.querySelector('[data-concept-why]') !== null, how: card?.querySelector('[data-concept-how]') !== null }).toEqual({ concept, why: true, how: true });
    }
  });

  test('aucune carte ne dit « 0 / 0 »', () => {
    expect(page().textContent).not.toContain('0 / 0');
  });

  test('les portes du jeu (carnet, règles, réglages) n’existent pas sans jeu ; le tableau de bord, si', () => {
    expect([...page().querySelectorAll('[data-progression-row]')].map((row) => row.getAttribute('data-progression-row'))).toEqual(['tableau']);
  });

  test('chaque concept restant a sa fiche et son bloc au tableau de bord', () => {
    const board = tableau(before);
    for (const concept of progressionConcepts(before)) {
      expect({ concept, fiche: fiche(concept, before).querySelector('[data-concept-fiche]') !== null }).toEqual({ concept, fiche: true });
      expect({ concept, block: board.querySelector(`[data-dashboard-block="${concept}"]`) !== null }).toEqual({ concept, block: true });
    }
  });

  test('la fiche des Meeshes garde la frappe d’avant', () => {
    const canMint: EngagementWithGame = { ...before, meesh: { ...(before.meesh ?? { balance: 0, mintedLifetime: 0, debitablePoints: 0, floorPoints: 0, mintCost: 1200, progress: 1, firstMintedAt: null, lastMintedAt: null }), missingPoints: 0, canMint: true } };
    expect(fiche('meesh', canMint).querySelector('button')).not.toBeNull();
  });
});

describe('la fiche d’un concept : même gabarit partout', () => {
  for (const concept of PROGRESSION_CONCEPTS) {
    test(`${concept} : héros, « C’est quoi ? », « Où j’en suis », « Comment en gagner », dans cet ordre`, () => {
      const page = fiche(concept, playing);
      const view = conceptView(concept, playing, NOW);
      const sections = [...page.querySelectorAll('[data-fiche-section]')].map((section) => section.getAttribute('data-fiche-section'));
      expect(sections.slice(0, 4)).toEqual(['hero', 'what', 'where', 'earn']);
      expect(page.querySelector('[data-fiche-section="hero"]')?.textContent).toContain(view.value);
      expect(page.querySelector('[data-fiche-section="where"] [data-concept-facts]')).not.toBeNull();
      expect(page.querySelectorAll('[data-fiche-section="earn"] li').length).toBeGreaterThanOrEqual(1);
      expect(page.querySelectorAll('[data-fiche-section="earn"] li').length).toBeLessThanOrEqual(3);
    });
  }

  for (const concept of PROGRESSION_CONCEPTS) {
    test(`${concept} : « C’est quoi ? » reprend la phrase de la carte — une seule source de texte`, () => {
      const card = hub(playing).querySelector(`[data-concept-card="${concept}"]`);
      const what = fiche(concept, playing).querySelector('[data-fiche-section="what"]');
      const view = conceptView(concept, playing, NOW);
      expect(what?.textContent).toContain(view.why);
      expect(what?.textContent).toContain(view.how);
      expect(card?.textContent).toContain(view.why);
      expect(card?.textContent).toContain(view.how);
    });
  }

  test('les gestes vivent dans la fiche de leur concept : frappe, missions et coffre, Flamme', () => {
    expect(fiche('meesh', playing).querySelector('#game-mint')).not.toBeNull();
    expect(fiche('missions', playing).querySelector('#game-missions')).not.toBeNull();
    expect(fiche('flame', playing).querySelector('#game-flame-panel')).not.toBeNull();
    expect(fiche('level', playing).querySelector('#game-mint')).toBeNull();
  });

  for (const [concept, href] of [
    ['league', '/me/progression/ligue'],
    ['season', '/me/progression/saison'],
    ['prestige', '/me/progression/prestige'],
    ['badges', '/me/progression/badges'],
    ['defis', '/me/progression/defis'],
    ['succes', '/me/progression/succes'],
    ['showcase', '/me/progression/vitrine'],
    ['atlas', '/me/progression/atlas'],
  ] as const) {
    test(`${concept} : « Aller plus loin » mène à sa sous-page ${href}`, () => {
      const more = fiche(concept, playing).querySelector('[data-fiche-section="more"]');
      expect(more?.querySelector(`a[href="${href}"]`)).not.toBeNull();
    });
  }

  test('un concept que le serveur ne sert pas n’a pas de fiche : la page le dit', () => {
    const page = fiche('league', before);
    expect(page.querySelector('[data-concept-fiche]')).toBeNull();
    expect(page.querySelector('[data-fiche-unknown]')).not.toBeNull();
  });
});

describe('le tableau de bord : un bloc par concept, lecture seule', () => {
  const page = once(() => tableau(playing));

  test('un bloc par concept servi, dans l’ordre de la première page', () => {
    expect([...page().querySelectorAll('[data-dashboard-block]')].map((block) => block.getAttribute('data-dashboard-block'))).toEqual([...progressionConcepts(playing)]);
  });

  for (const concept of PROGRESSION_CONCEPTS) {
    test(`${concept} : le titre du bloc ouvre la fiche, et le bloc porte toutes ses données`, () => {
      const block = page().querySelector(`[data-dashboard-block="${concept}"]`);
      const view = conceptView(concept, playing, NOW);
      expect(block?.querySelector(`a[href="/me/progression/concept/${concept}"]`)?.textContent).toContain(view.name);
      expect(view.facts.length).toBeGreaterThanOrEqual(1);
      for (const fact of view.facts) {
        expect(block?.textContent).toContain(fact.label);
        expect(block?.textContent).toContain(fact.value);
      }
    });
  }

  test('aucun geste', () => {
    expect(page().querySelectorAll('button')).toHaveLength(0);
  });
});

describe('« Jeu masqué »', () => {
  test('la carte masquée remplace les cartes du jeu ; ce que la progression d’avant sert reste', () => {
    gamePrefs.set({ hidden: true });
    const page = hub(playing);
    expect(page.querySelector('#game-hidden')).not.toBeNull();
    for (const concept of ['level', 'points', 'meesh', 'glory', 'flame', 'missions', 'league', 'season', 'prestige', 'showcase', 'atlas']) {
      expect(cards(page)).not.toContain(concept);
    }
    expect(cards(page)).toContain('badges');
  });

  test('la fiche d’un concept du jeu et le tableau de bord ne montrent rien du jeu', () => {
    gamePrefs.set({ hidden: true });
    expect(fiche('missions', playing).querySelector('#game-missions')).toBeNull();
    expect(tableau(playing).querySelector('[data-dashboard-block="glory"]')).toBeNull();
  });
});

/**
 * AUCUNE CHIP SUR DEUX LIGNES (#9563). Le témoin n'a pas de mise en page : il
 * garde ce qui la produit. Une chip porte `whitespace-nowrap` (son texte ne
 * passe jamais à la ligne), sa rangée `flex-wrap` (le passage à la ligne se fait
 * ENTRE les chips), et son texte tient dans la carte la plus étroite : 320 px de
 * large, moins les marges, laissent 256 px, soit une trentaine de caractères du
 * corps des chips. Un libellé plus long se raccourcit dans le catalogue.
 */
const CHIP_MAX_CHARS = 32;

describe('aucune chip sur deux lignes, dans les sept langues', () => {
  const surfaces = (): readonly HTMLElement[] => [
    hub(playing),
    hub(before),
    tableau(playing),
    ...PROGRESSION_CONCEPTS.map((concept) => fiche(concept, playing)),
    ...progressionConcepts(before).map((concept) => fiche(concept, before)),
  ];

  for (const language of SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[]) {
    test(`${language} : chaque chip tient sur une ligne, et la rangée passe à la ligne entre deux chips`, () => {
      inLanguage(language);
      const chips = surfaces().flatMap((page) => [...page.querySelectorAll('[data-chip]')]);
      expect(chips.length).toBeGreaterThan(20);
      for (const chip of chips) {
        const text = chip.textContent ?? '';
        expect({ language, text, nowrap: chip.className.includes('whitespace-nowrap') }).toEqual({ language, text, nowrap: true });
        expect({ language, text, row: chip.closest('.flex-wrap') !== null }).toEqual({ language, text, row: true });
        expect({ language, text, fits: [...text].length <= CHIP_MAX_CHARS }).toEqual({ language, text, fits: true });
      }
    });
  }

  test('toute pastille de texte des écrans de la progression est une chip déclarée', () => {
    const pills = surfaces().flatMap((page) => [...page.querySelectorAll('span.rounded-chip.text-check, li.rounded-chip.text-check')]);
    expect(pills.length).toBeGreaterThan(0);
    for (const pill of pills) expect({ text: pill.textContent, declared: pill.hasAttribute('data-chip') }).toEqual({ text: pill.textContent, declared: true });
  });
});

/**
 * DEUX LIGNES AU PLUS pour « à quoi ça sert » et pour « comment ça marche ».
 * Mesuré dans un navigateur à 320 px, dans les sept langues : une phrase de 72
 * caractères tient sur deux lignes du corps de la carte ; au-delà, elle est
 * coupée par des points de suspension au milieu de son explication. La borne se
 * garde ici, dans le catalogue, là où la phrase s'écrit.
 */
const SENTENCE_MAX_CHARS = 72;

describe('les deux phrases de la carte tiennent sur deux lignes à 320 px', () => {
  for (const language of SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[]) {
    test(`${language} : aucune phrase de carte ne dépasse ${SENTENCE_MAX_CHARS} caractères`, () => {
      inLanguage(language);
      for (const concept of PROGRESSION_CONCEPTS) {
        const view = conceptView(concept, playing, NOW);
        for (const sentence of [view.why, view.how]) {
          expect({ language, concept, sentence, fits: [...sentence].length <= SENTENCE_MAX_CHARS }).toEqual({ language, concept, sentence, fits: true });
        }
      }
    });
  }

  test('un lecteur d’écran entend le libellé de chaque phrase, que l’œil ne voit pas', () => {
    const card = hub(playing).querySelector('[data-concept-card="level"]');
    const hidden = [...(card?.querySelectorAll('.sr-only') ?? [])].map((label) => label.textContent);
    expect(hidden).toEqual(['À quoi ça sert :', 'Comment ça marche :']);
  });

  test('le nom d’un concept passe à la ligne plutôt que de se couper', () => {
    const name = hub(playing).querySelector('[data-concept-card="missions"] [data-concept-name]');
    expect(name?.className).not.toContain('truncate');
    expect(name?.className).toContain('break-words');
  });
});
