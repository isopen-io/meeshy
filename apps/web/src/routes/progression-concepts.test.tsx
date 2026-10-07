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
import { conceptView, ficheView, type DetailRef } from '@/lib/view/progression-concepts';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProgressionBody } from './progression';
import { ConceptFiche } from './progression-concept';
import type { GameActions } from './progression-game-actions';

/**
 * « PROGRESSION » EN SOUS-MENUS (#9563) — la première page ne porte que des
 * cartes de concept (tête, données importantes, à quoi ça sert, comment ça
 * marche), chaque concept a sa fiche où vivent ses données et ses gestes. Les
 * deux écrans parcourent la MÊME liste (`progressionConcepts`, `packages/shared`).
 * Le tableau de bord n'existe plus (amendement n° 4) : il redisait la première
 * page et les fiches.
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

  test('plus de tableau de bord : les cartes d’abord, puis carnet, règles, réglages', () => {
    const rows = [...page().querySelectorAll('[data-progression-row]')].map((row) => [row.getAttribute('data-progression-row'), row.getAttribute('href')]);
    expect(rows).toEqual([
      ['carnet', '/me/progression/carnet'],
      ['regles', '/me/progression/regles'],
      ['reglages', '/me/progression/reglages'],
    ]);
    const order = [...page().querySelectorAll('[data-progression-row], [data-concept-card]')].map((node) => node.getAttribute('data-progression-row') ?? 'carte');
    expect(order[0]).toBe('carte');
    expect(order.slice(-3)).toEqual(['carnet', 'regles', 'reglages']);
    expect(page().querySelector('a[href="/me/progression/tableau-de-bord"]')).toBeNull();
  });

  test('chaque carte et chaque ligne est une cible de 44 points', () => {
    for (const target of page().querySelectorAll('[data-concept-card], [data-progression-row]')) {
      expect((target as HTMLElement).style.minHeight).toBe('44px');
    }
  });

  test('une jauge de carte se remplit depuis sa valeur précédente : elle porte le repère que le style anime', () => {
    const fills = [...page().querySelectorAll('[data-concept-card] [role="progressbar"] [data-game-gauge-fill]')];
    expect(fills.length).toBe(page().querySelectorAll('[data-concept-card] [role="progressbar"]').length);
    expect(fills.length).toBeGreaterThan(5);
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

  test('les portes du jeu (carnet, règles, réglages) n’existent pas sans jeu', () => {
    expect(page().querySelectorAll('[data-progression-row]')).toHaveLength(0);
  });

  test('chaque concept restant a sa fiche', () => {
    for (const concept of progressionConcepts(before)) {
      expect({ concept, fiche: fiche(concept, before).querySelector('[data-concept-fiche]') !== null }).toEqual({ concept, fiche: true });
    }
  });

  test('la fiche des Meeshes garde la frappe d’avant', () => {
    const canMint: EngagementWithGame = { ...before, meesh: { ...(before.meesh ?? { balance: 0, mintedLifetime: 0, debitablePoints: 0, floorPoints: 0, mintCost: 1200, progress: 1, firstMintedAt: null, lastMintedAt: null }), missingPoints: 0, canMint: true } };
    expect(fiche('meesh', canMint).querySelector('button')).not.toBeNull();
  });
});

describe('la fiche d’un concept : même gabarit partout', () => {
  for (const concept of PROGRESSION_CONCEPTS) {
    test(`${concept} : héros, « C’est quoi ? », « Où j’en suis » s’il reste une donnée, « Comment en gagner », dans cet ordre`, () => {
      const page = fiche(concept, playing);
      const shown = ficheView(concept, playing, NOW);
      const sections = [...page.querySelectorAll('[data-fiche-section]')].map((section) => section.getAttribute('data-fiche-section'));
      expect(sections.slice(0, shown.facts.length === 0 ? 3 : 4)).toEqual(shown.facts.length === 0 ? ['hero', 'what', 'earn'] : ['hero', 'what', 'where', 'earn']);
      if (shown.hero === 'generic') expect(page.querySelector('[data-fiche-section="hero"]')?.textContent).toContain(conceptView(concept, playing, NOW).value);
      expect(page.querySelectorAll('[data-fiche-section="where"] li').length).toBe(shown.facts.length);
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
    test(`${concept} : « Aller plus loin » mène à sa sous-page ${href}, et à rien d’autre`, () => {
      const more = fiche(concept, playing).querySelector('[data-fiche-section="more"]');
      expect([...(more?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href'))).toEqual([href]);
    });
  }

  test('une fiche sans sous-page n’a pas de « Aller plus loin » : aucun lien transverse vers les règles', () => {
    for (const concept of ['level', 'points', 'meesh', 'glory', 'flame', 'missions', 'elans'] as const) {
      expect({ concept, more: fiche(concept, playing).querySelector('[data-fiche-section="more"]') !== null }).toEqual({ concept, more: false });
    }
    for (const concept of PROGRESSION_CONCEPTS) expect({ concept, rules: fiche(concept, playing).querySelector('a[href="/me/progression/regles"]') !== null }).toEqual({ concept, rules: false });
  });

  test('un concept que le serveur ne sert pas n’a pas de fiche : la page le dit', () => {
    const page = fiche('league', before);
    expect(page.querySelector('[data-concept-fiche]')).toBeNull();
    expect(page.querySelector('[data-fiche-unknown]')).not.toBeNull();
  });
});

describe('« Jeu masqué »', () => {
  /* La carte masquée REMPLACE la liste (#9563, amendement n° 2) : ni carte de concept, ni tableau de bord, ni portes du jeu. Elle porte seule de quoi réafficher le jeu et ouvrir ses réglages. */
  test('la carte masquée remplace la liste : aucune carte de concept, aucune autre entrée', () => {
    gamePrefs.set({ hidden: true });
    const page = hub(playing);
    expect(page.querySelector('#game-hidden')).not.toBeNull();
    expect(cards(page)).toEqual([]);
    expect(page.querySelectorAll('[data-progression-row]')).toHaveLength(0);
    expect(page.querySelector('#game-hidden a[href="/me/progression/reglages"]')).not.toBeNull();
    expect(page.querySelector('#game-hidden [data-game-show]')).not.toBeNull();
  });

  test('la fiche d’un concept ne montre que la carte masquée', () => {
    gamePrefs.set({ hidden: true });
    for (const concept of ['missions', 'badges', 'level'] as const) {
      const page = fiche(concept, playing);
      expect({ concept, fiche: page.querySelector('[data-concept-fiche]') !== null, card: page.querySelector('#game-hidden') !== null }).toEqual({ concept, fiche: false, card: true });
    }
  });

  test('devant un ancien serveur, « masqué » ne masque rien : il n’y a pas de jeu à masquer', () => {
    gamePrefs.set({ hidden: true });
    expect(cards(hub(before))).toEqual([...progressionConcepts(before)]);
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

/**
 * LES TROIS RÈGLES DE DÉDOUBLONNAGE (#9563, amendement n° 4), posées dans
 * `conceptView` et `ficheView` :
 *   1. une donnée appartient à UN concept ;
 *   2. une pastille ou une ligne ne redit jamais la valeur de tête ;
 *   3. dans la fiche, une pièce de jeu REMPLACE le héros, et « Où j'en suis » ne
 *      liste ni la valeur montrée ni ce que la pièce montre.
 */
const refKey = (ref: DetailRef): string => {
  switch (ref.kind) {
    case 'fact':
      return ref.fact;
    case 'element':
      return `element:${ref.family}`;
    case 'elan':
      return `elan:${ref.family}`;
    case 'note':
      return 'note';
  }
};

const refsOf = (concept: ProgressionConcept, progress: EngagementWithGame): readonly string[] => {
  const view = conceptView(concept, progress, NOW);
  return [...view.chips.map((chip) => refKey(chip.ref)), ...view.facts.map((fact) => refKey(fact.ref))];
};

const owners = (progress: EngagementWithGame, key: string): readonly ProgressionConcept[] =>
  progressionConcepts(progress).filter((concept) => refsOf(concept, progress).includes(key));

const withGame = (patch: (game: NonNullable<EngagementWithGame['game']>) => NonNullable<EngagementWithGame['game']>): EngagementWithGame => ({
  ...playing,
  game: patch(gameBlockWithExtrasFixture()),
});

describe('règle 1 — une donnée appartient à un seul concept', () => {
  const windy = withGame((game) => ({ ...game, boosts: { ...game.boosts, tailwind: 3 }, level: { ...game.level, prestige: 2 }, prestige: game.prestige === undefined ? undefined : { ...game.prestige, stars: 2 } }));
  const short = withGame((game) => ({ ...game, mint: { ...game.mint, canMint: false, missingPoints: 120 } }));

  test('le score est à Points, le multiplicateur à Élans, les étoiles à Prestige, le prix de la Meesh à Meeshes', () => {
    expect(owners(windy, 'score')).toEqual(['points']);
    expect(owners(windy, 'factor')).toEqual(['elans']);
    expect(owners(windy, 'tailwind')).toEqual(['elans']);
    expect(owners(windy, 'element:star')).toEqual(['prestige']);
    expect(owners(windy, 'mint_price')).toEqual(['meesh']);
    expect(owners(windy, 'mint_next')).toEqual(['meesh']);
  });

  test('ce qui manque pour frapper est à Points ; la frappe possible, à Meeshes', () => {
    expect(owners(short, 'mint_missing')).toEqual(['points']);
    expect(owners(playing, 'can_mint')).toEqual(['meesh']);
    expect(owners(playing, 'mint_missing')).toEqual([]);
  });

  test('devant un ancien serveur, sans Points, le score reste au Niveau et le manque à Meeshes', () => {
    const short: EngagementWithGame = { ...before, meesh: before.meesh === undefined ? undefined : { ...before.meesh, canMint: false, missingPoints: 120 } };
    expect(owners(short, 'score')).toEqual(['level']);
    expect(owners(short, 'mint_missing')).toEqual(['meesh']);
  });
});

describe('règle 2 — une ligne ne redit jamais la valeur de tête', () => {
  for (const [name, progress] of [['jeu', playing], ['ancien serveur', before]] as const) {
    test(`${name} : aucune pastille ni aucune ligne n’est la valeur de la carte`, () => {
      for (const concept of progressionConcepts(progress)) {
        const view = conceptView(concept, progress, NOW);
        for (const text of [...view.chips.map((chip) => chip.text), ...view.facts.map((fact) => fact.value)]) {
          expect({ concept, text, repeats: text === view.value }).toEqual({ concept, text, repeats: false });
        }
      }
    });
  }

  test('la Ligue a pour valeur sa ligue, la place est une pastille', () => {
    const game = gameBlockWithExtrasFixture();
    const current = game.league?.current;
    const view = conceptView('league', playing, NOW);
    expect(current).not.toBeNull();
    expect(view.value).not.toContain(String(current?.rank));
    expect(view.chips[0]?.text).toContain(String(current?.groupSize));
  });

  test('au plus trois pastilles par carte, partout', () => {
    for (const progress of [playing, before]) for (const concept of progressionConcepts(progress)) expect(conceptView(concept, progress, NOW).chips.length).toBeLessThanOrEqual(3);
  });
});

describe('règle 3 — dans la fiche, une pièce de jeu remplace le héros', () => {
  const PIECES = [
    ['level', '#game-level'],
    ['league', '[data-game-league-summary]'],
    ['elans', '#progression-elans'],
    ['meesh', '#game-mint'],
  ] as const;

  for (const [concept, piece] of PIECES) {
    test(`${concept} : la pièce est le héros, montrée une fois, sans héros générique`, () => {
      const page = fiche(concept, playing);
      const hero = page.querySelectorAll('[data-fiche-section="hero"]');
      expect(hero).toHaveLength(1);
      expect(hero[0]?.getAttribute('data-fiche-hero')).toBe('piece');
      expect(hero[0]?.querySelector(piece)).not.toBeNull();
      expect(page.querySelectorAll(piece)).toHaveLength(1);
      expect(ficheView(concept, playing, NOW).hero).toBe('piece');
    });
  }

  test('« Où j’en suis » ne liste pas ce que la pièce montre', () => {
    const where = (concept: ProgressionConcept): readonly string[] => ficheView(concept, playing, NOW).facts.map((fact) => refKey(fact.ref));
    expect(where('level')).toEqual([]);
    for (const key of where('meesh')) expect(['element:coin', 'element:treasury', 'minted']).toContain(key);
    for (const key of where('league')) expect(['league_zone', 'league_missing', 'league_friends']).toContain(key);
    for (const key of where('elans')) expect(['tailwind']).toContain(key);
    expect(fiche('level', playing).querySelector('[data-fiche-section="where"]')).toBeNull();
  });

  test('un héros générique ne redit pas ses données dans « Où j’en suis »', () => {
    for (const concept of progressionConcepts(playing)) {
      const shown = ficheView(concept, playing, NOW);
      const value = conceptView(concept, playing, NOW).value;
      if (shown.hero === 'generic') for (const fact of shown.facts) expect({ concept, value: fact.value === value }).toEqual({ concept, value: false });
    }
  });
});

/**
 * CE QUI DEMANDE UNE ACTION PASSE EN PREMIER (#9563, amendement n° 4, carte de
 * navigation § 4) — une pastille d'action au plus, en tête, teintée ; l'ordre des
 * cartes ne bouge pas.
 */
describe('la carte montre d’abord ce qui demande une action', () => {
  const firstChip = (progress: EngagementWithGame, concept: ProgressionConcept): string | undefined =>
    hub(progress).querySelector(`[data-concept-card="${concept}"] [data-chip]`)?.textContent ?? undefined;
  const urgent = (progress: EngagementWithGame): readonly string[] =>
    [...hub(progress).querySelectorAll('[data-concept-card][data-concept-urgent]')].map((card) => card.getAttribute('data-concept-card') ?? '');

  test('frappe possible : en tête de la carte des Meeshes', () => {
    expect(firstChip(playing, 'meesh')).toBe('Frappe possible');
    expect(urgent(playing)).toEqual(['meesh']);
  });

  test('coffre prêt : en tête de la carte des Missions', () => {
    const ready = withGame((game) => ({ ...game, chest: { ...game.chest, status: 'ready' } }));
    expect(firstChip(ready, 'missions')).toBe('Coffre prêt');
    expect(urgent(ready)).toContain('missions');
  });

  test('mission qui expire : « Se termine dans … » en tête de la carte des Missions', () => {
    const item = gameBlockWithExtrasFixture().missions.items[0];
    if (item === undefined) throw new Error('fixture sans mission');
    const personal = { ...item, completedAt: null, startsAt: new Date(NOW.getTime() - 3_600_000).toISOString(), endsAt: new Date(NOW.getTime() + 1_800_000).toISOString(), state: 'active' as const };
    const expiring = withGame((game) => ({ ...game, missions: { ...game.missions, personal } }));
    expect(firstChip(expiring, 'missions')).toStartWith('Se termine dans');
  });

  test('Flamme en danger : en tête de la carte de la Flamme', () => {
    const risky = withGame((game) => ({ ...game, flame: { ...game.flame, status: 'at-risk' } }));
    expect(firstChip(risky, 'flame')).toBe('Fais un geste avant minuit');
    expect(urgent(risky)).toContain('flame');
  });

  test('Prestige possible : en tête de la carte du Prestige', () => {
    const ready = withGame((game) => ({ ...game, prestige: game.prestige === undefined ? undefined : { ...game.prestige, canPrestige: true } }));
    expect(firstChip(ready, 'prestige')).toBe('Tu peux passer en Prestige');
  });

  test('rien à faire : aucune carte ne se signale, et l’ordre des cartes ne change jamais', () => {
    const calm = withGame((game) => ({ ...game, mint: { ...game.mint, canMint: false, missingPoints: 50 } }));
    expect(urgent(calm)).toEqual([]);
    const ready = withGame((game) => ({ ...game, chest: { ...game.chest, status: 'ready' }, flame: { ...game.flame, status: 'at-risk' } }));
    expect(cards(hub(ready))).toEqual(cards(hub(calm)));
  });
});
