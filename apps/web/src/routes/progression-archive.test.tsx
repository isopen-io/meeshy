import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { GameLeagueWeekArchive, GameSeasonArchive } from '@meeshy/shared/types/game-archive';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { QueryClient, QueryClientProvider, QueryObserver, onlineManager } from '@tanstack/react-query';

import { leagueShown, needsLeagueWeekArchive, needsSeasonArchive, seasonHeaderCount, seasonShown } from '@/components/game-archive';
import { ENGAGEMENT_PROGRESS_QUERY_KEY } from '@/lib/api/engagement';
import { seasonArchiveQuery, seasonArchiveQueryKey } from '@/lib/api/game-archive';
import type { HttpTransport } from '@/lib/api/http';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { GameV2Actions } from './game-v2-actions';
import { LigueWeekFocus } from './progression-ligue';
import { ProgressionSaisonPage, SaisonFocusBody } from './progression-saison';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/saison/2' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const game = gameBlockWithExtrasFixture({ balance: 12 });
const progress = (g = game): EngagementWithGame => ({ ...base, game: g });
const currentSeason = game.season?.number ?? 1;
const currentWeek = game.league?.weekKey ?? '2026-10-12';

const gesture = <V,>() => ({ run: (_: V) => undefined, pending: false, vars: undefined as V | undefined, error: undefined });
const actions = (): GameV2Actions => ({
  consent: gesture(),
  pseudonym: gesture(),
  invite: gesture(),
  accept: gesture(),
  abandon: gesture(),
  claimStep: gesture(),
  buySeal: gesture(),
  saveOrder: gesture(),
  visibility: gesture(),
  prestige: gesture(),
});

const WEEKS = ['2027-02-15', '2027-02-22', '2027-03-01', '2027-03-08', '2027-03-15', '2027-03-22', '2027-03-29', '2027-04-05'];
const season = (patch: Partial<GameSeasonArchive> = {}): GameSeasonArchive => ({
  number: currentSeason + 1,
  status: 'past',
  themeKey: 'language:es',
  startDay: '2027-02-15',
  endDay: '2027-04-11',
  weekKeys: WEEKS,
  progress: { stars: 160, steps: 40, claimedSteps: [1, 2, 3], sealOwned: true, completed: true, settled: true },
  ...patch,
});
const week = (patch: Partial<GameLeagueWeekArchive> = {}): GameLeagueWeekArchive => ({
  weekKey: '2026-10-05',
  status: 'past',
  season: null,
  retention: 'kept',
  result: { league: 'jade', finalRank: 3, finalPoints: 410, zone: 'promotion', cup: 'bronze', settled: true },
  ...patch,
});

const none = { data: undefined, error: null } as const;

