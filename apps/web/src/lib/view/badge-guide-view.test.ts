import { beforeAll, describe, expect, test } from 'bun:test';

import { ENGAGEMENT_AXES } from '@meeshy/shared/types/engagement';
import { engagementAxisWhatCounts } from '@meeshy/shared/utils/engagement-labels';
import { badgeGuide } from '@meeshy/shared/utils/game/badge-guide';

import { SUPPORTED_INTERFACE_LANGUAGES } from '../inline-interface-language-bootstrap.js';
import { loadGameCatalog } from '../i18n-game-catalog';
import { BADGES_GUIDE_LINK, BADGES_SECTION_ID, badgeGuideView, isBadgesSection } from './badge-guide-view';

/**
 * CHAQUE BADGE S'EXPLIQUE (#9639) — ce que la fiche et la page des badges
 * disent d'UN badge : ce qui compte pour lui, sa matière et pourquoi, ses
 * étoiles sur sept, ses sept paliers (atteints datés, à venir avec leur seuil),
 * ce qu'il manque pour la prochaine étoile, et le lien vers LA section badges
 * du carnet des règles.
 */
beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});

describe('ce qui compte : la phrase de L’AXE, jamais celle de la famille', () => {
  test('deux badges de la même famille disent deux choses différentes', () => {
    const link = badgeGuideView(badgeGuide({ axisKey: 'social.tracked_link', count: 3 }), 'fr');
    const friendship = badgeGuideView(badgeGuide({ axisKey: 'social.friendship', count: 3 }), 'fr');
    expect(link.counts).toBe(engagementAxisWhatCounts('fr', 'social.tracked_link'));
    expect(friendship.counts).not.toBe(link.counts);
  });

  test('les vingt badges ont vingt phrases distinctes', () => {
    const all = ENGAGEMENT_AXES.map((axisKey) => badgeGuideView(badgeGuide({ axisKey, count: 0 }), 'fr').counts);
    expect(new Set(all).size).toBe(ENGAGEMENT_AXES.length);
  });
});

describe('la matière et pourquoi', () => {
  test('37 publications : le bronze, parce que le seuil de 10 est franchi', () => {
    const view = badgeGuideView(badgeGuide({ axisKey: 'content.post', count: 37 }), 'fr');
    expect(view.material).toBe('bronze');
    expect(view.reason).toContain('Bronze');
    expect(view.reason).toContain('10');
    expect(view.reason).toContain('37');
  });

  test('aucune étoile : la raison dit que le premier geste allume le cuivre', () => {
    const view = badgeGuideView(badgeGuide({ axisKey: 'content.post', count: 0 }), 'fr');
    expect(view.material).toBeNull();
    expect(view.reason.toLowerCase()).toContain('cuivre');
  });
});

describe('les étoiles, l’échelle et la prochaine étoile', () => {
  test('deux étoiles sur sept, sept paliers, les deux premiers atteints', () => {
    const view = badgeGuideView(
      badgeGuide({ axisKey: 'content.post', count: 37, served: [{ threshold: 10, reachedAt: '2026-10-02T10:00:00.000Z' }] }),
      'fr',
    );
    expect(view.stars).toEqual({ lit: 2, max: 7 });
    expect(view.ladder).toHaveLength(7);
    expect(view.ladder.map((rung) => rung.state)).toEqual(['reached', 'reached', 'next', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(view.ladder.map((rung) => rung.material)).toEqual(['copper', 'bronze', 'silver', 'gold', 'platinum', 'obsidian', 'prism']);
    expect(view.ladder[1]?.line).toContain('2026');
    expect(view.ladder[0]?.line).toBe('Obtenu');
    expect(view.ladder[2]?.line).toContain('13');
    expect(view.ladder[3]?.line).toContain('100');
  });

  test('ce qu’il manque pour la prochaine étoile : 13, l’argent, au seuil de 50', () => {
    const view = badgeGuideView(badgeGuide({ axisKey: 'content.post', count: 37 }), 'fr');
    expect(view.next).toContain('13');
    expect(view.next).toContain('50');
    expect(view.next).toContain('Argent');
  });

  test('au Prisme : sept étoiles, l’échelle est complète', () => {
    const view = badgeGuideView(badgeGuide({ axisKey: 'tool.reaction', count: 6000 }), 'fr');
    expect(view.stars).toEqual({ lit: 7, max: 7 });
    expect(view.ladder.every((rung) => rung.state === 'reached')).toBe(true);
    expect(view.next.toLowerCase()).toContain('prisme');
  });

  test('la suite à venir ne porte que les paliers non atteints', () => {
    const view = badgeGuideView(badgeGuide({ axisKey: 'content.post', count: 120 }), 'fr');
    expect(view.upcoming.map((rung) => rung.threshold)).toEqual([500, 1000, 5000]);
  });
});

describe('dans les sept langues', () => {
  test('aucune clé nue, aucun paramètre laissé tel quel', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      for (const count of [0, 37, 6000]) {
        const view = badgeGuideView(badgeGuide({ axisKey: 'social.friendship', count }), language);
        expect({ language, clean: !/game\.[a-z_.]+|\{[a-z]+\}|undefined|NaN/.test(JSON.stringify(view)) }).toEqual({ language, clean: true });
      }
    }
  });
});

describe('le lien vers la section badges du carnet', () => {
  test('pointe le carnet des règles, section « badges », ancrée', () => {
    expect(BADGES_GUIDE_LINK).toEqual({ to: 'progressionRegles', search: { section: 'badges' } });
    expect(BADGES_SECTION_ID).toBe('regles-badges');
    expect(isBadgesSection('badges')).toBe(true);
    for (const other of [null, '', 'badge', 'regles']) expect(isBadgesSection(other)).toBe(false);
  });
});
