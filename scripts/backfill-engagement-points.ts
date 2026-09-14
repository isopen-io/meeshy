#!/usr/bin/env bun
/**
 * REMPLISSAGE DES POINTS HISTORIQUES — #6434, option B du porteur (2026-09-14).
 *
 * La loi et ses gardes vivent dans la passerelle, où la CI les teste :
 * `services/gateway/src/services/engagement/engagementPointsBackfill.ts`. Ce
 * script ne fait que les servir et imprimer le rapport.
 *
 * ## Ne PAS confondre avec `backfill-engagement-score.mjs` (#5742)
 *
 * Celui-là réécrit TOUS les compteurs à `count × poids`. Relancé aujourd'hui, il
 * effacerait les multiplicateurs d'élan (#5749) et RENDRAIT les points débités
 * par une frappe. Celui-ci ne remplit que les lignes à zéro, jamais un axe
 * qu'une frappe a débité, et rétablit `engagementScore == Σ points`.
 *
 * ## Usage
 *
 *   bun scripts/backfill-engagement-points.ts            # simulation, n'écrit RIEN
 *   bun scripts/backfill-engagement-points.ts --apply    # applique (accord du porteur requis)
 *
 * Dans un conteneur de la passerelle (Node, sans les sources TypeScript) :
 *
 *   bun build scripts/backfill-engagement-points.ts --target=node \
 *     --external '@meeshy/shared/*' --outfile /tmp/backfill-engagement-points.mjs
 *   docker cp /tmp/backfill-engagement-points.mjs <conteneur>:/app/backfill-engagement-points.mjs
 *   docker exec -w /app <conteneur> node backfill-engagement-points.mjs
 *
 * `@meeshy/shared` reste externe : le conteneur résout le client Prisma, les
 * poids et les paliers qu'il sert réellement, jamais une copie.
 *
 * Le rapport ne porte AUCUN identifiant de compte : il se colle dans une issue.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { ENGAGEMENT_AXIS_WEIGHTS, LEVEL_THRESHOLDS } from '@meeshy/shared/types/engagement';
import { MEESH_MINT_COST } from '@meeshy/shared/utils/meesh';
import { backfillEngagementPoints } from '../services/gateway/src/services/engagement/engagementPointsBackfill';

const APPLY = process.argv.includes('--apply');

/** L'hôte et la base visés — jamais l'URL entière, qui porte les identifiants. */
function cible(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}${url.pathname}`;
  } catch {
    return 'DATABASE_URL illisible';
  }
}

const oui = (vrai: boolean): string => (vrai ? 'oui' : 'non');
const signe = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    console.log(`${APPLY ? '== APPLICATION ==' : '== SIMULATION (aucune écriture) =='}  cible : ${cible()}`);

    const rapport = await backfillEngagementPoints(
      prisma,
      { weights: ENGAGEMENT_AXIS_WEIGHTS, levelThresholds: LEVEL_THRESHOLDS, mintCost: MEESH_MINT_COST },
      { apply: APPLY },
    );

    const tries = [...rapport.accounts].sort((a, b) => b.plan.scoreBefore - a.plan.scoreBefore);
    tries.forEach(({ role, status, plan }, rang) => {
      const touche =
        plan.counterWrites.length > 0 ||
        plan.score !== null ||
        plan.levelsToEngrave.length > 0 ||
        plan.levelsToErase.length > 0;
      if (!touche) return;
      console.log(
        [
          `compte ${String(rang + 1).padStart(2, '0')}`,
          String(role ?? '?').padEnd(6),
          `score ${plan.scoreBefore}→${plan.scoreAfter}`,
          `points ${plan.pointsBefore}→${plan.pointsAfter}`,
          `rempli ${signe(plan.filledPoints)} (${plan.counterWrites.filter((w) => w.filled).length} lignes)`,
          `réparti ${signe(plan.distributedPoints)}`,
          plan.undistributed > 0 ? `NON RÉPARTI ${plan.undistributed}` : '',
          plan.levelsToEngrave.length > 0 ? `paliers ${plan.levelsToEngrave.join(',')}` : '',
          plan.levelsToErase.length > 0 ? `niveaux éteints ${plan.levelsToErase.join(',')}` : '',
          `frappe ${oui(plan.canMintBefore)}→${oui(plan.canMintAfter)}`,
          `[${status}]`,
        ]
          .filter(Boolean)
          .join('  '),
      );
    });

    const t = rapport.totals;
    console.log(
      `\n${t.accounts} comptes · ${t.accountsWithWrites} à écrire · ${t.counterWrites} lignes` +
        ` · rempli +${t.filledPoints} · réparti +${t.distributedPoints} · ${t.scoresAligned} scores alignés` +
        ` · ${t.levelsToEngrave} paliers · ${t.levelsToErase} niveaux éteints · ${t.undistributedAccounts} restes non répartis` +
        ` · frappe possible ${t.canMintBefore}→${t.canMintAfter}` +
        (APPLY ? ` · ${t.moved} comptes abandonnés (valeur bougée — relancer)` : '\nRelancer avec --apply pour écrire.'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