const waitUntil = async (done: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (!done()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition jamais atteinte');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe('la page Saison sous un lien (#10018)', () => {
  test('la saison en cours, ou sans lien : la page d’avant, sans aucune lecture', async () => {
    expect(needsSeasonArchive(null, game)).toBe(false);
    expect(needsSeasonArchive(currentSeason, game)).toBe(false);
    const host = await mount(<SaisonFocusBody progress={progress()} focus={currentSeason} read={none} onRetry={() => undefined} actions={actions()} online />);
    expect(host.querySelector('[data-game-season-path]')).not.toBeNull();
    expect(host.querySelector('#game-season-archive')).toBeNull();
  });

  test('une saison passée : mon palmarès — étapes, coupe, Sceau', async () => {
    const focus = currentSeason + 1;
    expect(needsSeasonArchive(focus, game)).toBe(true);
    const host = await mount(<SaisonFocusBody progress={progress()} focus={focus} read={{ data: season(), error: null }} onRetry={() => undefined} actions={actions()} online />);
    expect(host.querySelector('#game-season-archive')).not.toBeNull();
    expect(host.textContent).toContain(`Voyage ${focus} · terminé`);
    expect(host.querySelector('[data-game-season-archive-cup="won"]')).not.toBeNull();
    expect(host.querySelector('[data-game-season-archive-seal]')).not.toBeNull();
    expect(host.textContent).toContain('3 récompenses réclamées');
    expect(host.querySelector('[data-game-season-path]')).toBeNull();
  });

  test('une saison passée non jouée le dit', async () => {
    const host = await mount(<SaisonFocusBody progress={progress()} focus={currentSeason + 1} read={{ data: season({ progress: null }), error: null }} onRetry={() => undefined} actions={actions()} online />);
    expect(host.querySelector('[data-game-season-archive-unplayed]')).not.toBeNull();
  });

  test('une saison future : son thème et sa date d’ouverture, jamais un vide', async () => {
    const host = await mount(
      <SaisonFocusBody progress={progress()} focus={currentSeason + 1} read={{ data: season({ status: 'upcoming', progress: null }), error: null }} onRetry={() => undefined} actions={actions()} online />,
    );
    expect(host.querySelector('[data-game-season-upcoming="2027-02-15"]')).not.toBeNull();
    expect(host.textContent).toContain('Thème');
  });

  test('la saison à venir que le bloc porte se peint SANS attendre la lecture', () => {
    const upcoming = { number: 1, themeKey: 'language:fr', startDay: '2026-12-21', endDay: '2027-02-14' };
    const waiting = { ...game, season: null, seasonUpcoming: upcoming };
    expect(needsSeasonArchive(1, waiting)).toBe(false);
    expect(seasonShown(1, waiting, none)).toEqual({ kind: 'upcoming', upcoming });
  });

  test('servie « en cours » par la passerelle, et le bloc la porte : la page d’avant', () => {
    expect(seasonShown(currentSeason, game, { data: season({ number: currentSeason, status: 'current' }), error: null })).toEqual({ kind: 'current' });
  });

  test('servie « en cours » quand le bloc gardé en porte une autre : la saison ouverte, jamais le parcours d’une autre (#10131)', () => {
    const shown = seasonShown(currentSeason + 1, game, { data: season({ status: 'current' }), error: null }, { dayKey: '2027-02-20', minuteOfDay: 600 });
    expect(shown).toEqual({ kind: 'opened', season: { number: currentSeason + 1, themeKey: 'language:es', startDay: '2027-02-15', endDay: '2027-04-11' } });
  });

  test('hors ligne, cache froid : l’échec dit et propose de relire', async () => {
    let retried = 0;
    const host = await mount(
      <SaisonFocusBody progress={progress()} focus={currentSeason + 1} read={{ data: undefined, error: 'Hors ligne' }} onRetry={() => (retried += 1)} actions={actions()} online={false} />,
    );
    expect(host.textContent).toContain('Hors ligne');
    await click(host.querySelector('[data-game-archive-retry]'));
    expect(retried).toBe(1);
  });

  test('hors ligne, une copie en cache : elle s’affiche, l’échec se tait', async () => {
    const host = await mount(<SaisonFocusBody progress={progress()} focus={currentSeason + 1} read={{ data: season(), error: null }} onRetry={() => undefined} actions={actions()} online={false} />);
    expect(host.querySelector('#game-season-archive')).not.toBeNull();
    expect(host.querySelector('[data-game-archive-retry]')).toBeNull();
  });

  test('la copie d’une AUTRE saison ne se montre jamais sous ce lien', () => {
    expect(seasonShown(currentSeason + 2, game, { data: season(), error: null })).toEqual({ kind: 'loading' });
  });
});

/**
 * UNE SAISON « À VENIR » GARDÉE HORS LIGNE BASCULE D'ELLE-MÊME LE JOUR DE SON OUVERTURE (#10131) — l'état se calcule
 * sur les dates servies et l'horloge locale (`liveSeasonTense`), la copie se relit au retour du réseau.
 */
describe('la saison à venir gardée hors ligne, le jour J (#10131)', () => {
  const upcomingCopy = () => season({ status: 'upcoming', progress: null });
  const EVE = { dayKey: '2027-02-14', minuteOfDay: 19 * 60 + 59 };
  const OPENING = { dayKey: '2027-02-15', minuteOfDay: 9 * 60 };

  test('la veille, avant la fermeture de 20 h : encore à venir', () => {
    expect(seasonShown(currentSeason + 1, game, { data: upcomingCopy(), error: null }, EVE).kind).toBe('upcoming');
  });

  test('le jour J, sans réseau : la copie bascule sur « en cours »', async () => {
    const shown = seasonShown(currentSeason + 1, game, { data: upcomingCopy(), error: null }, OPENING);
    expect(shown.kind).toBe('opened');
    const host = await mount(
      <SaisonFocusBody progress={progress()} focus={currentSeason + 1} read={{ data: upcomingCopy(), error: null }} onRetry={() => undefined} actions={actions()} online={false} moment={OPENING} />,
    );
    expect(host.querySelector('#game-season-opened')).not.toBeNull();
    expect(host.textContent).toContain(`Voyage ${currentSeason + 1} · en cours`);
    expect(host.querySelector('[data-game-season-upcoming]')).toBeNull();
  });

  test('la saison à venir que le BLOC gardé porte bascule aussi, sur la page sans lien comme sous le lien', async () => {
    const upcoming = { number: 1, themeKey: 'language:fr', startDay: '2026-12-21', endDay: '2027-02-14' };
    const waiting = { ...game, season: null, seasonUpcoming: upcoming };
    const opening = { dayKey: '2026-12-21', minuteOfDay: 600 };
    expect(seasonShown(1, waiting, none, opening)).toEqual({ kind: 'opened', season: upcoming });
    const host = await mount(<SaisonFocusBody progress={progress(waiting)} focus={null} read={none} onRetry={() => undefined} actions={actions()} online={false} moment={opening} />);
    expect(host.querySelector('#game-season-opened')).not.toBeNull();
    expect(host.querySelector('[data-game-season-upcoming]')).toBeNull();
  });

  test('la copie se RELIT au retour du réseau', async () => {
    let reads = 0;
    const transport = {
      request: async () => {
        reads += 1;
        return { ok: true, status: 200, data: upcomingCopy() };
      },
    } as unknown as HttpTransport;
    const client = new QueryClient();
    // Monté comme l'application le monte : c'est `mount` qui abonne le cache au retour du réseau.
    client.mount();
    const observer = new QueryObserver(client, seasonArchiveQuery({ number: currentSeason + 1, enabled: true, deps: { source: 'gateway', transport } }));
    const stop = observer.subscribe(() => undefined);
    try {
      // La première lecture est ARRIVÉE (une lecture en vol ne se relance pas) : la copie est en cache.
      await waitUntil(() => observer.getCurrentResult().status === 'success' && observer.getCurrentResult().fetchStatus === 'idle');
      expect(reads).toBe(1);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await waitUntil(() => reads === 2);
      expect(reads).toBe(2);
    } finally {
      stop();
      client.unmount();
      client.clear();
    }
  });
});

/**
 * L'EN-TÊTE D'UNE ARCHIVE MONTRE LA SAISON DU LIEN (#10132) — son numéro et son état, comme iOS ; jamais le compteur
 * de la saison en cours sous le lien d'une autre.
 */
describe('l’en-tête de la page Saison sous un lien (#10132)', () => {
  const page = async (focus: number | null, data: GameSeasonArchive | undefined, moment = { dayKey: '2026-10-11', minuteOfDay: 600 }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, progress());
    if (focus !== null && data !== undefined) client.setQueryData(seasonArchiveQueryKey(focus), data);
    const host = await mount(
      <QueryClientProvider client={client}>
        <ProgressionSaisonPage focus={focus} moment={moment} />
      </QueryClientProvider>,
    );
    return host.querySelector('header')?.textContent ?? host.textContent ?? '';
  };

  test('une saison passée : « Saison n · terminée », pas le compteur de la saison en cours', async () => {
    const header = await page(currentSeason + 1, season());
    expect(header).toContain(`Voyage ${currentSeason + 1} · terminé`);
    expect(header).not.toContain(`${game.season?.steps ?? 0} / ${game.season?.stepsTotal ?? 40}`);
  });

  test('une saison future : « Saison n · à venir »', async () => {
    expect(await page(currentSeason + 1, season({ status: 'upcoming', progress: null }))).toContain(`Voyage ${currentSeason + 1} · à venir`);
  });

  test('une saison future gardée hors ligne, le jour J : « Saison n · en cours »', async () => {
    expect(await page(currentSeason + 1, season({ status: 'upcoming', progress: null }), { dayKey: '2027-02-15', minuteOfDay: 600 })).toContain(`Voyage ${currentSeason + 1} · en cours`);
  });

  test('sans lien, ou sur la saison en cours : le compteur d’étapes d’avant', async () => {
    const counter = `${game.season?.steps ?? 0} / ${game.season?.stepsTotal ?? 40}`;
    expect(await page(null, undefined)).toContain(counter);
    expect(await page(currentSeason, undefined)).toContain(counter);
  });

  test('le compte pur : chaque état de la saison du lien a sa ligne', () => {
    const current = game.season ?? null;
    expect(seasonHeaderCount({ kind: 'past', season: season() }, current)).toBe(`Voyage ${currentSeason + 1} · terminé`);
    expect(seasonHeaderCount({ kind: 'loading' }, current)).toBeNull();
  });
});

