import { describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { levelThreshold } from '@meeshy/shared/utils/game/levels';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';

import { standingGuideEventsV2, transitionGuideEventsV2 } from './events-v2';
import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';

/**
 * LES ÉVÉNEMENTS DU GUIDE, VAGUE 2 (#9481) — ce que le bloc `game` laisse lire :
 * ligue (première, montée, descente), saison (début, fin), trophée, Prestige,
 * Atlas (nouveau tampon). Comme pour la vague 1, deux sources : l'ÉTAT à
 * l'ouverture (une découverte ne se dit qu'une fois) et la TRANSITION entre deux
 * lectures (ce qui vient d'arriver se dit chaque fois).
 *
 * Rien n'est inventé : une extension absente (ancien serveur) ne produit aucun
 * événement, et ce que le serveur ne dit pas (le rang de la semaine passée d'un
 * duo…) reste vide.
 */
const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const view = (game = gameBlockWithExtrasFixture()): EngagementWithGame => ({ ...base, game });
const withGame = (patch: (game: NonNullable<EngagementWithGame['game']>) => NonNullable<EngagementWithGame['game']>, from = view()): EngagementWithGame =>
  from.game === undefined ? from : { ...from, game: patch(from.game) };

describe('à l’ouverture', () => {
  test('la première ligue : une découverte, dite une seule fois', () => {
    const events = standingGuideEventsV2(view().game ?? gameBlockFixture(), new Set());
    expect(events).toContainEqual({ kind: 'league-first', league: 'jade', pointsToPromotion: 9 });
    expect(standingGuideEventsV2(view().game ?? gameBlockFixture(), new Set(['league-first'])).map((e) => e.kind)).not.toContain('league-first');
  });

  test('une saison ouverte : son début, dit une seule fois', () => {
    const events = standingGuideEventsV2(gameBlockWithExtrasFixture(), new Set());
    expect(events).toContainEqual({ kind: 'season-start', season: 1, themeKey: 'language:fr', steps: 40 });
    expect(standingGuideEventsV2(gameBlockWithExtrasFixture(), new Set(['season-start'])).map((e) => e.kind)).not.toContain('season-start');
  });

  test('un ancien serveur : aucun événement', () => {
    expect(standingGuideEventsV2(gameBlockFixture(), new Set())).toEqual([]);
  });

  test('la ligue fermée ou en attente de consentement : pas de « première ligue »', () => {
    const game = gameBlockWithExtrasFixture();
    const closed = game.league === undefined ? game : { ...game, league: { ...game.league, access: 'consent-required' as const, current: null } };
    expect(standingGuideEventsV2(closed, new Set()).map((e) => e.kind)).not.toContain('league-first');
  });
});

describe('pendant que l’écran est ouvert', () => {
  test('placé dans un groupe pour la première fois : la première ligue', () => {
    const before = withGame((g) => (g.league === undefined ? g : { ...g, league: { ...g.league, current: null } }));
    expect(transitionGuideEventsV2(before, view()).map((e) => e.kind)).toContain('league-first');
  });

  test('une ligue plus haute : la montée, avec la semaine et le rang tenu', () => {
    const before = view();
    const after = withGame((g) => (g.league?.current === undefined || g.league.current === null ? g : { ...g, league: { ...g.league, weekKey: '2026-11-09', current: { ...g.league.current, league: 'saphir', rank: 15 } } }));
    expect(transitionGuideEventsV2(before, after)).toContainEqual({ kind: 'league-promoted', from: 'jade', to: 'saphir', rank: 8, weekKey: '2026-11-02' });
  });

  test('une ligue plus basse : la descente', () => {
    const after = withGame((g) => (g.league?.current === undefined || g.league.current === null ? g : { ...g, league: { ...g.league, weekKey: '2026-11-09', current: { ...g.league.current, league: 'ambre', pointsToPromotion: 120 } } }));
    expect(transitionGuideEventsV2(view(), after)).toContainEqual({ kind: 'league-relegated', from: 'jade', to: 'ambre', pointsToPromotion: 120, weekKey: '2026-11-02' });
  });

  test('la même ligue d’une semaine à l’autre : rien à dire', () => {
    const after = withGame((g) => (g.league === undefined ? g : { ...g, league: { ...g.league, weekKey: '2026-11-09' } }));
    expect(transitionGuideEventsV2(view(), after).map((e) => e.kind)).toEqual([]);
  });

  test('une saison qui s’ouvre, une saison qui se ferme', () => {
    const without = withGame((g) => ({ ...g, season: null }));
    expect(transitionGuideEventsV2(without, view()).map((e) => e.kind)).toContain('season-start');
    expect(transitionGuideEventsV2(view(), without)).toContainEqual({ kind: 'season-end', season: 1, stepsReached: 14, completed: false, gloryGained: 0 });
  });

  test('un parcours terminé : la fin de saison porte sa Gloire (GLORY_POINTS.season)', () => {
    const done = withGame((g) => (g.season === null || g.season === undefined ? g : { ...g, season: { ...g.season, steps: 40, completed: true } }));
    const without = withGame((g) => ({ ...g, season: null }), done);
    expect(transitionGuideEventsV2(done, without)).toContainEqual({ kind: 'season-end', season: 1, stepsReached: 40, completed: true, gloryGained: GLORY_POINTS.season });
  });

  test('un nouveau trophée : un événement par clé reçue', () => {
    const after = withGame((g) => (g.trophies === undefined ? g : { ...g, trophies: { items: [...g.trophies.items, { key: 'trophy.season-cup.1', awardedAt: '2026-11-03T10:00:00.000Z' }], order: g.trophies.order } }));
    expect(transitionGuideEventsV2(view(), after)).toEqual([{ kind: 'trophy', trophyKey: 'trophy.season-cup.1' }]);
  });

  test('un tampon de plus à l’Atlas : la langue tamponnée', () => {
    const after = withGame((g) => (g.atlas === undefined ? g : { ...g, atlas: { ...g.atlas, stamped: 5, stamps: [...g.atlas.stamps, { language: 'ja', stampedOn: '2026-11-03' }] } }));
    expect(transitionGuideEventsV2(view(), after)).toContainEqual({ kind: 'atlas-stamp', language: 'ja', stamped: 5, total: view().game?.atlas?.total });
  });

  test('un Prestige de plus : le moment du Prestige', () => {
    const before = view(gameBlockWithExtrasFixture({ score: levelThreshold(100) + 1 }));
    const after = withGame((g) => ({ ...g, level: { ...g.level, prestige: g.level.prestige + 1 } }), before);
    expect(transitionGuideEventsV2(before, after)).toContainEqual({ kind: 'prestige', prestige: 1, gloryGained: GLORY_POINTS.prestige });
  });

  test('un ancien serveur, des deux côtés : rien', () => {
    expect(transitionGuideEventsV2(view(gameBlockFixture()), view(gameBlockFixture()))).toEqual([]);
  });

  test('une extension qui apparaît seulement dans la nouvelle lecture n’invente aucune transition', () => {
    expect(transitionGuideEventsV2(view(gameBlockFixture()), view()).map((e) => e.kind)).toEqual([]);
  });
});

describe('la première Veilleuse offerte (#20169)', () => {
  const gifted = (game: NonNullable<EngagementWithGame['game']>, freezeGifted: boolean | undefined) => ({
    ...game,
    flame: { ...game.flame, freezes: 1, ...(freezeGifted === undefined ? {} : { freezeGifted }) },
  });

  test('le jour du cadeau, l’ouverture le dit, une seule fois', () => {
    const game = gifted(gameBlockFixture(), true);
    expect(standingGuideEventsV2(game, new Set())).toContainEqual({ kind: 'flame-freeze-gift', freezes: 1 });
    expect(standingGuideEventsV2({ ...game, guideSeen: ['flame-freeze-gift'] }, new Set()).map((e) => e.kind)).not.toContain('flame-freeze-gift');
    expect(standingGuideEventsV2(game, new Set(['flame-freeze-gift'])).map((e) => e.kind)).not.toContain('flame-freeze-gift');
  });

  test('un autre jour, ou un serveur antérieur : rien', () => {
    expect(standingGuideEventsV2(gifted(gameBlockFixture(), false), new Set())).toEqual([]);
    expect(standingGuideEventsV2(gifted(gameBlockFixture(), undefined), new Set())).toEqual([]);
  });

  test('le cadeau qui arrive pendant que l’écran est ouvert se dit aussitôt', () => {
    const before = withGame((game) => gifted(game, false));
    const after = withGame((game) => gifted(game, true));
    expect(transitionGuideEventsV2(before, after)).toContainEqual({ kind: 'flame-freeze-gift', freezes: 1 });
    expect(transitionGuideEventsV2(after, after).map((e) => e.kind)).not.toContain('flame-freeze-gift');
  });
});

describe('l’Offrande gardée par les aïeux, le jour du retour (#20327)', () => {
  const kept = (game: NonNullable<EngagementWithGame['game']>, status: 'locked' | 'ready' | 'claimed', keptFlag: boolean | undefined) => ({
    ...game,
    chest: { ...game.chest, status, ...(keptFlag === undefined ? {} : { kept: keptFlag }) },
  });

  test('tant qu’elle est prête, chaque ouverture le dit, avec les trois jours de Rêve allégé', () => {
    const game = kept(gameBlockFixture(), 'ready', true);
    expect(standingGuideEventsV2(game, new Set())).toContainEqual({ kind: 'offering-kept', easedDays: 3 });
    expect(standingGuideEventsV2(game, new Set(['offering-kept']))).toContainEqual({ kind: 'offering-kept', easedDays: 3 });
  });

  test('ouverte, un autre jour, ou un serveur antérieur : rien', () => {
    expect(standingGuideEventsV2(kept(gameBlockFixture(), 'claimed', true), new Set())).toEqual([]);
    expect(standingGuideEventsV2(kept(gameBlockFixture(), 'ready', false), new Set())).toEqual([]);
    expect(standingGuideEventsV2(kept(gameBlockFixture(), 'ready', undefined), new Set())).toEqual([]);
  });

  test('prête pendant que l’écran est ouvert : dite aussitôt, une fois', () => {
    const before = withGame((game) => kept(game, 'locked', true));
    const after = withGame((game) => kept(game, 'ready', true));
    expect(transitionGuideEventsV2(before, after)).toContainEqual({ kind: 'offering-kept', easedDays: 3 });
    expect(transitionGuideEventsV2(after, after).map((e) => e.kind)).not.toContain('offering-kept');
  });
});

describe('l’objectif de Flamme atteint (#20548)', () => {
  const goal = (game: NonNullable<EngagementWithGame['game']>, current: { target: number; remaining: number; reached: boolean; next: number | null } | null, guideSeen = game.guideSeen) => ({
    ...game,
    guideSeen,
    flame: { ...game.flame, goal: { offer: current?.reached === true && current.next !== null ? [current.next] : [], current } },
  });
  const reached = { target: 7, remaining: 0, reached: true, next: 14 };
  const running = { target: 7, remaining: 1, reached: false, next: null };

  test('atteint et pas encore salué, l’ouverture le dit avec la marche suivante', () => {
    expect(standingGuideEventsV2(goal(gameBlockFixture(), reached), new Set())).toContainEqual({ kind: 'flame-goal-reached', target: 7, next: 14 });
  });

  test('salué par la carte de la Flamme ou par le guide (sa clé vue), il ne se redit pas', () => {
    expect(standingGuideEventsV2(goal(gameBlockFixture(), reached, ['flame-goal-next-7']), new Set()).map((e) => e.kind)).not.toContain('flame-goal-reached');
    expect(standingGuideEventsV2(goal(gameBlockFixture(), reached), new Set(['flame-goal-next-7'])).map((e) => e.kind)).not.toContain('flame-goal-reached');
  });

  test('en cours, sans objectif, ou devant un serveur antérieur : rien', () => {
    expect(standingGuideEventsV2(goal(gameBlockFixture(), running), new Set())).toEqual([]);
    expect(standingGuideEventsV2(goal(gameBlockFixture(), null), new Set())).toEqual([]);
    expect(standingGuideEventsV2(gameBlockFixture(), new Set()).map((e) => e.kind)).not.toContain('flame-goal-reached');
  });

  test('atteint pendant que l’écran est ouvert : dit aussitôt, une fois', () => {
    const before = withGame((game) => goal(game, running));
    const after = withGame((game) => goal(game, reached));
    expect(transitionGuideEventsV2(before, after)).toContainEqual({ kind: 'flame-goal-reached', target: 7, next: 14 });
    expect(transitionGuideEventsV2(after, after).map((e) => e.kind)).not.toContain('flame-goal-reached');
    const seen = withGame((game) => goal(game, reached, ['flame-goal-next-7']));
    expect(transitionGuideEventsV2(before, seen).map((e) => e.kind)).not.toContain('flame-goal-reached');
  });
});
