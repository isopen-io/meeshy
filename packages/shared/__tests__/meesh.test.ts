/**
 * La loi de frappe des Meeshes (#5743).
 *
 * Ce qui se vérifie ici : le prix, l'ordre, le plancher inaliénable, et
 * surtout ce que le plan REFUSE de faire.
 */

import { describe, it, expect } from 'vitest';
import {
  computeMeeshMintPlan,
  debitsActionCount,
  MEESH_MINT_COST,
  type MeeshAxisState,
} from '../utils/meesh.js';

const axe = (axisKey: string, count: number, points: number): MeeshAxisState =>
  ({ axisKey, count, points }) as MeeshAxisState;

describe('les conversations : POINTS repris, ACTIONS jamais (option C)', () => {
  it('déclare que les trois axes de conversation ne perdent pas d\'actions', () => {
    expect(debitsActionCount('conversation.private')).toBe(false);
    expect(debitsActionCount('conversation.public')).toBe(false);
    expect(debitsActionCount('conversation.community')).toBe(false);
    expect(debitsActionCount('content.post')).toBe(true);
  });

  it('rend leurs points CONVERTIBLES — 61 % du score en production était mort', () => {
    // 1 400 points dont 1 300 de conversations. Sous l'ancienne règle, ce
    // compte ne pouvait pas frapper malgré un score dépassant le prix.
    const plan = computeMeeshMintPlan([
      axe('conversation.private', 260, 1300),
      axe('content.text_message', 33, 100),
    ]);
    expect(plan.canMint).toBe(true);
    expect(plan.debitablePoints).toBe(1400);
    // `floorPoints` dit maintenant « repris en dernier, sans éteindre de badge ».
    expect(plan.floorPoints).toBe(1300);
  });

  it('les reprend en DERNIER, après les outils', () => {
    const plan = computeMeeshMintPlan([
      axe('content.text_message', 100, 300),
      axe('tool.sticker', 300, 300),
      axe('conversation.private', 200, 1000),
    ]);
    expect(plan.debits.map((d) => d.axisKey)).toEqual([
      'content.text_message',
      'tool.sticker',
      'conversation.private',
    ]);
  });

  it('ne reprend AUCUNE action sur un axe de conversation — le badge reste vrai', () => {
    // C'est la propriété qui protège des deux défauts : le badge ne contredit
    // pas la liste que l'utilisateur a sous les yeux, et rien n'incite à
    // ouvrir des fils bidon pour le regagner.
    const plan = computeMeeshMintPlan([axe('conversation.private', 300, 1500)]);
    const ligne = plan.debits.find((d) => d.axisKey === 'conversation.private');
    expect(ligne?.points).toBe(MEESH_MINT_COST);
    expect(ligne?.count).toBe(0);
  });

  it('ne touche les conversations que si le reste ne suffit pas', () => {
    const plan = computeMeeshMintPlan([
      axe('content.text_message', 500, 1500),
      axe('conversation.private', 200, 1000),
    ]);
    expect(plan.debits.map((d) => d.axisKey)).not.toContain('conversation.private');
  });
});

describe('l\'ordre du débit', () => {
  it('reprend d\'abord les messages, puis les commentaires, puis les stories', () => {
    const plan = computeMeeshMintPlan([
      axe('content.text_message', 100, 300),
      axe('comment.text', 150, 300),
      axe('content.story', 200, 600),
      axe('tool.sticker', 500, 500),
    ]);
    expect(plan.canMint).toBe(true);
    expect(plan.debits.map((d) => d.axisKey)).toEqual([
      'content.text_message',
      'comment.text',
      'content.story',
      'tool.sticker',
    ]);
  });

  it('protège les outils en dernier — ils ne sont touchés que si le reste ne suffit pas', () => {
    const plan = computeMeeshMintPlan([
      axe('content.text_message', 500, 1500),
      axe('tool.sticker', 300, 300),
    ]);
    expect(plan.debits.map((d) => d.axisKey)).toEqual(['content.text_message']);
  });

  it('reprend exactement le prix, jamais un point de plus', () => {
    const plan = computeMeeshMintPlan([
      axe('content.text_message', 1000, 3000),
      axe('content.post', 100, 300),
    ]);
    const total = plan.debits.reduce((somme, ligne) => somme + ligne.points, 0);
    expect(total).toBe(MEESH_MINT_COST);
  });
});

