import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameSeasonBlock } from '@meeshy/shared/types/game';
import type { GameSeasonArchive } from '@meeshy/shared/types/game-archive';
import { DEFAULT_SEASON_SCHEDULE, type SeasonSchedule } from '@meeshy/shared/utils/game/season-schedule';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameSeasonArchiveView, seasonHeaderCount, seasonShown } from './game-archive';
import { GameSeason, type GameSeasonProps } from './game-season';

/**
 * LE CALENDRIER SERVI DANS LES ÉCRANS DE SAISON (#10232) — une saison future
 * montre son thème et sa date (jamais un vide), une saison en pause le dit,
 * les points d'étape sont ceux de la saison, et la loi de dérivation reste le
 * repli quand le calendrier n'est pas lu.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/saison/3' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const SERVED: SeasonSchedule = {
  revision: 6,
  seasons: [
    { number: 1, startDay: '2026-12-21', status: 'scheduled', themeKey: 'language:fr', stepPoints: 100, copy: null },
    { number: 2, startDay: '2027-03-01', status: 'scheduled', themeKey: 'language:ja', stepPoints: 150, copy: null },
    { number: 3, startDay: '2027-04-26', status: 'paused', themeKey: 'language:hi', stepPoints: 100, copy: null },
  ],
};
const NOW = { dayKey: '2027-02-01', minuteOfDay: 600 };
const none = { data: undefined, error: null } as const;
const game = gameBlockWithExtrasFixture();

describe('seasonShown avec le calendrier servi', () => {
  test('sans calendrier lu (repli) : la lecture froide reste « en chargement », rien n’est deviné', () => {
    expect(seasonShown(2, { ...game, season: null, seasonUpcoming: null }, none, NOW, DEFAULT_SEASON_SCHEDULE)).toEqual({ kind: 'loading' });
  });

  test('calendrier servi, cache froid, saison future : son thème et sa date se peignent sans réseau', () => {
    const shown = seasonShown(2, { ...game, season: null, seasonUpcoming: null }, none, NOW, SERVED);
    expect(shown).toEqual({ kind: 'upcoming', upcoming: { number: 2, themeKey: 'language:ja', startDay: '2027-03-01', endDay: '2027-04-25' } });
  });

  test('calendrier servi, saison ouverte d’après l’horloge : « ouverte », jamais le parcours d’une autre', () => {
    const shown = seasonShown(2, { ...game, season: null, seasonUpcoming: null }, none, { dayKey: '2027-03-05', minuteOfDay: 600 }, SERVED);
    expect(shown.kind).toBe('opened');
  });

  test('calendrier servi, saison passée sans palmarès lu : on attend la lecture', () => {
    expect(seasonShown(1, { ...game, season: null, seasonUpcoming: null }, none, { dayKey: '2027-06-01', minuteOfDay: 600 }, SERVED)).toEqual({ kind: 'loading' });
  });

  test('une saison en pause : elle le dit, avec son thème, même quand la lecture a échoué', () => {
    const shown = seasonShown(3, { ...game, season: null, seasonUpcoming: null }, { data: undefined, error: 'Erreur 404' }, NOW, SERVED);
    expect(shown).toEqual({ kind: 'paused', season: { number: 3, themeKey: 'language:hi' } });
  });

  test('une saison en pause qu’une copie gardée disait « à venir » : le calendrier plus récent l’emporte', () => {
    const archive: GameSeasonArchive = {
      number: 3,
      status: 'upcoming',
      themeKey: 'language:hi',
      startDay: '2027-04-26',
      endDay: '2027-06-20',
      weekKeys: ['2027-04-26', '2027-05-03', '2027-05-10', '2027-05-17', '2027-05-24', '2027-05-31', '2027-06-07', '2027-06-14'],
      progress: null,
    };
    expect(seasonShown(3, { ...game, season: null, seasonUpcoming: null }, { data: archive, error: null }, NOW, SERVED).kind).toBe('paused');
  });

  test('les saisons derrière une pause sont en pause aussi (dates retirées)', () => {
    expect(seasonShown(4, { ...game, season: null, seasonUpcoming: null }, none, NOW, SERVED).kind).toBe('paused');
  });

  test('l’en-tête de la page dit « en pause »', () => {
    expect(seasonHeaderCount({ kind: 'paused', season: { number: 3, themeKey: 'language:hi' } }, null)).toBe('Voyage 3 · en pause');
  });
});

describe('la carte d’une saison en pause', () => {
  test('numéro, état et thème ; aucune date inventée', async () => {
    const host = await mount(<GameSeasonArchiveView shown={{ kind: 'paused', season: { number: 3, themeKey: 'language:hi' } }} onRetry={() => undefined} skeleton={null} />);
    expect(host.querySelector('[data-game-season-paused="3"]')).not.toBeNull();
    expect(host.textContent).toContain('en pause');
    expect(host.textContent).toContain('Thème');
    expect(host.querySelector('[data-game-season-upcoming]')).toBeNull();
  });

  test('la page de la saison courante, sans saison ni à-venir mais avec une pause : la pause se dit, pas « aucune saison »', () => {
    const html = renderToStaticMarkup(<GameSeason {...base({ season: null, paused: { number: 3, themeKey: 'language:hi' } })} />);
    expect(html).toContain('data-game-season-paused="3"');
    expect(html).not.toContain('id="game-season-none"');
  });
});

const seasonBlock = (patch: Partial<GameSeasonBlock> = {}): GameSeasonBlock => {
  const block = game.season;
  if (block === undefined || block === null) throw new Error('la fixture porte la saison');
  return { ...block, ...patch };
};
const base = (patch: Partial<GameSeasonProps> = {}): GameSeasonProps => ({
  season: seasonBlock(),
  held: 12,
  online: true,
  claimingStep: null,
  buyingSeal: false,
  errors: {},
  onClaim: () => undefined,
  onBuySeal: () => undefined,
  ...patch,
});

describe('les points d’étape de la saison', () => {
  test('une saison à 150 points : chaque étape ordinaire annonce +150', () => {
    const html = renderToStaticMarkup(<GameSeason {...base({ season: seasonBlock({ stepPoints: 150 }) })} />);
    expect(html).toContain('aria-label="Halte 1, réclamée, +150"');
    expect(text(html)).toContain('Réclamer la halte 4 · +150');
  });

  test('sans `stepPoints` (ancien serveur) : la loi, 100', () => {
    const { stepPoints: _omitted, ...served } = seasonBlock({ stepPoints: 150 });
    const html = renderToStaticMarkup(<GameSeason {...base({ season: served })} />);
    expect(html).toContain('aria-label="Halte 1, réclamée, +100"');
  });

  test('les récompenses spéciales ne changent pas (fragment, gel, coupe)', () => {
    const html = renderToStaticMarkup(<GameSeason {...base({ season: seasonBlock({ stepPoints: 200 }) })} />);
    expect(html).toContain('Halte 5, à réclamer, Un fragment d’étoile');
  });
});
