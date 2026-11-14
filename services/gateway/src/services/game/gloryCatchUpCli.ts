/**
 * LE RATTRAPAGE DE GLOIRE EN LIGNE DE COMMANDE (#17779) — exécutable ONE-SHOT, dans le conteneur passerelle.
 *
 * Sous `src/` pour être COMPILÉ dans l'image par `tsc` : le conteneur ne porte que `dist/` et les dépendances de
 * production. Il lit `DATABASE_URL` dans l'environnement du conteneur ; rien n'est recopié ni affiché. Le calcul et
 * l'écriture vivent dans `gloryCatchUp.ts` ; les écritures passent par `GloryService.credit`, `announce: false`, et le
 * notificateur de niveau est remplacé par un silence : aucune annonce ne part.
 *
 * `DRY_RUN=1` : n'écrit rien et imprime, compte par compte, ce qui serait gravé. Sans `DRY_RUN`, écrit.
 * `BATCH_SIZE` : comptes lus par lot (200 par défaut, 1000 au plus). Idempotent : un second passage rend 0.
 *
 * Staging (autonomie, #9226) :
 *   ssh root@meeshy.me 'docker exec -e DRY_RUN=1 meeshy-gateway-staging node dist/src/services/game/gloryCatchUpCli.js'
 *   ssh root@meeshy.me 'docker exec meeshy-gateway-staging node dist/src/services/game/gloryCatchUpCli.js'
 *   ssh root@meeshy.me 'docker exec -e DRY_RUN=1 meeshy-gateway-staging node dist/src/services/game/gloryCatchUpCli.js'   # attendu : 0 rattrapé
 *
 * Production (/opt/meeshy/production) — feu vert du porteur et sauvegarde VÉRIFIÉE de `GloryLedger` et `User` d'abord :
 *   ssh root@meeshy.me 'docker exec -e DRY_RUN=1 meeshy-gateway node dist/src/services/game/gloryCatchUpCli.js'
 *   ssh root@meeshy.me 'docker exec meeshy-gateway node dist/src/services/game/gloryCatchUpCli.js'
 *   ssh root@meeshy.me 'docker exec -e DRY_RUN=1 meeshy-gateway node dist/src/services/game/gloryCatchUpCli.js'           # attendu : 0 rattrapé
 *
 * Code de sortie : 0 = passage terminé ; 1 = erreur.
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';

import { GloryService } from './GloryService';
import { GLORY_CATCH_UP_DEFAULT_BATCH, runGloryCatchUp } from './gloryCatchUp';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const glory = new GloryService(prisma, { onLevelReached: async () => undefined });
    await runGloryCatchUp({
      prisma,
      glory,
      dryRun: process.env.DRY_RUN === '1',
      batchSize: Number(process.env.BATCH_SIZE ?? GLORY_CATCH_UP_DEFAULT_BATCH),
      out: (line) => console.log(line),
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('Échec du rattrapage de Gloire :', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
