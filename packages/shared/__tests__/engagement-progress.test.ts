/**
 * La loi de progression (#5547) — ce que l'écran « Progression » DÉRIVE de
 * `GET /me/engagement` avant de peindre. Les cas de bout en bout vivent dans
 * `vectors/engagement-progress.vectors.test.ts` (le contrat rejoué par iOS) ;
 * ce fichier tient les COMPORTEMENTS un par un, là où un vecteur ne dirait
 * qu'un chiffre.
 */

import { describe, it, expect } from 'vitest';
import {
  BADGE_THRESHOLDS,
  ENGAGEMENT_ACHIEVEMENT_KEYS,
  ENGAGEMENT_AXES,
  ENGAGEMENT_AXIS_FAMILIES,
  LEVEL_THRESHOLDS,
  STREAK_THRESHOLDS,
  badgeMilestoneKey,
  engagementAxisFamily,
  isEngagementProgressPayload,
  levelMilestoneKey,
  streakMilestoneKey,
  type EngagementProgressPayload,
} from '../types/engagement.js';
import { axesByFamily, resolveEngagementProgress } from '../utils/engagement-progress.js';

const EMPTY: EngagementProgressPayload = {
  counters: [],
  milestones: [],
  streak: { currentStreakDays: 0, longestStreakDays: 0 },
  level: { engagementScore: 0 },
};

const payload = (overrides: Partial<EngagementProgressPayload>): EngagementProgressPayload => ({
  ...EMPTY,
  ...overrides,
});

const axis = (progress: ReturnType<typeof resolveEngagementProgress>, key: string) => {
  const found = progress.axes.find((a) => a.axisKey === key);
  if (!found) throw new Error(`axe ${key} absent de la progression`);
  return found;
};

describe('resolveEngagementProgress — un utilisateur sans activité', () => {
  const progress = resolveEngagementProgress(EMPTY);

  it("rend l'ÉTAT VIDE, et le catalogue ENTIER pour autant — treize axes, cinq succès, tout verrouillé", () => {
    expect(progress.isEmpty).toBe(true);
    expect(progress.axes.map((a) => a.axisKey)).toEqual([...ENGAGEMENT_AXES]);
    expect(progress.achievements.map((a) => a.key)).toEqual([...ENGAGEMENT_ACHIEVEMENT_KEYS]);
    expect(progress.achievements.every((a) => !a.unlocked && a.reachedAt === null)).toBe(true);
    expect(progress.badgesEarned).toBe(0);
    expect(progress.badgesTotal).toBe(ENGAGEMENT_AXES.length * BADGE_THRESHOLDS.length);
  });

  it('pointe le PREMIER palier de chaque échelle, à zéro', () => {
    expect(progress.level).toMatchObject({ level: 0, previousThreshold: 0, nextThreshold: LEVEL_THRESHOLDS[0], progress: 0 });
    expect(progress.streak).toMatchObject({ currentDays: 0, longestDays: 0, nextThreshold: STREAK_THRESHOLDS[0], progress: 0 });
    expect(axis(progress, 'content.text_message')).toMatchObject({ nextThreshold: BADGE_THRESHOLDS[0], progress: 0, reachedCount: 0 });
  });
});

