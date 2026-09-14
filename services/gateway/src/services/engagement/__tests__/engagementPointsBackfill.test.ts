/**
 * LE REMPLISSAGE DES POINTS HISTORIQUES (#6434, option B du porteur, 2026-09-14).
 *
 * La frappe se décide sur `Σ EngagementCounter.points`, l'écran montre
 * `User.engagementScore`. Les compteurs antérieurs à la colonne `points`
 * (#5743) n'ont jamais été remplis : un compte de staging affichait 1222 points
 * pour 35 débitables, et ne voyait jamais le bouton de frappe.
 *
 * Ces témoins portent la LOI, pure : ce qu'on écrit, où, et ce qu'on ne touche
 * jamais. L'exécution (lecture, gardes d'écriture) est au script.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  ENGAGEMENT_AXES,
  ENGAGEMENT_AXIS_WEIGHTS,
  LEVEL_THRESHOLDS,
  levelMilestoneKey,
} from '@meeshy/shared/types/engagement';
import { MEESH_MINT_COST } from '@meeshy/shared/utils/meesh';
import {
  planEngagementPointsBackfill,
  type PointsBackfillAccount,
  type PointsBackfillPlan,
} from '../engagementPointsBackfill';

const REGLES = { weights: ENGAGEMENT_AXIS_WEIGHTS, levelThresholds: LEVEL_THRESHOLDS, mintCost: MEESH_MINT_COST };

/** Les axes viennent du CATALOGUE : un nom recopié ici survivrait à son renommage. */
const axeDe = (famille: string, rang = 0): string => ENGAGEMENT_AXES.filter((a) => a.startsWith(`${famille}.`))[rang]!;
const poids = (axe: string): number => ENGAGEMENT_AXIS_WEIGHTS[axe as keyof typeof ENGAGEMENT_AXIS_WEIGHTS];

const ligne = (axisKey: string, count: number, points: number) => ({ id: `c-${axisKey}`, axisKey, count, points });

const compte = (surcharge: Partial<PointsBackfillAccount>): PointsBackfillAccount => ({
  score: 0,
  counters: [],
  mintedAxes: [],
  engravedLevelKeys: [],
  ...surcharge,
});

/** L'état qu'un passage `--apply` laisserait — pour rejouer la loi dessus. */
const appliquer = (avant: PointsBackfillAccount, plan: PointsBackfillPlan): PointsBackfillAccount => ({
  ...avant,
  score: plan.scoreAfter,
  counters: avant.counters.map((c) => {
    const ecrit = plan.counterWrites.find((w) => w.counterId === c.id);
    return ecrit ? { ...c, points: ecrit.to } : c;
  }),
  engravedLevelKeys: [
    ...avant.engravedLevelKeys.filter((cle) => !plan.levelsToErase.map(levelMilestoneKey).includes(cle)),
    ...plan.levelsToEngrave.map(levelMilestoneKey),
  ],
});

const ecritSur = (plan: PointsBackfillPlan, axe: string) => plan.counterWrites.find((w) => w.axisKey === axe);

describe('planEngagementPointsBackfill — le remplissage', () => {
  it('remplit `count × poids` les lignes à zéro, et laisse celles qui portent des points', () => {
    const texte = axeDe('content', 1);
    const audio = axeDe('content', 0);
    const lien = axeDe('social');
    const plan = planEngagementPointsBackfill(
      compte({ score: 10 * poids(texte) + 4 * poids(audio) + 35, counters: [ligne(texte, 10, 0), ligne(audio, 4, 0), ligne(lien, 1, 35)] }),
      REGLES,
    );

    expect(ecritSur(plan, texte)).toEqual({ counterId: `c-${texte}`, axisKey: texte, from: 0, to: 10 * poids(texte), filled: true });
    expect(ecritSur(plan, audio)?.to).toBe(4 * poids(audio));
    expect(ecritSur(plan, lien)).toBeUndefined();
    expect(plan.filledPoints).toBe(10 * poids(texte) + 4 * poids(audio));
  });

  it('ne remplit JAMAIS un axe qu’une frappe a débité — ce serait rendre des points dépensés', () => {
    const texte = axeDe('content', 1);
    const plan = planEngagementPointsBackfill(
      compte({ score: 0, counters: [ligne(texte, 158, 0)], mintedAxes: [texte] }),
      REGLES,
    );

    expect(plan.counterWrites).toEqual([]);
    expect(plan.filledPoints).toBe(0);
  });

  it('n’écrit rien sur un axe absent du catalogue', () => {
    const plan = planEngagementPointsBackfill(
      compte({ score: 0, counters: [ligne('legacy.retire', 5, 0)] }),
      REGLES,
    );

    expect(plan.counterWrites).toEqual([]);
  });
});

