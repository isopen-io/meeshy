/**
 * Rattrapage du 2026-11-05 (#16274) — les ÉDITEURS de packs.
 *
 * La boutique ne crée plus d'éditeur en lisant (audit #16274, constats 5 et 6) :
 * un proposant d'avant les éditeurs est servi sous le nom neutre tant que ce
 * rattrapage n'a pas tourné. Il fait, dans cet ordre :
 *   1. `backfillNameKeys` — la clé de nom (`nameKey`) de chaque profil
 *      existant ; un nom réservé ou déjà porté par un plus ancien est ramené au
 *      nom neutre. C'est ce qui permet de poser ENSUITE l'index unique de
 *      `nameKey` sans doublon ;
 *   2. `backfill` — l'éditeur de chaque proposant VIVANT d'un pack de stickers,
 *      d'apparence ou de lens (un compte supprimé ou désactivé est sauté,
 *      jamais recréé), et l'adresse des anciens profils.
 *
 * Les clés se calculent par `publisherNameKey`, la fonction que le code
 * applique à chaque écriture : un calcul recopié dans un script mongosh
 * pourrait diverger.
 *
 * FAÇADE MINCE : la logique vit dans `src/services/packs/PackPublishers.ts`.
 *
 * Ordre de déploiement : ce rattrapage, PUIS
 * `packages/shared/prisma/migrations/2026-11-05-partner-profile-publisher-indexes.mongodb.js`
 * (qui refuse de poser un index tant qu'il reste des doublons).
 *
 * `DRY_RUN=1` : compte sans rien écrire. Idempotent. En autonomie sur staging ;
 * en production SEULEMENT après feu vert du porteur et sauvegarde vérifiée.
 *
 * Usage :
 *   cd services/gateway
 *   DRY_RUN=1 bunx tsx scripts/2026-11-05-backfill-pack-publishers.ts   # à blanc
 *   bunx tsx scripts/2026-11-05-backfill-pack-publishers.ts             # écrit
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { defaultPackPublishers, type PublishedBy } from '../src/services/packs/PackPublishers';

const DRY_RUN = process.env.DRY_RUN === '1';

const SUBMITTERS = { select: { submitterId: true, author: true } } as const;

async function publishedBy(prisma: PrismaClient): Promise<readonly PublishedBy[]> {
  const [stickers, appearance, lenses] = await Promise.all([
    prisma.stickerPack.findMany(SUBMITTERS),
    prisma.communityAppearancePack.findMany(SUBMITTERS),
    prisma.lensPack.findMany(SUBMITTERS),
  ]);
  return [...stickers, ...appearance, ...lenses];
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log('Rattrapage des éditeurs de packs (#16274)');
  console.log(`  mode : ${DRY_RUN ? 'À BLANC (DRY_RUN=1)' : 'ÉCRITURE'}`);
  try {
    const packs = await publishedBy(prisma);
    const submitters = new Set(packs.map((pack) => pack.submitterId));
    const withoutKey = await prisma.partnerProfile.count({ where: { OR: [{ nameKey: null }, { nameKey: { isSet: false } }] } });
    console.log(`  proposants distincts            : ${submitters.size}`);
    console.log(`  profils sans clé de nom         : ${withoutKey}`);
    if (DRY_RUN) {
      console.log("\nÀ blanc : rien n'a été écrit. Relancer sans DRY_RUN pour appliquer.");
      return;
    }
    const publishers = defaultPackPublishers(prisma);
    const names = await publishers.backfillNameKeys();
    console.log(`  clés de nom posées              : ${names.keyed}`);
    console.log(`  ramenés au nom neutre           : ${names.neutralized}`);
    console.log(`  remis à plus tard (balayage)    : ${names.deferred}`);
    const report = await publishers.backfill(packs);
    console.log(`  éditeurs créés                  : ${report.created}`);
    console.log(`  adresses posées                 : ${report.addressed}`);
    console.log(`  déjà complets                   : ${report.kept}`);
    console.log(`  comptes sautés (supprimés…)     : ${report.skipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exit(1);
});
