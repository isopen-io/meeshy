/**
 * LES MEESHES — la monnaie rare de Meeshy (#5743).
 *
 * Directive porteur (2026-09-08) : « 1221 points collectés partout donnent une
 * Meesh, l'opération se fait par une action MANUELLE. Ce qui fait redescendre
 * le niveau de chaque élément ayant permis de l'obtenir. »
 *
 * ## Ce que ce module contient, et ce qu'il ne contient pas
 *
 * Il contient la LOI : le prix, l'ordre du débit, et le PLAN qu'une frappe
 * exécuterait. Il ne contient aucune écriture — la transaction, l'idempotence
 * et le registre vivent dans la passerelle. Le plan est pur, donc les trois
 * clients peuvent MONTRER ce que la frappe coûtera avant qu'elle n'ait lieu,
 * en rejouant exactement le calcul du serveur.
 *
 * ## Le plancher inaliénable
 *
 * Les axes `conversation.*` sont EXCLUS du débit (décision porteur). Une
 * conversation distincte n'est pas une production renouvelable — on ne peut pas
 * « défaire » le fait d'avoir écrit à quelqu'un. Conséquence assumée et
 * heureuse : l'empreinte conversationnelle est la part du niveau qu'aucune
 * frappe ne reprend.
 *
 * Corollaire à porter jusqu'à l'écran : **le score TOTAL et le score DÉBITABLE
 * sont deux chiffres différents.** Un compte à 1 400 points dont 1 300 viennent
 * de conversations ne peut pas frapper. Les confondre produirait un bouton qui
 * refuse sans dire pourquoi.
 */

import { ENGAGEMENT_AXES, type EngagementAxisKey } from '../types/engagement.js';

/** Le prix d'une Meesh, en points. */
export const MEESH_MINT_COST = 1221;

/**
 * L'ordre du débit, par rangs (décision porteur). On reprend d'abord le plus
 * renouvelable, on protège en dernier ce qui a demandé un outil ou un don.
 */
export const MEESH_DEBIT_ORDER: readonly (readonly EngagementAxisKey[])[] = [
  ['content.text_message', 'content.audio_message'],
  ['comment.text', 'comment.audio'],
  // Le rang du MOOD (`content.mood`, #5735) vient ICI, entre les commentaires
  // et les stories — l'axe n'existe pas encore, sa place est réservée pour que
  // son arrivée n'ait pas à renuméroter l'ordre décidé par le porteur.
  ['content.story'],
  ['content.post', 'content.reel'],
  ['tool.sticker', 'tool.in_app_edit', 'tool.direct_publish'],
];

/** Les axes qu'aucune frappe ne débite — le plancher inaliénable du niveau. */
export const MEESH_NON_DEBITABLE_AXES: readonly EngagementAxisKey[] = [
  'conversation.private',
  'conversation.public',
  'conversation.community',
];

export const isDebitableAxis = (axisKey: EngagementAxisKey): boolean =>
  !MEESH_NON_DEBITABLE_AXES.includes(axisKey);

/** Un axe tel que la base le porte : des actions et les points qu'elles ont crédités. */
export type MeeshAxisState = {
  readonly axisKey: EngagementAxisKey;
  readonly count: number;
  readonly points: number;
};

/** Ce qu'une frappe reprendrait à UN axe. */
export type MeeshDebitLine = {
  readonly axisKey: EngagementAxisKey;
  readonly points: number;
  readonly count: number;
};

export type MeeshMintPlan = {
  /** Points repris à des axes débitables — jamais les conversations. */
  readonly debitablePoints: number;
  /** Points portés par les axes du plancher — visibles, jamais dépensables. */
  readonly floorPoints: number;
  /** Vrai si le plan couvre `MEESH_MINT_COST`. */
  readonly canMint: boolean;
  /** Ce qu'il manque pour frapper — `0` quand `canMint`. */
  readonly missingPoints: number;
  /** Le détail du débit, dans l'ordre où il s'appliquerait. Vide si `!canMint`. */
  readonly debits: readonly MeeshDebitLine[];
};

const finite = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

/**
 * Le plan d'une frappe, à partir de l'état des axes.
 *
 * Le `count` repris est proportionnel aux points repris, à la valeur MOYENNE
 * de l'axe (`points / count`) — exact quand l'élan a été constant sur cet axe,
 * honnête sinon. C'est `count` qui pilote les badges : ils s'éteignent donc
 * visiblement, comme le porteur l'a demandé.
 *
 * Fail-safe : un axe hors catalogue, un compte négatif ou non fini est ignoré
 * plutôt que de fausser le plan. Un axe à `points > 0` et `count === 0` (état
 * impossible en écriture, atteignable par une reprise de données) ne rend
 * aucune action — on ne divise jamais par zéro.
 */
export function computeMeeshMintPlan(axes: readonly MeeshAxisState[]): MeeshMintPlan {
  const parAxe = new Map<EngagementAxisKey, MeeshAxisState>();
  for (const axe of axes) {
    if (!(ENGAGEMENT_AXES as readonly string[]).includes(axe.axisKey)) continue;
    parAxe.set(axe.axisKey, {
      axisKey: axe.axisKey,
      count: finite(axe.count),
      points: finite(axe.points),
    });
  }

  let debitablePoints = 0;
  let floorPoints = 0;
  for (const axe of parAxe.values()) {
    if (isDebitableAxis(axe.axisKey)) debitablePoints += axe.points;
    else floorPoints += axe.points;
  }

  if (debitablePoints < MEESH_MINT_COST) {
    return {
      debitablePoints,
      floorPoints,
      canMint: false,
      missingPoints: MEESH_MINT_COST - debitablePoints,
      debits: [],
    };
  }

  const debits: MeeshDebitLine[] = [];
  let reste = MEESH_MINT_COST;
  for (const rang of MEESH_DEBIT_ORDER) {
    for (const axisKey of rang) {
      if (reste === 0) break;
      const axe = parAxe.get(axisKey);
      if (!axe || axe.points === 0) continue;
      const points = Math.min(reste, axe.points);
      const count = axe.count === 0 ? 0 : Math.min(axe.count, Math.round((points * axe.count) / axe.points));
      debits.push({ axisKey, points, count });
      reste -= points;
    }
    if (reste === 0) break;
  }

  return { debitablePoints, floorPoints, canMint: true, missingPoints: 0, debits };
}
