import { describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { levelThreshold } from '@meeshy/shared/utils/game/levels';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';

import { standingGuideEventsV2, transitionGuideEventsV2 } from './events-v2';

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

  test('un parcours terminé : la fin de saison porte les 500 de Gloire', () => {
    const done = withGame((g) => (g.season === null || g.season === undefined ? g : { ...g, season: { ...g.season, steps: 40, completed: true } }));
    const without = withGame((g) => ({ ...g, season: null }), done);
    expect(transitionGuideEventsV2(done, without)).toContainEqual({ kind: 'season-end', season: 1, stepsReached: 40, completed: true, gloryGained: 500 });
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
    expect(transitionGuideEventsV2(before, after)).toContainEqual({ kind: 'prestige', prestige: 1, gloryGained: 1000 });
  });

  test('un ancien serveur, des deux côtés : rien', () => {
    expect(transitionGuideEventsV2(view(gameBlockFixture()), view(gameBlockFixture()))).toEqual([]);
  });

  test('une extension qui apparaît seulement dans la nouvelle lecture n’invente aucune transition', () => {
    expect(transitionGuideEventsV2(view(gameBlockFixture()), view()).map((e) => e.kind)).toEqual([]);
  });
});