describe('planEngagementPointsBackfill — l’invariant score == Σ points', () => {
  /**
   * Le compte MESURÉ sur staging le 2026-09-14 : 1222 points affichés, 35
   * débitables, 1145 à remplir. Le remplissage seul le laisse à 1180 — sous
   * le prix. C'est l'écart restant, réparti, qui lui rend la frappe.
   */
  const commeStaging = () => {
    const [audio, texte] = [axeDe('content', 0), axeDe('content', 1)];
    return compte({
      score: 1222,
      counters: [
        ligne(texte, 60, 0),
        ligne(audio, 39, 0),
        ligne(axeDe('conversation'), 43, 0),
        ligne(axeDe('comment'), 11, 0),
        ligne(axeDe('tool'), 6, 0),
        ligne(axeDe('social'), 1, 35),
      ],
      engravedLevelKeys: LEVEL_THRESHOLDS.filter((s) => s <= 1222).map(levelMilestoneKey),
    });
  };

  it('écart positif : le reste est réparti, Σ points rejoint le score, le score ne bouge pas', () => {
    const avant = commeStaging();
    const plan = planEngagementPointsBackfill(avant, REGLES);

    expect(plan.pointsBefore).toBe(35);
    expect(plan.pointsBefore + plan.filledPoints).toBe(1180);
    expect(plan.distributedPoints).toBe(42);
    expect(plan.pointsAfter).toBe(1222);
    expect(plan.score).toBeNull();
    expect(plan.scoreAfter).toBe(1222);
    expect(plan.canMintBefore).toBe(false);
    expect(plan.canMintAfter).toBe(true);
  });

  it('le reste se répartit en ENTIERS, sans perdre ni créer un point', () => {
    const [a, b, c] = [axeDe('content', 0), axeDe('content', 1), axeDe('content', 2)];
    const plan = planEngagementPointsBackfill(
      compte({ score: 13, counters: [ligne(a, 1, 1), ligne(b, 1, 1), ligne(c, 1, 1)] }),
      REGLES,
    );

    const tos = plan.counterWrites.map((w) => w.to);
    expect(tos.every(Number.isInteger)).toBe(true);
    expect(plan.distributedPoints).toBe(10);
    expect(plan.pointsAfter).toBe(13);
  });

  it('écart négatif : les points restent, le score s’aligne sur Σ points, et les paliers franchis se gravent', () => {
    const texte = axeDe('content', 1);
    const plan = planEngagementPointsBackfill(
      compte({ score: 140, counters: [ligne(texte, 20, 0)], engravedLevelKeys: ['level:10', 'level:50'] }),
      REGLES,
    );

    expect(plan.pointsAfter).toBe(20 * poids(texte));
    expect(plan.score).toEqual({ from: 140, to: 20 * poids(texte) });
    expect(plan.distributedPoints).toBe(0);
    expect(plan.levelsToEngrave).toEqual(LEVEL_THRESHOLDS.filter((s) => s > 50 && s <= 20 * poids(texte)));
  });

  it('un reste positif sans aucun axe pour le porter n’écrit rien, et le signale', () => {
    const plan = planEngagementPointsBackfill(compte({ score: 50, counters: [] }), REGLES);

    expect(plan.counterWrites).toEqual([]);
    expect(plan.score).toBeNull();
    expect(plan.undistributed).toBe(50);
  });

  it('un compte déjà cohérent ne produit AUCUNE écriture', () => {
    const texte = axeDe('content', 1);
    const plan = planEngagementPointsBackfill(
      compte({ score: 180, counters: [ligne(texte, 20, 180)], engravedLevelKeys: ['level:10', 'level:50', 'level:150'] }),
      REGLES,
    );

    expect(plan.counterWrites).toEqual([]);
    expect(plan.score).toBeNull();
    expect(plan.levelsToEngrave).toEqual([]);
  });

  /**
   * Le compte de staging APRÈS sa première frappe réelle (2026-09-14) : score 1,
   * Σ points 1, et trois paliers de niveau gravés au-dessus. L'écran disait
   * « Niveau 3 · 1 point · encore 9 points avant le niveau 4 » (#6465).
   */
  it('après une frappe, les niveaux gravés au-dessus du score s’éteignent, et seulement eux', () => {
    const texte = axeDe('content', 1);
    const avant = compte({
      score: 1,
      counters: [ligne(texte, 3, 1)],
      mintedAxes: [texte],
      engravedLevelKeys: ['level:10', 'level:50', 'level:150'],
    });

    const plan = planEngagementPointsBackfill(avant, REGLES);

    expect(plan.levelsToErase).toEqual([10, 50, 150]);
    expect(plan.levelsToEngrave).toEqual([]);
    expect(plan.counterWrites).toEqual([]);
    expect(plan.score).toBeNull();
    expect(planEngagementPointsBackfill(appliquer(avant, plan), REGLES).levelsToErase).toEqual([]);
  });

  it('un niveau que le score couvre reste gravé', () => {
    const texte = axeDe('content', 1);
    const plan = planEngagementPointsBackfill(
      compte({ score: 60, counters: [ligne(texte, 20, 60)], engravedLevelKeys: ['level:10', 'level:50'] }),
      REGLES,
    );

    expect(plan.levelsToErase).toEqual([]);
  });

  it('est IDEMPOTENTE : rejouée sur l’état qu’elle a produit, elle n’écrit plus rien', () => {
    const avant = commeStaging();
    const apres = appliquer(avant, planEngagementPointsBackfill(avant, REGLES));
    const second = planEngagementPointsBackfill(apres, REGLES);

    expect(second.counterWrites).toEqual([]);
    expect(second.score).toBeNull();
    expect(second.levelsToEngrave).toEqual([]);
  });
});
