import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { ENGAGEMENT_AXES, ENGAGEMENT_AXIS_FAMILIES, engagementAxisFamily } from '@meeshy/shared/types/engagement';
import { resolveEngagementProgress, type EngagementAxisProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';

import { GAME_BADGE_MATERIALS } from './materials';
import {
  MEDAL_PICTOGRAMS,
  MEDAL_TIER_MAX,
  arcLength,
  enamelToken,
  hasRibbon,
  medalMaterial,
  medalOfAxis,
  pearls,
  pictogramOf,
} from './medal';

const CSS = readFileSync(new URL('../../styles/game.css', import.meta.url), 'utf8');

/**
 * LES MÉDAILLES (#9466) — la forme que prend un badge d'accumulation : une
 * lunette de métal (la matière dit la hauteur atteinte), un émail à la couleur
 * de la FAMILLE, un pictogramme d'axe au trait, sept perles de palier, un arc
 * de progression. Tout ce qui se décide ici est une donnée : la forme se prouve
 * sans rendu.
 */
const axis = (patch: Partial<EngagementAxisProgress> = {}): EngagementAxisProgress => ({
  axisKey: 'content.text_message',
  family: 'content',
  value: 120,
  tiers: [1, 10, 50, 100, 500].map((threshold, i) => ({ threshold, reached: i < 4, reachedAt: null })),
  reachedCount: 4,
  previousThreshold: 100,
  nextThreshold: 500,
  progress: 0.05,
  ...patch,
});

describe('la matière monte avec les paliers atteints', () => {
  test('1 cuivre … 7 prisme ; 0 : aucune matière, c’est une empreinte', () => {
    expect(medalMaterial(0)).toBeNull();
    expect([1, 2, 3, 4, 5, 6, 7].map(medalMaterial)).toEqual([...GAME_BADGE_MATERIALS]);
  });

  test('au-delà de 7, la médaille reste prisme ; un nombre illisible n’allume rien', () => {
    expect(medalMaterial(12)).toBe('prism');
    expect(medalMaterial(Number.NaN)).toBeNull();
    expect(MEDAL_TIER_MAX).toBe(7);
  });

  test('le ruban commence à l’Or (quatrième palier)', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(hasRibbon)).toEqual([false, false, false, false, true, true, true, true]);
  });
});

describe('les sept perles de palier', () => {
  test('sept perles posées sur l’arc du haut, allumées jusqu’au palier atteint', () => {
    const lit = (tier: number): number => pearls(tier).filter((p) => p.lit).length;
    expect(pearls(0)).toHaveLength(7);
    expect([0, 3, 7].map(lit)).toEqual([0, 3, 7]);
    expect(lit(12)).toBe(7);
  });

  test('les perles se suivent de gauche à droite, au-dessus du centre', () => {
    const xs = pearls(7).map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (const pearl of pearls(7)) expect(pearl.y).toBeLessThan(52);
  });
});

describe('l’arc de progression', () => {
  test('la fraction du tour ; jamais plus d’un tour, jamais NaN', () => {
    expect(arcLength(0)).toBe(0);
    expect(arcLength(1)).toBeCloseTo(2 * Math.PI * 41, 1);
    expect(arcLength(9)).toBeCloseTo(arcLength(1), 5);
    expect(arcLength(Number.NaN)).toBe(0);
    expect(arcLength(-3)).toBe(0);
  });
});

