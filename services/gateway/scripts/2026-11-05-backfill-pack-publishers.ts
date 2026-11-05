/**
 * Rattrapage du 2026-11-05 (#16274) — les ÉDITEURS de packs.
 *
 * La boutique ne crée plus d'éditeur en lisant (audit #16274, constats 5 et 6) :
 * un proposant d'avant les éditeurs est servi sous le nom neutre tant que ce
 * rattrapage n'a pas tourné. Il fait, dans cet ordre :
 *   1. `backfillNameKeys` — la clé de nom (`nameKey`) de chaque profil
 *      existant. AUCUN nom n'est réécrit, AUCUNE vérification retirée : pour un
 *      nom en double, la clé va au profil vérifié, puis au plus ancien, et
 *      l'autre garde son nom sans clé, marqué À ARBITRER (`nameDisputedAt`),
 *      comme un ancien nom qui se lit comme Meeshy. Chaque profil à arbitrer
 *      est listé, pour qu'un admin tranche. C'est ce qui permet de poser
 *      ENSUITE l'index unique de `nameKey` sans doublon ;
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
 * (qui refuse de poser un index tant qu'il reste des doublons), sur le staging
 * AVANT la fusion du code.
 *
 * `DRY_RUN=1` : liste, profil par profil et proposant par proposant, tout ce
 * qu'il ferait, sans rien écrire. Idempotent. En autonomie sur staging ; en
 * production SEULEMENT après feu vert du porteur et sauvegarde vérifiée.
 *
 * Usage :
 *   cd services/gateway
 *   DRY_RUN=1 bunx tsx scripts/2026-11-05-backfill-pack-publishers.ts   # à blanc
 *   bunx tsx scripts/2026-11-05-backfill-pack-publishers.ts             # écrit
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { defaultPackPublishers, type BackfillEntry, type NameKeyEntry, type PublishedBy } from '../src/services/packs/PackPublishers';

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

function printNameKey(entry: NameKeyEntry): void {
  const verified = entry.verified ? ' (vérifié)' : '';
  const why = entry.reason === 'reserved' ? 'se lit comme Meeshy' : `homonyme — la clé va à ${entry.heldBy ?? '?'}`;
  console.log(entry.outcome === 'keyed' ? `    clé posée    ${entry.id}  « ${entry.displayName} »${verified}` : `    À ARBITRER   ${entry.id}  « ${entry.displayName} »${verified} : ${why}`);
}

function printBackfill(entry: BackfillEntry): void {
  console.log(`    ${entry.outcome.padEnd(10)} compte ${entry.userId}${entry.name === null ? '' : `  « ${entry.name} »`}`);
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
    const publishers = defaultPackPublishers(prisma);
    const names = await publishers.backfillNameKeys({ dryRun: DRY_RUN });
    console.log(`\n  1. clés de nom ${DRY_RUN ? 'à poser' : 'posées'}        : ${names.keyed}`);
    console.log(`     profils à arbitrer           : ${names.disputed}`);
    names.entries.forEach(printNameKey);
    const report = await publishers.backfill(packs, { dryRun: DRY_RUN });
    console.log(`\n  2. éditeurs ${DRY_RUN ? 'à créer' : 'créés'}            : ${report.created}`);
    console.log(`     adresses ${DRY_RUN ? 'à poser' : 'posées'}             : ${report.addressed}`);
    console.log(`     déjà complets                : ${report.kept}`);
    console.log(`     comptes sautés (supprimés…)  : ${report.skipped}`);
    console.log(`     reportés (réessayer)         : ${report.deferred}`);
    report.entries.forEach(printBackfill);
    if (DRY_RUN) console.log("\nÀ blanc : rien n'a été écrit. Relancer sans DRY_RUN pour appliquer.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exit(1);
});
