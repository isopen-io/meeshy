/**
 * Rattrapage de `User.engagementScore` — #5742.
 *
 * `updateEngagementScore` écrivait par `$inc` sur un champ qui peut valoir
 * `null` (pas seulement ABSENT) : neuf comptes en production ont ce champ
 * figé à `null` depuis leur première activité, donc `level = 0` et aucun
 * `level_up` jamais notifié malgré une vraie activité mesurée.
 *
 * FAÇADE MINCE : la logique vit dans
 * `services/engagement/engagementScoreBackfill.ts`, pour que le script ne
 * dérive pas de ce qu'il est censé appliquer.
 *
 * Sans écriture par défaut : `--apply` est OBLIGATOIRE pour corriger.
 *
 * ⚠ Lancé depuis un poste de travail, `DATABASE_URL` cible la base LOCALE et
 * le script affichera « succès » sans avoir touché la production — celle-ci
 * n'expose aucun port. À exécuter DANS le conteneur du gateway.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/backfill-engagement-score.ts             # à blanc
 *   bunx tsx scripts/backfill-engagement-score.ts --apply     # écrit
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { backfillEngagementScores } from '../src/services/engagement/engagementScoreBackfill';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  console.log('Rattrapage User.engagementScore');
  console.log(`  mode : ${APPLY ? 'ÉCRITURE (--apply)' : 'À BLANC (défaut)'}`);
  console.log('');

  try {
    const report = await backfillEngagementScores(prisma, {
      apply: APPLY,
      onCorrect: ({ userId, from, to }) => console.log(`  ${userId}  ${JSON.stringify(from)} → ${to}`),
    });

    console.log('');
    console.log(`  comptes avec activité : ${report.scanned}`);
    console.log(`  corrigés               : ${report.corrected}`);
    console.log(`  déjà valides            : ${report.alreadyValid}`);
    console.log('');

    if (!APPLY) {
      console.log("À blanc : rien n'a été écrit. Relancer avec --apply.");
      return;
    }
    console.log('✓ Score et paliers de niveau rattrapés (sans notification — voir #5742).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exit(1);
});
