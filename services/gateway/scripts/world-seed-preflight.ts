/**
 * Pré-vol du seed World Wide (#10000) — LECTURE SEULE, aucune écriture.
 *
 * À lancer AVANT de poser `WORLD_SEED_ENABLED=true` sur une base qui a des
 * utilisateurs : dit si `world` et `mshy_world` sont libres, et si chaque
 * administrateur désigné (`MEESHY_EMAIL`, `ADMIN_EMAIL`, `WORLD_ADMIN_EMAILS`)
 * est présent et légitime. Sort en code 1 tant qu'un bloquant subsiste.
 *
 * Les risques résiduels de la garde des pièces jointes d'invité (une charge
 * arbitraire logée dans un conteneur audio, #10045) bloquent chacun tant que le
 * porteur ne l'a pas accepté par son nom (#10057) :
 * `WORLD_GUEST_RESIDUAL_RISKS_ACCEPTED=<étiquette>,<étiquette>`.
 *
 * FAÇADE MINCE : la logique vit dans `src/services/world/worldSeedOperations.ts`.
 *
 * ⚠ En production : exécuter DANS le conteneur du gateway (la base n'expose
 * aucun port ; lancé d'un poste, `DATABASE_URL` vise la base LOCALE et le
 * verdict ne dit rien de la production). Le seed lui-même n'est activé
 * qu'avec le feu vert du porteur, après une sauvegarde vérifiée.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/world-seed-preflight.ts
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { inspectWorldSeed } from '../src/services/world/worldSeedOperations';
import { worldReservedIdentitiesFromEnv } from '../src/services/world/worldReservedMembers';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const acceptedResidualRisks = (process.env.WORLD_GUEST_RESIDUAL_RISKS_ACCEPTED ?? '')
      .split(',')
      .map((risk) => risk.trim())
      .filter((risk) => risk.length > 0);
    const preflight = await inspectWorldSeed(prisma, worldReservedIdentitiesFromEnv(), { acceptedResidualRisks });

    console.log('Pré-vol du seed World Wide (#10000) — lecture seule');
    console.log(`  conversation "world"   : ${preflight.conversation}`);
    console.log(`  lien "mshy_world"      : ${preflight.shareLink}`);
    console.log('  administrateurs désignés :');
    for (const member of preflight.members) {
      const who = member.status === 'absent' ? '(aucun compte)' : member.username;
      const why = member.status === 'ineligible' ? ` — ${member.reason}` : '';
      console.log(`    ${member.designation.padEnd(16)} ${member.status.padEnd(10)} ${who}${why}`);
    }
    console.log('  risques résiduels des pièces jointes d\'invité (#10057) :');
    for (const risk of preflight.residualRisks) {
      console.log(`    ${risk.padEnd(26)} ${acceptedResidualRisks.includes(risk) ? 'accepté par le porteur' : 'NON accepté'}`);
    }
    if (preflight.residualRisks.length === 0) console.log('    aucun : la garde les refuse tous');
    console.log('');

    if (preflight.ready) {
      console.log('✓ Prêt : WORLD_SEED_ENABLED=true peut être posé, sur feu vert du porteur et après sauvegarde vérifiée.');
      return;
    }
    console.log(`✗ Bloquants : ${preflight.blockers.join(', ')}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du pré-vol :', error);
  process.exitCode = 1;
});
