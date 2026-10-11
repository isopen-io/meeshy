import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { GameLeagueWeekArchive, GameSeasonArchive } from '@meeshy/shared/types/game-archive';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { leagueShown, needsLeagueWeekArchive, needsSeasonArchive, seasonShown } from '@/components/game-archive';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { GameV2Actions } from './game-v2-actions';
import { LigueWeekFocus } from './progression-ligue';
import { SaisonFocusBody } from './progression-saison';

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
    expect(host.textContent).toContain(`Saison ${focus} · terminée`);
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

  test('servie « en cours » par la passerelle : la page d’avant', () => {
    expect(seasonShown(currentSeason + 1, game, { data: season({ status: 'current' }), error: null })).toEqual({ kind: 'current' });
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
    expect(host.textContent).toContain('Rang final : 3');
    expect(host.querySelector('[data-game-league-archive-zone="promotion"]')).not.toBeNull();
    expect(host.querySelector('[data-game-league-archive-cup="bronze"]')).not.toBeNull();
    expect(host.querySelector('[data-game-standing]')).toBeNull();
    expect(host.textContent).toContain('les autres membres du groupe ne se relisent pas');
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