describe('resolveEngagementProgress — les badges par axe', () => {
  it('un compteur tient pour atteints les paliers qu’il dépasse, et mesure le pas vers le suivant DEPUIS le dernier franchi', () => {
    const progress = resolveEngagementProgress(payload({ counters: [{ axisKey: 'content.text_message', count: 12 }] }));
    const messages = axis(progress, 'content.text_message');
    expect(messages.tiers.map((t) => t.reached)).toEqual([true, true, false, false, false]);
    expect(messages).toMatchObject({ value: 12, reachedCount: 2, previousThreshold: 10, nextThreshold: 50 });
    // 2 pas sur 40 depuis le palier 10 — pas 12 sur 50 depuis zéro.
    expect(messages.progress).toBeCloseTo(0.05, 6);
    expect(progress.badgesEarned).toBe(2);
    expect(progress.isEmpty).toBe(false);
  });

  it('un palier GRAVÉ porte sa date ; un palier atteint par le seul compteur reste sans date, mais atteint', () => {
    const progress = resolveEngagementProgress(
      payload({
        counters: [{ axisKey: 'content.post', count: 11 }],
        milestones: [{ milestoneType: 'badge', milestoneKey: badgeMilestoneKey('content.post', 1), reachedAt: '2026-09-01T10:00:00.000Z' }],
      }),
    );
    const posts = axis(progress, 'content.post');
    expect(posts.tiers[0]).toEqual({ threshold: 1, reached: true, reachedAt: '2026-09-01T10:00:00.000Z' });
    expect(posts.tiers[1]).toEqual({ threshold: 10, reached: true, reachedAt: null });
  });

  it('un palier gravé SANS compteur reste atteint — un compteur recalculé ne reprend jamais un badge servi (§ 4)', () => {
    const progress = resolveEngagementProgress(
      payload({ milestones: [{ milestoneType: 'badge', milestoneKey: badgeMilestoneKey('content.reel', 10), reachedAt: '2026-08-30T00:00:00.000Z' }] }),
    );
    const reels = axis(progress, 'content.reel');
    expect(reels.tiers[1]?.reached).toBe(true);
    expect(reels.value).toBe(0);
    expect(progress.badgesEarned).toBe(1);
    expect(progress.isEmpty).toBe(false);
  });

  it('une échelle complète n’a plus de palier suivant et vaut 1', () => {
    const progress = resolveEngagementProgress(payload({ counters: [{ axisKey: 'tool.sticker', count: 500 }] }));
    expect(axis(progress, 'tool.sticker')).toMatchObject({ reachedCount: 5, nextThreshold: null, previousThreshold: 500, progress: 1 });
  });

  it('un axe inconnu du catalogue et un palier hors catalogue sont IGNORÉS, jamais une exception', () => {
    const progress = resolveEngagementProgress(
      payload({
        counters: [{ axisKey: 'content.future', count: 99 }],
        milestones: [
          { milestoneType: 'badge', milestoneKey: 'content.future:10', reachedAt: '2026-09-01T00:00:00.000Z' },
          { milestoneType: 'badge', milestoneKey: 'content.post:7', reachedAt: '2026-09-01T00:00:00.000Z' },
        ],
      }),
    );
    expect(progress.isEmpty).toBe(true);
    expect(progress.axes).toHaveLength(ENGAGEMENT_AXES.length);
  });

  it('range les axes par famille dans l’ordre du modèle, sans perdre l’ordre du catalogue', () => {
    const groups = axesByFamily(resolveEngagementProgress(EMPTY).axes);
    expect(groups.map((g) => g.family)).toEqual([...ENGAGEMENT_AXIS_FAMILIES]);
    expect(groups.flatMap((g) => g.axes.map((a) => a.axisKey))).toEqual([...ENGAGEMENT_AXES]);
    expect(groups.map((g) => g.axes.length)).toEqual([5, 2, 3, 3, 4]);
  });
});

describe('resolveEngagementProgress — niveau et série', () => {
  it('le niveau est le nombre de paliers de score franchis, et la barre mesure vers le suivant', () => {
    const progress = resolveEngagementProgress(
      payload({
        level: { engagementScore: 160 },
        milestones: [{ milestoneType: 'level', milestoneKey: levelMilestoneKey(150), reachedAt: '2026-09-02T00:00:00.000Z' }],
      }),
    );
    expect(progress.level).toMatchObject({ level: 3, value: 160, previousThreshold: 150, nextThreshold: 400 });
    expect(progress.level.progress).toBeCloseTo(10 / 250, 6);
    expect(progress.level.tiers[2]?.reachedAt).toBe('2026-09-02T00:00:00.000Z');
    expect(progress.level.tiers[1]?.reachedAt).toBeNull();
  });

  it('la série QUI COURT avance vers son prochain jalon ; le RECORD tient les jalons pour atteints', () => {
    const progress = resolveEngagementProgress(
      payload({
        streak: { currentStreakDays: 8, longestStreakDays: 20 },
        milestones: [{ milestoneType: 'streak', milestoneKey: streakMilestoneKey(7), reachedAt: '2026-08-20T00:00:00.000Z' }],
      }),
    );
    expect(progress.streak).toMatchObject({ currentDays: 8, longestDays: 20, reachedCount: 3, previousThreshold: 7, nextThreshold: 14 });
    expect(progress.streak.progress).toBeCloseTo(1 / 7, 6);
    expect(progress.streak.tiers.map((t) => t.reached)).toEqual([true, true, true, false, false, false]);
    expect(progress.streak.tiers[1]?.reachedAt).toBe('2026-08-20T00:00:00.000Z');
  });

  it('un record inférieur à la série courante est ramené à elle — une charge incohérente ne masque pas un jalon', () => {
    const progress = resolveEngagementProgress(payload({ streak: { currentStreakDays: 5, longestStreakDays: 2 } }));
    expect(progress.streak.longestDays).toBe(5);
    expect(progress.streak.reachedCount).toBe(1);
  });

  it('un succès gravé est débloqué avec sa date ; les autres restent verrouillés', () => {
    const progress = resolveEngagementProgress(
      payload({ milestones: [{ milestoneType: 'achievement', milestoneKey: 'achievement.first_voice', reachedAt: '2026-09-03T12:00:00.000Z' }] }),
    );
    expect(progress.achievements.find((a) => a.key === 'achievement.first_voice')).toEqual({
      key: 'achievement.first_voice',
      unlocked: true,
      reachedAt: '2026-09-03T12:00:00.000Z',
    });
    expect(progress.achievements.filter((a) => a.unlocked)).toHaveLength(1);
    expect(progress.isEmpty).toBe(false);
  });
});