describe('les badges suivent le compte d\'ACTIONS', () => {
  it('reprend les actions au prorata de la valeur moyenne de l\'axe', () => {
    // 400 actions valant 1200 points : 3 points l'action. Reprendre 1221
    // points prendrait tout l'axe (1200) puis 21 ailleurs.
    const plan = computeMeeshMintPlan([
      axe('content.text_message', 400, 1200),
      axe('comment.text', 50, 100),
    ]);
    const messages = plan.debits.find((d) => d.axisKey === 'content.text_message');
    expect(messages).toEqual({ axisKey: 'content.text_message', points: 1200, count: 400 });
    const commentaires = plan.debits.find((d) => d.axisKey === 'comment.text');
    expect(commentaires?.points).toBe(21);
    // 21 points sur 100 pour 50 actions -> environ 11 actions reprises.
    expect(commentaires?.count).toBe(11);
  });

  it('ne reprend jamais plus d\'actions qu\'il n\'en existe', () => {
    const plan = computeMeeshMintPlan([axe('content.text_message', 500, 2000)]);
    const ligne = plan.debits[0];
    expect(ligne.count).toBeLessThanOrEqual(500);
  });

  it('ne divise pas par zéro sur un axe à points sans action', () => {
    const plan = computeMeeshMintPlan([
      axe('content.text_message', 0, 1300), // état impossible en écriture, atteignable par reprise
    ]);
    expect(plan.canMint).toBe(true);
    expect(plan.debits[0].count).toBe(0);
    expect(Number.isFinite(plan.debits[0].count)).toBe(true);
  });
});

describe('robustesse du plan', () => {
  it('ignore un axe hors catalogue plutôt que de fausser le total', () => {
    const plan = computeMeeshMintPlan([
      axe('axe.du.futur', 999, 9999),
      axe('content.post', 100, 300),
    ]);
    expect(plan.debitablePoints).toBe(300);
    expect(plan.canMint).toBe(false);
  });

  it('traite une valeur négative ou non finie comme zéro', () => {
    const plan = computeMeeshMintPlan([
      axe('content.post', -5, Number.NaN),
      axe('content.story', 10, 30),
    ]);
    expect(plan.debitablePoints).toBe(30);
  });

  it('rend un plan vide et le manque exact pour un compte neuf', () => {
    const plan = computeMeeshMintPlan([]);
    expect(plan.canMint).toBe(false);
    expect(plan.debitablePoints).toBe(0);
    expect(plan.missingPoints).toBe(MEESH_MINT_COST);
    expect(plan.debits).toHaveLength(0);
  });
});

describe('la résolution des Meeshes pour l\'écran (#5743)', () => {
  const base = {
    counters: [],
    milestones: [],
    streak: { currentStreakDays: 0, longestStreakDays: 0 },
    level: { engagementScore: 0 },
  } as const;

  it('n\'expose RIEN quand la passerelle ne sert pas le bloc', async () => {
    const { resolveEngagementProgress } = await import('../utils/engagement-progress.js');
    expect(resolveEngagementProgress(base).meesh).toBeUndefined();
  });

  it('n\'autorise la frappe que si les points DÉBITABLES couvrent le prix', async () => {
    const { resolveEngagementProgress } = await import('../utils/engagement-progress.js');
    // Score total confortable, mais l'essentiel vient du plancher.
    const pasAssez = resolveEngagementProgress({
      ...base,
      meesh: { balance: 0, mintedLifetime: 0, debitablePoints: 100, floorPoints: 1300, missingPoints: 1121, mintCost: 1221 },
    });
    expect(pasAssez.meesh?.canMint).toBe(false);

    const assez = resolveEngagementProgress({
      ...base,
      meesh: { balance: 2, mintedLifetime: 5, debitablePoints: 1300, floorPoints: 40, missingPoints: 0, mintCost: 1221 },
    });
    expect(assez.meesh?.canMint).toBe(true);
    expect(assez.meesh?.balance).toBe(2);
    expect(assez.meesh?.mintedLifetime).toBe(5);
  });

  it('mesure la barre sur les points DÉBITABLES, jamais sur le score total', async () => {
    const { resolveEngagementProgress } = await import('../utils/engagement-progress.js');
    // Une barre nourrie par le plancher promettrait une Meesh qui n'arrive jamais.
    const p = resolveEngagementProgress({
      ...base,
      meesh: { balance: 0, mintedLifetime: 0, debitablePoints: 610, floorPoints: 5000, missingPoints: 611, mintCost: 1221 },
    });
    expect(p.meesh?.progress).toBeCloseTo(0.5, 2);
  });

  it('plafonne la barre à 1 et ne rend jamais NaN sur un prix nul', async () => {
    const { resolveEngagementProgress } = await import('../utils/engagement-progress.js');
    const p = resolveEngagementProgress({
      ...base,
      meesh: { balance: 0, mintedLifetime: 0, debitablePoints: 9999, floorPoints: 0, missingPoints: 0, mintCost: 1221 },
    });
    expect(p.meesh?.progress).toBe(1);
    const zero = resolveEngagementProgress({
      ...base,
      meesh: { balance: 0, mintedLifetime: 0, debitablePoints: 10, floorPoints: 0, missingPoints: 0, mintCost: 0 },
    });
    expect(zero.meesh?.progress).toBe(0);
    expect(zero.meesh?.canMint).toBe(false);
  });
});
