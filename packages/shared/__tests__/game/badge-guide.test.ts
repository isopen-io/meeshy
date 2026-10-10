/**
 * CHAQUE BADGE S'EXPLIQUE (#9639) — la loi qui dit, pour UN axe et son
 * compteur : l'échelle des sept paliers (seuil, matière, atteint, date), le
 * palier atteint et POURQUOI (le seuil franchi, ou la trace gravée qui le
 * tient), les étoiles allumées sur sept, ce qu'il manque pour la prochaine
 * étoile, et le rangement des badges par famille. Une phrase « ce qui compte »
 * par axe, dans les huit langues du catalogue partagé.
 */

import { describe, expect, it } from 'vitest';

import { BADGE_THRESHOLDS, ENGAGEMENT_AXES, ENGAGEMENT_AXIS_FAMILIES, badgeMilestoneKey } from '../../types/engagement.js';
import { ENGAGEMENT_AXIS_COUNTS, ENGAGEMENT_AXIS_LABELS, engagementAxisWhatCounts } from '../../utils/engagement-labels.js';
import { resolveEngagementProgress } from '../../utils/engagement-progress.js';
import { BADGE_STARS_MAX, badgeGuide, badgeGuideOfProgress, badgeGuidesByFamily } from '../../utils/game/badge-guide.js';
import { NOTIFICATION_LANGUAGES } from '../../utils/notification-strings.js';

describe('l’échelle des sept paliers d’un badge', () => {
  it('pose les sept seuils et leurs matières, du cuivre au prisme', () => {
    const guide = badgeGuide({ axisKey: 'social.friendship', count: 0 });
    expect(guide.rungs.map((rung) => [rung.threshold, rung.material])).toEqual([
      [1, 'cuivre'],
      [10, 'bronze'],
      [50, 'argent'],
      [100, 'or'],
      [500, 'platine'],
      [1000, 'obsidienne'],
      [5000, 'prisme'],
    ]);
    expect(BADGE_STARS_MAX).toBe(7);
    expect(guide.rungs.map((rung) => rung.ribbon)).toEqual([false, false, false, true, true, true, true]);
  });

  it('à zéro : aucune étoile, aucun palier, la prochaine étoile est le cuivre à 1', () => {
    const guide = badgeGuide({ axisKey: 'content.post', count: 0 });
    expect(guide.stars).toBe(0);
    expect(guide.reached).toBeNull();
    expect(guide.next).toEqual({ threshold: 1, material: 'cuivre', missing: 1 });
  });

  it('37 publications : le bronze, parce que le seuil de 10 est franchi ; 13 de plus pour l’argent', () => {
    const guide = badgeGuide({ axisKey: 'content.post', count: 37 });
    expect(guide.stars).toBe(2);
    expect(guide.reached).toEqual({ threshold: 10, material: 'bronze', reason: 'threshold-crossed', reachedAt: null });
    expect(guide.next).toEqual({ threshold: 50, material: 'argent', missing: 13 });
    expect(guide.rungs.filter((rung) => rung.reached).map((rung) => rung.material)).toEqual(['cuivre', 'bronze']);
  });

  it('5 000 et plus : le prisme, sept étoiles, plus de prochaine étoile', () => {
    const guide = badgeGuide({ axisKey: 'tool.reaction', count: 7200 });
    expect(guide.stars).toBe(7);
    expect(guide.reached?.material).toBe('prisme');
    expect(guide.next).toBeNull();
  });

  it('date un palier par la trace gravée servie', () => {
    const guide = badgeGuide({ axisKey: 'content.story', count: 12, served: [{ threshold: 1, reachedAt: '2026-09-01T10:00:00.000Z' }, { threshold: 10, reachedAt: '2026-10-02T10:00:00.000Z' }] });
    expect(guide.rungs[0]?.reachedAt).toBe('2026-09-01T10:00:00.000Z');
    expect(guide.reached).toEqual({ threshold: 10, material: 'bronze', reason: 'threshold-crossed', reachedAt: '2026-10-02T10:00:00.000Z' });
  });

  it('un palier tenu par sa seule trace (compteur redescendu) le dit, et la prochaine étoile part du palier au-dessus', () => {
    const guide = badgeGuide({ axisKey: 'content.reel', count: 40, served: [{ threshold: 50, reachedAt: '2026-08-01T00:00:00.000Z' }] });
    expect(guide.stars).toBe(3);
    expect(guide.reached).toEqual({ threshold: 50, material: 'argent', reason: 'served', reachedAt: '2026-08-01T00:00:00.000Z' });
    expect(guide.next).toEqual({ threshold: 100, material: 'or', missing: 60 });
  });

  it('un compteur illisible vaut zéro ; un seuil servi hors échelle est ignoré', () => {
    const guide = badgeGuide({ axisKey: 'content.reel', count: Number.NaN, served: [{ threshold: 7, reachedAt: '2026-08-01T00:00:00.000Z' }] });
    expect(guide.count).toBe(0);
    expect(guide.stars).toBe(0);
    expect(badgeGuide({ axisKey: 'content.reel', count: -4 }).count).toBe(0);
    expect(badgeGuide({ axisKey: 'content.reel', count: 9.8 }).count).toBe(9);
  });
});

