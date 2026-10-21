#!/usr/bin/env bun
/**
 * RATTRAPAGE DES BADGES D'AXE ET DES ÉTINCELLES — #10845 (compteurs d'actions) et #10846 (total à vie, cycle, niveau
 * max à vie), décisions du porteur du 2026-10-16.
 *
 * La loi et ses gardes vivent dans la passerelle, où la CI les teste :
 *   services/gateway/src/services/engagement/engagementCountBackfill.ts   (compteurs `count`, paliers gravés en silence)
 *   services/gateway/src/services/engagement/engagementSparksBackfill.ts  (borne basse : score + Σ prix des frappes)
 * Ce script ne fait que les servir et imprimer le rapport.
 *
 * ## Usage — À BLANC par défaut : n'écrit RIEN
 *
 *   bun scripts/backfill-engagement-sparks.ts                      # simulation des deux passages
 *   bun scripts/backfill-engagement-sparks.ts --apply              # applique les deux (accord du porteur requis)
 *   bun scripts/backfill-engagement-sparks.ts --only=counts        # un seul passage : counts | sparks
 *
 * Idempotent : un second `--apply` ne trouve plus rien à écrire. Chaque écriture est gardée par « la valeur est encore
 * celle que j'ai lue » ; un compte dont la valeur a bougé est laissé (`moved`) — relancer.
 *
 * Ordre conseillé : `counts` puis `sparks` (indépendants). Sauvegarde vérifiée de `User` et `EngagementCounter` AVANT
 * tout `--apply` en production (#9223).
 *
 * Dans un conteneur de la passerelle (Node, sans les sources TypeScript) :
 *
 *   bun build scripts/backfill-engagement-sparks.ts --target=node \
 *     --external '@meeshy/shared/*' --outfile /tmp/backfill-engagement-sparks.mjs
 *   docker cp /tmp/backfill-engagement-sparks.mjs <conteneur>:/app/backfill-engagement-sparks.mjs
 *   docker exec -w /app <conteneur> node backfill-engagement-sparks.mjs [--apply]
 *
 * Le rapport ne porte AUCUN identifiant de compte : il se colle dans une issue.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { backfillEngagementCounts } from '../services/gateway/src/services/engagement/engagementCountBackfill';
import { backfillEngagementSparks } from '../services/gateway/src/services/engagement/engagementSparksBackfill';

const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);

/** L'hôte et la base visés — jamais l'URL entière, qui porte les identifiants. */
function cible(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}${url.pathname}`;
  } catch {
    return 'DATABASE_URL illisible';
  }
}

async function main(): Promise<void> {
  if (ONLY !== undefined && ONLY !== 'counts' && ONLY !== 'sparks') {
    throw new Error('--only attend `counts` ou `sparks`');
  }
  const prisma = new PrismaClient();
  try {
    console.log(`${APPLY ? '== APPLICATION ==' : '== SIMULATION (aucune écriture) =='}  cible : ${cible()}`);

    if (ONLY !== 'sparks') {
      const { totals: t } = await backfillEngagementCounts(prisma, { apply: APPLY });
      console.log(
        `[counts] ${t.accounts} comptes · ${t.accountsToWrite} à écrire · ${t.countsRaised} compteurs relevés` +
          ` · ${t.badgesToEngrave} paliers gravés en silence` +
          (APPLY ? ` · ${t.applied} appliqués · ${t.moved} laissés (valeur bougée — relancer)` : ''),
      );
    }
    if (ONLY !== 'counts') {
      const { totals: t } = await backfillEngagementSparks(prisma, { apply: APPLY });
      console.log(
        `[sparks] ${t.accounts} comptes · ${t.accountsToWrite} à écrire · +${t.lifetimeAdded} étincelles au total à vie (borne basse)` +
          (APPLY ? ` · ${t.applied} appliqués · ${t.moved} laissés (valeur bougée — relancer)` : ''),
      );
    }
    if (!APPLY) console.log('\nRelancer avec --apply pour écrire.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
