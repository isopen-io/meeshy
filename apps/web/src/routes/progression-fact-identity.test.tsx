import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { PROGRESSION_CONCEPTS, progressionConcepts, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { GAME_EXTRAS_TODAY, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { ENGAGEMENT_LONG_FIXTURE, gameBlockLongFixture } from '@/lib/api/game-fixture-long';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { interfaceDirection, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProgressionBody } from './progression';
import { ConceptFiche } from './progression-concept';
import type { GameActions } from './progression-game-actions';

/**
 * UN FAIT NE PARAÎT QU'UNE FOIS PAR ÉCRAN (#11178, épopée § 3.3 et § 5 ; leçon du 2026-10-20).
 *
 * Les captures du porteur montraient le prix de la prochaine Meesh TROIS fois sur la fiche des Meeshes (titre,
 * pastille « Coûte », phrase « Où j'en suis »), la poche deux fois sous deux noms, et une fiche des Étincelles dont
 * la tête disait le cumul au lieu de la poche. Le dédoublonnage d'avant comparait des CHAÎNES dans un cadre ; il ne
 * voyait ni un fait habillé autrement, ni l'écran entier.
 *
 * Ces témoins lisent l'IDENTITÉ de chaque fait rendu : tout élément qui dit un fait porte `data-fact` (un fait) ou
 * `data-facts` (une phrase qui en porte plusieurs). Deux rendus d'une même identité sur un écran — tête, ligne,
 * phrase, rangée — sont un défaut. Et un chiffre visible hors de tout fait déclaré est un fait sans identité.
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
const playing: EngagementWithGame = { ...before, game: gameBlockWithExtrasFixture(), mintBadgeLoss: 2 };
const long = (): EngagementWithGame => ({ ...resolveEngagementProgress(ENGAGEMENT_LONG_FIXTURE), game: gameBlockLongFixture(), mintBadgeLoss: 12 });

type Game = NonNullable<EngagementWithGame['game']>;

/** Les valeurs des captures du porteur (2026-10-20) : 88 Meeshes gardées, 91 frappées, la n° 92 à 10 423, une lumière de 108 233, 377 752 reçues. */
const porteur = (patch: (game: Game) => Game = (game) => game): EngagementWithGame => {
  const game = gameBlockWithExtrasFixture();
  const wallet = before.meesh;
  if (wallet === undefined) throw new Error('fixture sans Meeshes');
  return {
    ...playing,
    meesh: { ...wallet, balance: 88, mintedLifetime: 91 },
    game: patch({
      ...game,
      level: { ...game.level, sparks: 108_233, sparksCycle: 377_752, sparksLifetime: 377_752, sparksDebt: 0 },
      mint: { ...game.mint, number: 92, edition: 'silver', price: 10_423, canMint: true, missingPoints: 0, gloryGained: 1000, blockedBy: undefined, sparksDebt: 0, locked: undefined },
      treasury: { ...game.treasury, held: 88, tier: 'coffret', next: { key: 'coffre', minHeld: 100, missing: 12 } },
    }),
  };
};

const short = (): EngagementWithGame => porteur((game) => ({ ...game, level: { ...game.level, sparks: 8_000 }, mint: { ...game.mint, canMint: false, missingPoints: 2_423 } }));
const shadowed = (): EngagementWithGame =>
  porteur((game) => ({ ...game, level: { ...game.level, sparksDebt: 640 }, mint: { ...game.mint, canMint: false, missingPoints: 0, blockedBy: 'debt', sparksDebt: 640 } }));

const dom = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

const hub = (progress: EngagementWithGame): HTMLElement => dom(renderToStaticMarkup(<ProgressionBody progress={progress} now={NOW} />));
const fiche = (concept: ProgressionConcept, progress: EngagementWithGame): HTMLElement =>
  dom(renderToStaticMarkup(<ConceptFiche concept={concept} progress={progress} host={{ actions: idle, online: true }} now={NOW} />));

const plain = (text: string | null | undefined): string => (text ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Les identités rendues dans un sous-arbre, une entrée par rendu. */
const identities = (root: Element): readonly string[] =>
  [...root.querySelectorAll('[data-fact], [data-facts]')].flatMap((node) => [
    ...(node.hasAttribute('data-fact') ? [node.getAttribute('data-fact') ?? ''] : []),
    ...(node.getAttribute('data-facts') ?? '').split(' ').filter((id) => id !== ''),
  ]);

const repeated = (ids: readonly string[]): readonly string[] => [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

const occurrences = (root: Element, needle: string): number => plain(root.textContent).split(needle).length - 1;

const visibleDigitsOutsideFacts = (root: Element): readonly string[] => {
  const walker = document.createTreeWalker(root, 4);
  const strays: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = plain(node.textContent);
    const parent = node.parentElement;
    if (!/\d/.test(text) || parent === null) continue;
    if (parent.closest('[aria-hidden="true"], .sr-only, [data-fact], [data-facts]') !== null) continue;
    strays.push(text);
  }
  return strays;
};

const FIXTURES = (): readonly (readonly [string, EngagementWithGame])[] => [
  ['jeu', playing],
  ['captures du porteur', porteur()],
  ['frappe pas encore possible', short()],
  ['une ombre', shadowed()],
  ['valeurs longues', long()],
  ['ancien serveur', before],
];

describe('la première page : un nom en petit, une valeur en grand, une seule ligne en petit', () => {
  for (const [name, progress] of FIXTURES()) {
    test(`${name} : chaque carte dit son nom, sa valeur et au plus UNE ligne — ni pastilles, ni jauge, ni paragraphe`, () => {
      const page = hub(progress);
      const cards = [...page.querySelectorAll('[data-concept-card]')];
      expect(cards.length).toBe(progressionConcepts(progress).length);
      for (const card of cards) {
        const concept = card.getAttribute('data-concept-card');
        const nameNode = card.querySelector('[data-concept-name]');
        const value = card.querySelector('[data-concept-value]');
        expect({ concept, small: nameNode?.className.includes('text-check') }).toEqual({ concept, small: true });
        expect({ concept, big: value?.className.includes('text-thread') }).toEqual({ concept, big: true });
        expect({ concept, lines: card.querySelectorAll('[data-concept-line]').length <= 1 }).toEqual({ concept, lines: true });
        const line = card.querySelector('[data-concept-line]');
        if (line !== null) expect({ concept, small: line.className.includes('text-caption') }).toEqual({ concept, small: true });
        expect({ concept, chips: card.querySelectorAll('[data-chip]').length, bars: card.querySelectorAll('[role="progressbar"]').length }).toEqual({ concept, chips: 0, bars: 0 });
        expect({ concept, why: card.querySelector('[data-concept-why], [data-concept-how], [data-concept-state]') }).toEqual({ concept, why: null });
      }
    });

    test(`${name} : sur chaque carte, la valeur et la ligne disent deux faits différents, et chaque chiffre a son identité`, () => {
      for (const card of hub(progress).querySelectorAll('[data-concept-card]')) {
        const concept = card.getAttribute('data-concept-card');
        expect({ concept, repeated: repeated(identities(card)) }).toEqual({ concept, repeated: [] });
        expect({ concept, strays: visibleDigitsOutsideFacts(card) }).toEqual({ concept, strays: [] });
      }
    });
  }

  test('la carte de la Lumière : l’anneau dit le niveau, la valeur nomme l’état de la lumière', () => {
    const card = hub(porteur()).querySelector('[data-concept-card="level"]');
    expect(card?.querySelector('[data-concept-value]')?.getAttribute('data-fact')).toBe('tier');
    expect(card?.querySelector('[data-fact="level"]')?.getAttribute('aria-label')).toMatch(/\d/);
  });

  test('la carte des Étincelles : ta lumière en grand, « depuis toujours » en petit, jamais le prix d’une Meesh', () => {
    const card = hub(porteur()).querySelector('[data-concept-card="points"]');
    expect(plain(card?.querySelector('[data-concept-value]')?.textContent)).toBe('108 233 étincelles');
    expect(plain(card?.querySelector('[data-concept-line]')?.textContent)).toBe('377 752 reçues depuis toujours');
    expect(occurrences(card as Element, '10 423')).toBe(0);
  });

  test('la carte des Étincelles : une ombre passe avant le « depuis toujours »', () => {
    const card = hub(shadowed()).querySelector('[data-concept-card="points"]');
    expect(card?.querySelector('[data-concept-line]')?.getAttribute('data-fact')).toBe('sparks_debt');
  });

  test('la carte de l’Héritage : les Meeshes gardées en grand, le contenant et le suivant en une ligne', () => {
    const calm = porteur((game) => ({ ...game, mint: { ...game.mint, canMint: false, missingPoints: 10 } }));
    const card = hub(calm).querySelector('[data-concept-card="meesh"]');
    expect(plain(card?.querySelector('[data-concept-value]')?.textContent)).toBe('88 Meeshes');
    expect(plain(card?.querySelector('[data-concept-line]')?.textContent)).toBe('Coffret · le Coffre s’ouvre à 100');
  });
});

describe('chaque fiche du jeu : un fait, un rendu', () => {
  for (const [name, progress] of FIXTURES()) {
    for (const concept of PROGRESSION_CONCEPTS) {
      test(`${name} · ${concept} : aucune identité rendue deux fois sur la fiche`, () => {
        if (!progressionConcepts(progress).includes(concept)) return;
        const page = fiche(concept, progress);
        expect(repeated(identities(page))).toEqual([]);
      });
    }
  }

  for (const [name, progress] of FIXTURES()) {
    test(`${name} : la tête, « Où j’en suis » et les fiches refaites ne montrent aucun chiffre sans identité`, () => {
      for (const concept of progressionConcepts(progress)) {
        const page = fiche(concept, progress);
        const scoped = [
          ...page.querySelectorAll('[data-fiche-hero="generic"], [data-fiche-section="where"]'),
          ...(concept === 'points' || (concept === 'meesh' && progress.game !== undefined) ? [page.querySelector('[data-fiche-section="hero"]')] : []),
        ].filter((node): node is Element => node !== null);
        for (const root of scoped) expect({ concept, strays: visibleDigitsOutsideFacts(root) }).toEqual({ concept, strays: [] });
      }
    });
  }

  test('aucune fiche n’affiche de calcul : ni « Restera » ni « Après » (ce qui restera), ni niveau d’après la frappe', () => {
    for (const [name, progress] of FIXTURES()) {
      for (const concept of progressionConcepts(progress)) {
        const page = fiche(concept, progress);
        const spent = [...page.querySelectorAll('[data-game-spend] [data-chip]')].map((node) => node.getAttribute('data-chip'));
        expect({ name, concept, spent: spent.filter((fact) => fact !== 'spend_held' && fact !== 'spend_cost' && fact !== 'score') }).toEqual({ name, concept, spent: [] });
        expect({ name, concept, words: /\b(Restera|Après)\b/.test(plain(page.textContent)) }).toEqual({ name, concept, words: false });
        expect({ name, concept, drop: plain(page.querySelector('#game-mint')?.textContent).includes('→') }).toEqual({ name, concept, drop: false });
      }
    }
  });
});

describe('la fiche des Étincelles : ta lumière, ce que tu possèdes', () => {
  test('la tête est la poche, jamais le cycle ni le total à vie', () => {
    const page = fiche('points', porteur());
    const head = page.querySelector('[data-fiche-head]');
    expect(head?.getAttribute('data-fact')).toBe('sparks_pocket');
    expect(plain(head?.textContent)).toBe('108 233 étincelles');
    expect(head?.className).toContain('text-large-title');
    expect(plain(page.querySelector('[data-fiche-label]')?.textContent)).toBe('Ta lumière');
    expect(plain(page.querySelector('[data-fact="sparks_lifetime"]')?.textContent)).toBe('377 752 reçues depuis toujours');
    expect(occurrences(page, '108 233')).toBe(1);
    expect(occurrences(page, '377 752')).toBe(1);
  });

  test('le prix de la prochaine Meesh n’y paraît pas : un lien mène à l’Héritage', () => {
    const page = fiche('points', porteur());
    expect(occurrences(page, '10 423')).toBe(0);
    expect(page.querySelector('a[href="/me/progression/concept/meesh"]')).not.toBeNull();
    expect(page.querySelector('[data-fiche-section="where"]')).toBeNull();
  });

  test('une ombre se dit en une ligne, avant la tête', () => {
    const page = fiche('points', shadowed());
    const nodes = [...page.querySelectorAll('[data-fiche-shadow], [data-fiche-head]')].map((node) => (node.hasAttribute('data-fiche-shadow') ? 'ombre' : 'tête'));
    expect(nodes).toEqual(['ombre', 'tête']);
    expect(plain(page.querySelector('[data-fiche-shadow]')?.textContent)).toContain('640');
  });
});

describe('la fiche de l’Héritage : le contenant en tête, la frappe dans son cadre', () => {
  test('la tête : « Ton Coffret », 88 Meeshes en grand, le contenant suivant, les frappées depuis toujours', () => {
    const page = fiche('meesh', porteur());
    const head = page.querySelector('[data-fiche-head]');
    expect(head?.getAttribute('data-fact')).toBe('meesh_held');
    expect(plain(head?.textContent)).toBe('88 Meeshes');
    expect(head?.className).toContain('text-large-title');
    expect(plain(page.querySelector('[data-fiche-label]')?.textContent)).toBe('Ton Coffret');
    expect(plain(page.querySelector('[data-fact="treasury_next"]')?.textContent)).toBe('le Coffre s’ouvre à 100');
    expect(plain(page.querySelector('[data-fact="minted"]')?.textContent)).toBe('91 frappées depuis toujours');
  });

  test('la frappe : la scène sur toute la largeur, la Meesh n° 92, le prix UNE fois dans une phrase, la gloire dans le bouton, une phrase de Mee', () => {
    const page = fiche('meesh', porteur());
    const frame = page.querySelector('#game-mint');
    expect(frame?.querySelector('[data-game-mint-band] [data-game-mint-scene]')).not.toBeNull();
    expect(frame?.querySelector('[data-game-mint-band]')?.className).toContain('w-full');
    expect(plain(frame?.querySelector('[data-fact="mint_next"]')?.textContent)).toBe('La Meesh n° 92');
    expect(plain(frame?.querySelector('[data-facts="mint_price sparks_pocket"]')?.textContent)).toBe('Elle fige 10 423 étincelles de ta lumière, qui en compte 108 233.');
    expect(plain(frame?.querySelector('[data-game-mint-action] [data-fact="mint_glory"]')?.textContent)).toBe('+1 000 de gloire');
    expect(plain(frame?.querySelector('[data-game-mint-mee]')?.textContent)).not.toBe('');
    expect(occurrences(page, '10 423')).toBe(1);
    expect(occurrences(page, '108 233')).toBe(1);
  });

  test('l’ordre : le contenant, puis la frappe, puis « C’est quoi ? » — et plus de « Où j’en suis » qui redit la tête', () => {
    const page = fiche('meesh', porteur());
    const order = [...page.querySelectorAll('[data-fiche-head], #game-mint, [data-fiche-section="what"]')].map((node) =>
      node.hasAttribute('data-fiche-head') ? 'tête' : node.id === 'game-mint' ? 'frappe' : 'quoi',
    );
    expect(order).toEqual(['tête', 'frappe', 'quoi']);
    expect(page.querySelector('[data-fiche-section="where"]')).toBeNull();
  });

  test('une frappe pas encore possible : ce qu’il manque, dit une fois, sans bouton', () => {
    const page = fiche('meesh', short());
    expect(page.querySelector('[data-game-mint-action]')).toBeNull();
    expect(plain(page.querySelector('[data-fact="mint_missing"]')?.textContent)).toContain('2 423');
    expect(occurrences(page, '2 423')).toBe(1);
  });
});

describe('dans les sept langues', () => {
  for (const language of SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[]) {
    test(`${language} : l’Héritage et les Étincelles gardent un fait par rendu`, () => {
      document.documentElement.lang = language;
      document.documentElement.dir = interfaceDirection(language);
      for (const concept of ['meesh', 'points'] as const) {
        for (const progress of [porteur(), short(), shadowed()]) expect({ language, concept, repeated: repeated(identities(fiche(concept, progress))) }).toEqual({ language, concept, repeated: [] });
      }
      expect(plain(fiche('meesh', porteur()).querySelector('[data-fiche-label]')?.textContent)).not.toBe('');
    });
  }
});