describe('la progression résolue donne le même guide', () => {
  it('relit les paliers datés de la progression servie', () => {
    const progress = resolveEngagementProgress({
      counters: [{ axisKey: 'comment.audio', count: 120 }],
      milestones: [{ milestoneType: 'badge', milestoneKey: badgeMilestoneKey('comment.audio', 100), reachedAt: '2026-10-01T08:00:00.000Z' }],
      level: { engagementScore: 0 },
      streak: { currentStreakDays: 0, longestStreakDays: 0 },
    });
    const axis = progress.axes.find((candidate) => candidate.axisKey === 'comment.audio');
    if (axis === undefined) throw new Error('axe absent');
    const guide = badgeGuideOfProgress(axis);
    expect(guide).toEqual(badgeGuide({ axisKey: 'comment.audio', count: 120, served: [{ threshold: 100, reachedAt: '2026-10-01T08:00:00.000Z' }] }));
    expect(guide.reached?.material).toBe('or');
  });
});

describe('les badges rangés par famille', () => {
  it('suit l’ordre déclaré des familles, puis l’ordre du catalogue dans chaque famille', () => {
    const shuffled = [...ENGAGEMENT_AXES].reverse().map((axisKey) => badgeGuide({ axisKey, count: 3 }));
    const groups = badgeGuidesByFamily(shuffled);
    expect(groups.map((group) => group.family)).toEqual([...ENGAGEMENT_AXIS_FAMILIES]);
    expect(groups.flatMap((group) => group.guides.map((guide) => guide.axisKey))).toEqual([...ENGAGEMENT_AXES]);
    expect(groups.find((group) => group.family === 'social')?.guides.map((guide) => guide.axisKey)).toEqual([
      'social.tracked_link',
      'social.share',
      'social.invite_joined',
      'social.friendship',
    ]);
  });

  it('une famille sans badge ne s’affiche pas', () => {
    const groups = badgeGuidesByFamily([badgeGuide({ axisKey: 'tool.sticker', count: 1 })]);
    expect(groups.map((group) => group.family)).toEqual(['tool']);
  });
});

describe('« ce qui compte » — une phrase PAR axe, jamais celle de la famille', () => {
  it('chaque axe a sa phrase dans les huit langues, et deux axes ne disent jamais la même', () => {
    for (const lang of NOTIFICATION_LANGUAGES) {
      const sentences = ENGAGEMENT_AXES.map((axis) => ENGAGEMENT_AXIS_COUNTS[lang][axis]);
      for (const sentence of sentences) expect(sentence.length).toBeGreaterThan(10);
      expect(new Set(sentences).size).toBe(ENGAGEMENT_AXES.length);
    }
  });

  it('la phrase n’est pas le libellé de l’axe redit', () => {
    for (const lang of NOTIFICATION_LANGUAGES) {
      for (const axis of ENGAGEMENT_AXES) expect(ENGAGEMENT_AXIS_COUNTS[lang][axis]).not.toBe(ENGAGEMENT_AXIS_LABELS[lang][axis]);
    }
  });

  it('se résout à la langue du lecteur, repli français', () => {
    expect(engagementAxisWhatCounts('en', 'social.friendship')).toBe(ENGAGEMENT_AXIS_COUNTS.en['social.friendship']);
    expect(engagementAxisWhatCounts('xx', 'social.friendship')).toBe(ENGAGEMENT_AXIS_COUNTS.fr['social.friendship']);
  });

  it('les seuils de l’échelle sont ceux du catalogue', () => {
    expect(badgeGuide({ axisKey: 'content.post', count: 0 }).rungs.map((rung) => rung.threshold)).toEqual([...BADGE_THRESHOLDS]);
  });
});
