/**
 * Seed de recette du push photo (#10175, L19) — STAGING SEULEMENT.
 *
 * Amène un compte de recette à une étape de Flamme photographiable (7, 30, 100 ou 365 jours) et le marque
 * « à évaluer » : le passage suivant du job `game-photo-moments` écrit l'étape au registre, et l'envoi part
 * après le délai de la politique (60 min) si le compte est hors ligne et hors de ses heures calmes.
 *
 * REFUSE tout `DATABASE_URL` dont l'hôte n'est pas `database-staging`, et tout `REDIS_URL` dont l'hôte n'est pas
 * `redis-staging`, AVANT d'ouvrir la moindre connexion. Exécuter DANS le conteneur `meeshy-gateway-staging`, avec
 * `GAME_PHOTO_PUSH=on` (défaut de `docker-compose.staging.yml`).
 *
 * FAÇADE MINCE : la logique et ses témoins vivent dans `src/services/game/photoStagingSeed.ts`.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/game-photo-staging-seed.ts --user <ObjectId du compte de recette> --flame 30
 */
import Redis from 'ioredis';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { GamePhotoMomentService } from '../src/services/game/GamePhotoMomentService';
import { redisPhotoMomentMarks } from '../src/services/game/PhotoMomentMarks';
import { parsePhotoSeedArgs, seedFlameStep, stagingSeedGuard } from '../src/services/game/photoStagingSeed';

async function main(): Promise<void> {
  const guard = stagingSeedGuard(process.env);
  if ('reason' in guard) {
    console.error(`✗ Refusé (${guard.reason}) : ce seed n'écrit que dans la base et le Redis du staging.`);
    process.exitCode = 1;
    return;
  }
  const args = parsePhotoSeedArgs(process.argv.slice(2));
  if ('reason' in args) {
    console.error(`✗ Arguments (${args.reason}) : --user <ObjectId> --flame <7|30|100|365>`);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? '', { maxRetriesPerRequest: 2, lazyConnect: true });
  try {
    await redis.connect();
    const photo = new GamePhotoMomentService(prisma);
    const result = await seedFlameStep(
      { users: prisma.user, detect: (userId, now) => photo.detect(userId, now), marks: redisPhotoMomentMarks(() => redis) },
      { userId: args.userId, flameDays: args.flameDays, now: new Date() },
    );
    console.log(`Seed photo (#10175) — compte ${args.userId}, Flamme ${args.flameDays} : ${result}`);
    if (result !== 'seeded') process.exitCode = 1;
  } finally {
    redis.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du seed photo :', error);
  process.exitCode = 1;
});