describe('le catalogue — familles et clés de palier', () => {
  it('chaque axe a une famille, et elle est son préfixe', () => {
    for (const key of ENGAGEMENT_AXES) {
      expect(key.startsWith(`${engagementAxisFamily(key)}.`)).toBe(true);
    }
  });

  it('les clés de palier ont la forme que EngagementService grave (§ 4)', () => {
    expect(badgeMilestoneKey('content.audio_message', 10)).toBe('content.audio_message:10');
    expect(streakMilestoneKey(7)).toBe('streak:7');
    expect(levelMilestoneKey(150)).toBe('level:150');
  });
});

describe('isEngagementProgressPayload — la garde de frontière est fail-closed', () => {
  it('accepte la charge exacte de la route, y compris vide', () => {
    expect(isEngagementProgressPayload(EMPTY)).toBe(true);
    expect(
      isEngagementProgressPayload({
        counters: [{ axisKey: 'content.post', count: 3 }],
        milestones: [{ milestoneType: 'badge', milestoneKey: 'content.post:1', reachedAt: '2026-09-01T00:00:00.000Z' }],
        streak: { currentStreakDays: 1, longestStreakDays: 4 },
        level: { engagementScore: 9 },
      }),
    ).toBe(true);
  });

  it.each([
    ['null', null],
    ['un tableau', []],
    ['compteur négatif', { ...EMPTY, counters: [{ axisKey: 'content.post', count: -1 }] }],
    ['compteur non entier', { ...EMPTY, counters: [{ axisKey: 'content.post', count: 1.5 }] }],
    ['type de palier inconnu', { ...EMPTY, milestones: [{ milestoneType: 'trophy', milestoneKey: 'x', reachedAt: 'y' }] }],
    ['palier sans date', { ...EMPTY, milestones: [{ milestoneType: 'badge', milestoneKey: 'content.post:1' }] }],
    ['série absente', { counters: [], milestones: [], level: { engagementScore: 0 } }],
    ['score en chaîne', { ...EMPTY, level: { engagementScore: '12' } }],
  ])('refuse %s', (_label, value) => {
    expect(isEngagementProgressPayload(value)).toBe(false);
  });

  const elanDeBase = { factor: 2, activeFamilyCount: 1, hasStanding: false, windowDays: 7 };

  it("accepte un bloc `elan` dont `activeFamilies` (#5897) est ABSENT — serveur antérieur au champ", () => {
    expect(isEngagementProgressPayload({ ...EMPTY, elan: elanDeBase })).toBe(true);
  });

  it('accepte un bloc `elan` dont `activeFamilies` est un tableau de chaînes', () => {
    expect(
      isEngagementProgressPayload({ ...EMPTY, elan: { ...elanDeBase, activeFamilies: ['content'] } }),
    ).toBe(true);
  });

  it('refuse un bloc `elan` dont `activeFamilies` porte une valeur NON textuelle', () => {
    expect(
      isEngagementProgressPayload({ ...EMPTY, elan: { ...elanDeBase, activeFamilies: [1, 2] } }),
    ).toBe(false);
  });
});