describe('la page Ligue sous un lien (#10018)', () => {
  const current = () => <p data-current-league="">la ligue de la semaine</p>;

  test('la semaine en cours : la page d’avant, sans aucune lecture', async () => {
    expect(needsLeagueWeekArchive(currentWeek, game)).toBe(false);
    const host = await mount(<LigueWeekFocus progress={progress()} focus={currentWeek} read={none} onRetry={() => undefined} current={current} />);
    expect(host.querySelector('[data-current-league]')).not.toBeNull();
  });

  test('une semaine passée : ligue, rang, zone, coupe — et personne d’autre', async () => {
    expect(needsLeagueWeekArchive('2026-10-05', game)).toBe(true);
    const host = await mount(<LigueWeekFocus progress={progress()} focus="2026-10-05" read={{ data: week(), error: null }} onRetry={() => undefined} current={current} />);
    expect(host.querySelector('[data-game-league-archive="engraved"]')).not.toBeNull();
    expect(host.textContent).toContain('Jade');
    expect(host.textContent).toContain('Place finale : 3');
    expect(host.querySelector('[data-game-league-archive-zone="promotion"]')).not.toBeNull();
    expect(host.querySelector('[data-game-league-archive-cup="bronze"]')).not.toBeNull();
    expect(host.querySelector('[data-game-standing]')).toBeNull();
    expect(host.textContent).toContain('les autres héros de la joute ne se relisent pas');
  });

  test('une semaine purgée le dit', async () => {
    const host = await mount(<LigueWeekFocus progress={progress()} focus="2026-10-05" read={{ data: week({ retention: 'purged', result: null }), error: null }} onRetry={() => undefined} current={current} />);
    expect(host.querySelector('[data-game-league-archive="purged"]')).not.toBeNull();
  });

  test('une semaine sans place, et une semaine pas commencée', async () => {
    const unplaced = await mount(<LigueWeekFocus progress={progress()} focus="2026-10-05" read={{ data: week({ result: null }), error: null }} onRetry={() => undefined} current={current} />);
    expect(unplaced.querySelector('[data-game-league-archive="unplaced"]')).not.toBeNull();
    expect(leagueShown('2026-11-30', game, { data: week({ weekKey: '2026-11-30', status: 'upcoming', result: null }), error: null }).kind).toBe('week');
  });

  test('hors ligne, cache froid : l’échec et de quoi relire', async () => {
    const host = await mount(<LigueWeekFocus progress={progress()} focus="2026-10-05" read={{ data: undefined, error: 'Hors ligne' }} onRetry={() => undefined} current={current} />);
    expect(host.querySelector('[data-game-archive-retry]')).not.toBeNull();
  });
});