describe('l’émail est de la famille, le pictogramme de l’axe', () => {
  test('une couleur d’émail par famille, déclarée par game.css', () => {
    for (const family of ENGAGEMENT_AXIS_FAMILIES) {
      expect(enamelToken(family)).toBe(`var(--game-enamel-${family})`);
      expect(new RegExp(`--game-enamel-${family}\\s*:`).test(CSS)).toBe(true);
    }
  });

  test('neuf pictogrammes d’axe, et chaque axe du catalogue en a un', () => {
    expect([...MEDAL_PICTOGRAMS].sort()).toEqual(['comment', 'conversation', 'post', 'reel', 'social', 'story', 'text', 'tool', 'voice']);
    for (const key of ENGAGEMENT_AXES) expect(MEDAL_PICTOGRAMS).toContain(pictogramOf(key));
  });

  test('le texte est « Aa », le vocal un micro, la story un cercle, le post un carré, le réel une lecture', () => {
    expect(['content.text_message', 'content.audio_message', 'content.story', 'content.post', 'content.reel'].map((key) => pictogramOf(key as never))).toEqual(['text', 'voice', 'story', 'post', 'reel']);
  });

  test('un commentaire est des guillemets, une conversation deux points reliés, un outil une étoile, le lien des maillons', () => {
    expect(pictogramOf('comment.text')).toBe('comment');
    expect(pictogramOf('comment.audio')).toBe('comment');
    expect(pictogramOf('conversation.private')).toBe('conversation');
    expect(pictogramOf('tool.reaction')).toBe('tool');
    expect(pictogramOf('social.share')).toBe('social');
  });

  test('la famille de l’axe est celle du catalogue partagé', () => {
    expect(engagementAxisFamily('social.share')).toBe('social');
  });
});

describe('medalOfAxis — ce que la progression d’un axe donne à la médaille', () => {
  test('quatre paliers : or, ruban, cartouche du palier atteint, arc vers le suivant', () => {
    const medal = medalOfAxis(axis());
    expect(medal).toMatchObject({ family: 'content', pictogram: 'text', tier: 4, material: 'gold', progress: 0.05, threshold: 100, nextMaterial: 'platinum' });
  });

  test('aucun palier : l’empreinte, avec ce qu’il manque pour l’allumer', () => {
    const medal = medalOfAxis(axis({ reachedCount: 0, value: 0, previousThreshold: 0, nextThreshold: 1, progress: 0, tiers: [1, 10, 50, 100, 500].map((threshold) => ({ threshold, reached: false, reachedAt: null })) }));
    expect(medal).toMatchObject({ tier: 0, material: null, missing: 1, threshold: null });
  });

  test('l’échelle complète : plus de palier suivant, l’arc est plein', () => {
    const top = medalOfAxis(axis({ reachedCount: 5, value: 900, previousThreshold: 500, nextThreshold: null, progress: 1, tiers: [1, 10, 50, 100, 500].map((threshold) => ({ threshold, reached: true, reachedAt: null })) }));
    expect(top).toMatchObject({ tier: 5, material: 'platinum', nextMaterial: null, progress: 1, threshold: 500 });
  });
});

/**
 * LES PALIERS 1 000 ET 5 000 (#9392) — les badges d'accumulation passent de
 * cinq à sept paliers : l'obsidienne à 1 000, le prisme (irisé) à 5 000. La
 * médaille les lit de la progression RÉSOLUE par la loi partagée, jamais d'une
 * liste écrite ici : un compte à 5 000 messages a sa médaille prisme, et plus
 * rien au-dessus.
 */
describe('les sept paliers de la progression résolue', () => {
  const messages = (count: number) => {
    const resolved = resolveEngagementProgress({ ...ENGAGEMENT_PROGRESS_FIXTURE, counters: [{ axisKey: 'content.text_message', count }] });
    const found = resolved.axes.find((candidate) => candidate.axisKey === 'content.text_message');
    if (found === undefined) throw new Error('axe absent');
    return medalOfAxis(found);
  };

  test('1 000 messages : la médaille d’obsidienne, 4 000 de plus vers le prisme', () => {
    const medal = messages(1000);
    expect(medal.tier).toBe(6);
    expect(medal.material).toBe('obsidian');
    expect(medal.nextMaterial).toBe('prism');
    expect(medal.nextThreshold).toBe(5000);
  });

  test('5 000 messages : la médaille prisme, plus aucun palier au-dessus', () => {
    const medal = messages(5000);
    expect(medal.tier).toBe(7);
    expect(medal.material).toBe('prism');
    expect(medal.nextMaterial).toBeNull();
    expect(medal.nextThreshold).toBeNull();
  });

  test('499 messages : toujours l’or du palier 100, jamais l’obsidienne', () => {
    expect(messages(499).material).toBe('gold');
  });
});