/**
 * Les deux PROJECTIONS servies aux clients : les sections de succès générés
 * et l'élan. Elles n'étaient tenues que par les vecteurs de bout en bout, qui
 * disent un chiffre juste sans dire pourquoi il l'est.
 */
describe('les sections de succès générés — dérivées ICI, pour que web et iOS montrent la même chose', () => {
  /**
   * **La carte ABSENTE éteint la section entière — et c'est une question ouverte.**
   *
   * `isAttainable` déclare qu'une famille non mesurée garde ses paliers de
   * VOLUME (« rien n'empêche structurellement de répéter un geste »). Mais le
   * porteur de la section est conditionné à `achievementReach !== undefined` :
   * une passerelle qui ne sert PAS la carte n'éteint pas l'ampleur, elle éteint
   * TOUT. Les deux lectures se défendent — « le serveur ne parle pas succès »
   * contre « le catalogue est une loi CLIENTE » — et la seconde est celle que
   * le commentaire du type affirme.
   *
   * Le témoin épingle le comportement RÉEL pour qu'un changement soit délibéré ;
   * la question est ouverte en décision produit, pas tranchée ici.
   */
  it('éteint la section ENTIÈRE quand la carte manque — pas seulement les paliers d\'ampleur', () => {
    const sansCarte = resolveEngagementProgress(payload({ achievementReach: undefined }));
    expect(sansCarte.achievementSections).toBeUndefined();
  });

  it("une carte VIDE, elle, laisse vivre les paliers de VOLUME — non mesuré n'est pas zéro", () => {
    const carteVide = resolveEngagementProgress(payload({ achievementReach: {} }));
    const clefs = (carteVide.achievementSections ?? []).flatMap((s) => s.entries.map((e) => e.key));

    expect(clefs.length).toBeGreaterThan(0);
    // Aucune ampleur : on ne promet pas « une conversation d'un million » sans mesure.
    expect(clefs.some((k) => k.includes('.size:'))).toBe(false);
    expect(clefs.some((k) => k.includes('.count:'))).toBe(true);
  });

  it('range les entrées par section et les tronque à la fenêtre', () => {
    const progress = resolveEngagementProgress(
      payload({ achievementReach: { 'conversation.join.size': 1000000 } }),
    );
    const sections = progress.achievementSections ?? [];
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.entries.length).toBeLessThanOrEqual(
        Math.max(7, section.entries.filter((e) => e.unlocked).length + 2),
      );
    }
  });

  it("marque ACQUISE l'entrée dont le palier est gravé, et ELLE SEULE", () => {
    const nu = resolveEngagementProgress(payload({ achievementReach: { 'conversation.join.size': 1000000 } }));
    const cible = (nu.achievementSections ?? []).flatMap((s) => s.entries)[0];
    expect(cible).toBeDefined();

    const progress = resolveEngagementProgress(
      payload({
        achievementReach: { 'conversation.join.size': 1000000 },
        milestones: [
          {
            milestoneType: 'achievement',
            milestoneKey: cible!.key,
            reachedAt: '2026-09-09T10:00:00.000Z',
          },
        ],
      }),
    );
    const toutes = (progress.achievementSections ?? []).flatMap((s) => s.entries);
    const acquises = toutes.filter((e) => e.unlocked);

    expect(acquises.map((e) => e.key)).toEqual([cible!.key]);
    expect(acquises[0]?.reachedAt).toBe('2026-09-09T10:00:00.000Z');
  });
});

describe("l'élan servi — le plafond est une règle de PRODUIT, pas de sérialisation", () => {
  const avecElan = (factor: number) =>
    resolveEngagementProgress(
      payload({ elan: { factor, activeFamilyCount: 3, hasStanding: true, windowDays: 7 } }),
    ).elan;

  it('rend tel quel un facteur déjà dans la plage', () => {
    expect(avecElan(3)?.factor).toBe(3);
  });

  it("BORNE à 5 un serveur qui servirait 9 — sinon l'écran afficherait 9", () => {
    expect(avecElan(9)?.factor).toBe(5);
  });

  it('remonte à 1 un facteur SOUS le neutre', () => {
    expect(avecElan(0)?.factor).toBe(1);
  });

  it('retombe au neutre sur un facteur ILLISIBLE plutôt que de propager NaN', () => {
    expect(avecElan(Number.NaN)?.factor).toBe(1);
  });

  it('reporte les trois champs qui EXPLIQUENT le facteur — un accélérateur invisible surprend', () => {
    const elan = avecElan(4);
    expect(elan?.activeFamilyCount).toBe(3);
    expect(elan?.hasStanding).toBe(true);
    expect(elan?.windowDays).toBe(7);
  });

  it("n'est pas servi du tout quand la passerelle ne le donne pas", () => {
    expect(resolveEngagementProgress(payload({ elan: undefined })).elan).toBeUndefined();
  });
});

