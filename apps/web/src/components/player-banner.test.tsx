import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameBlockFacts } from '@meeshy/shared/utils/game/game-block';

import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { playerBannerLabel, playerBannerModel, type PlayerBannerModel } from '@/lib/view/player-banner';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PlayerBanner } from './player-banner';

/**
 * LA BANNIÈRE DU JOUEUR (#9494) — dans le bandeau du haut quand rien ne joue.
 * Seulement ce qui existe, dans un ordre fixe ; UN seul élément lu, nommé
 * d'une phrase complète ; un toucher ouvre Progression.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
});
afterEach(unmountAll);
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const NEWCOMER: Partial<GameBlockFacts> = { score: 12, glory: 0, balance: 0, mintedLifetime: 0, streak: 0, freezes: 0, lastActiveDay: null, debitablePoints: 12 };
const newcomer = (): PlayerBannerModel => playerBannerModel(gameBlockFixture(NEWCOMER));
const markup = (model: PlayerBannerModel): string => renderToStaticMarkup(<PlayerBanner model={model} />);

const PIECES = ['meeshes', 'rank', 'league', 'flame'] as const;
const piecesIn = (html: string): readonly string[] => PIECES.filter((piece) => html.includes(`data-player-banner-${piece}=`));

describe('seulement ce qui existe', () => {
  test('un nouveau joueur ne voit que son anneau et sa jauge', () => {
    const html = markup(newcomer());
    expect(html).toContain('data-player-banner-ring=');
    expect(html).toContain('data-player-banner-gauge=');
    expect(piecesIn(html)).toEqual([]);
  });

  test('ni zéro, ni tiret, ni case vide chez le nouveau joueur', () => {
    const visible = markup(newcomer()).replace(/<[^>]+>/g, ' ');
    expect(visible).not.toMatch(/(^|\s)[0O](\s|$)|—|–|(^|\s)-(\s|$)/);
  });

  const alone: ReadonlyArray<readonly [(typeof PIECES)[number], PlayerBannerModel]> = [
    ['meeshes', { ...newcomer(), meeshes: 1 }],
    ['rank', { ...newcomer(), rank: { rank: 'murmure', division: 3 } }],
    ['league', { ...newcomer(), league: { league: 'jade', place: 4 } }],
    ['flame', { ...newcomer(), flame: { form: 'braise', days: 3 } }],
  ];
  for (const [piece, model] of alone) {
    test(`${piece} apparaît seul quand sa donnée existe`, () => {
      expect(piecesIn(markup(model))).toEqual([piece]);
    });
  }

  test('l’ordre est fixe : anneau, jauge, Meeshes, rang, ligue, Flamme', () => {
    const html = markup(playerBannerModel(gameBlockWithExtrasFixture({ balance: 12, streak: 23 })));
    const order = ['ring', 'gauge', ...PIECES].map((piece) => html.indexOf(`data-player-banner-${piece}=`));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('la jauge dit les points et ce qu’il manque ; au sommet, plus rien ne manque', () => {
    const model = newcomer();
    expect(markup(model)).toContain('data-player-banner-missing=');
    expect(markup({ ...model, nextLevel: null, pointsToNext: null, progress: 1 })).not.toContain('data-player-banner-missing=');
  });
});

describe('le décor', () => {
  test('la Signature en filigrane, teintée par la couleur du palier', () => {
    const html = markup(newcomer());
    expect(html).toMatch(/data-player-banner-watermark=""[^>]*style="[^"]*color:var\(--game-tier-etincelle\)/);
  });
});

describe('accessible', () => {
  test('UN seul élément lu, nommé d’une phrase complète ; tout le reste est caché au lecteur d’écran', async () => {
    const model = playerBannerModel(gameBlockWithExtrasFixture({ balance: 12, streak: 23 }));
    const host = await mount(<PlayerBanner model={model} />);
    const link = host.querySelector('a[data-player-banner]');
    expect(link?.getAttribute('aria-label')).toBe(playerBannerLabel(model, 'fr'));
    for (const child of Array.from(link?.children ?? [])) expect(child.getAttribute('aria-hidden')).toBe('true');
  });

  test('une cible d’au moins 44 px', () => {
    expect(markup(newcomer())).toMatch(/data-player-banner=""[^>]*min-height:(4[4-9]|[5-9]\d)px/);
  });
});

describe('le toucher', () => {
  test('un toucher ouvre Progression', async () => {
    const host = await mount(<PlayerBanner model={newcomer()} />);
    const link = host.querySelector<HTMLAnchorElement>('a[data-player-banner]');
    expect(link?.getAttribute('href')).toBe('/me/progression');
    await click(link);
    expect(window.location.pathname).toBe('/me/progression');
  });
});