describe("l'élan servi — activeFamilies, la LISTE derrière le cardinal (#5897)", () => {
  const avecFamilies = (activeFamilies?: readonly string[]) =>
    resolveEngagementProgress(
      payload({
        elan: { factor: 2, activeFamilyCount: 2, hasStanding: false, windowDays: 7, activeFamilies },
      }),
    ).elan;

  it('reporte la liste telle que servie', () => {
    expect(avecFamilies(['content', 'comment'])?.activeFamilies).toEqual(['content', 'comment']);
  });

  it('déduplique une famille répétée', () => {
    expect(avecFamilies(['content', 'content'])?.activeFamilies).toEqual(['content']);
  });

  it('ignore une famille hors catalogue plutôt que de la propager', () => {
    expect(avecFamilies(['content', 'famille-du-futur'])?.activeFamilies).toEqual(['content']);
  });

  it("rend une liste VIDE — jamais un repli sur le cumul — quand le champ est ABSENT", () => {
    // Un serveur antérieur à #5897 sert le reste du bloc `elan` sans ce champ.
    expect(avecFamilies(undefined)?.activeFamilies).toEqual([]);
  });
});

/**
 * LES DATES DE FRAPPE (#5839) — ce que le sous-menu de l'entrée Meesh doit dire.
 *
 * Elles viennent de `MeeshLedger`, journal en ajout seul indexé par
 * `[userId, createdAt]` : min et max sur `reason: 'mint'`. Le partagé ne les
 * calcule pas, il les PORTE — mais il refuse ce qui n'a pas de sens.
 */
describe('les dates de frappe voyagent avec le solde', () => {
  const avecMeesh = (extra: Record<string, unknown>) =>
    resolveEngagementProgress(
      payload({
        meesh: {
          balance: 2,
          mintedLifetime: 2,
          debitablePoints: 400,
          floorPoints: 0,
          missingPoints: 821,
          mintCost: 1221,
          ...extra,
        },
      }),
    ).meesh;

  it('sert les deux dates telles quelles', () => {
    const m = avecMeesh({
      firstMintedAt: '2026-07-01T10:00:00.000Z',
      lastMintedAt: '2026-09-01T10:00:00.000Z',
    });
    expect(m?.firstMintedAt).toBe('2026-07-01T10:00:00.000Z');
    expect(m?.lastMintedAt).toBe('2026-09-01T10:00:00.000Z');
  });

  it('rend `null` quand rien n\'a jamais été frappé — jamais une date inventée', () => {
    const m = avecMeesh({ balance: 0, mintedLifetime: 0 });
    expect(m?.firstMintedAt).toBeNull();
    expect(m?.lastMintedAt).toBeNull();
  });

  /**
   * Une frappe UNIQUE a la même date des deux côtés, et c'est correct : le
   * sous-menu dira « frappée le 1er juillet » une seule fois plutôt que
   * d'afficher deux lignes identiques — mais c'est la VUE qui décide de ça, pas
   * la loi, qui se contente de ne pas mentir.
   */
  it('porte la même date des deux côtés sur une frappe unique', () => {
    const m = avecMeesh({
      balance: 1,
      mintedLifetime: 1,
      firstMintedAt: '2026-07-01T10:00:00.000Z',
      lastMintedAt: '2026-07-01T10:00:00.000Z',
    });
    expect(m?.firstMintedAt).toBe(m?.lastMintedAt);
  });

  it('refuse une date ILLISIBLE plutôt que de la propager à l\'écran', () => {
    const m = avecMeesh({ firstMintedAt: 'pas-une-date', lastMintedAt: 42 });
    expect(m?.firstMintedAt).toBeNull();
    expect(m?.lastMintedAt).toBeNull();
  });
});
