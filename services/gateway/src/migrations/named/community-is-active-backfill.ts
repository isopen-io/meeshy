import type { NamedMigration } from './types';

const LEGACY_WITHOUT_IS_ACTIVE = { isActive: { $exists: false } } as const;
const COLLECTIONS = ['Community', 'CommunityMember'] as const;

/**
 * « Mes communautés » rendait une liste VIDE (#10924) : les communautés et les
 * adhésions créées avant que `isActive` existe n'en portent pas la colonne, et
 * le filtre `isActive: true` de #8876 ne retient pas une colonne ABSENTE —
 * Prisma Mongo non plus, `not: false` compris (mesuré sur staging : 4 sur 12).
 * La colonne n'étant pas optionnelle, aucun filtre Prisma ne peut lire
 * « absente = active » : la donnée se répare. Seule l'absence est écrite ; une
 * communauté ou une adhésion DÉSACTIVÉE (`false`) le reste. Idempotente.
 */
export const communityIsActiveBackfill: NamedMigration = {
  name: '2026-10-18-community-is-active-backfill',
  issue: '#10924',
  summary: 'isActive: true sur les communautés et adhésions héritées qui ne portent pas la colonne',
  async run({ db, dryRun, log }) {
    for (const name of COLLECTIONS) {
      const collection = db.collection(name);
      const missing = await collection.countDocuments(LEGACY_WITHOUT_IS_ACTIVE);
      log(`  ${name} sans isActive : ${missing}`);
      if (dryRun || missing === 0) continue;
      const { modifiedCount } = await collection.updateMany(LEGACY_WITHOUT_IS_ACTIVE, { $set: { isActive: true } });
      log(`  ${name} réparées : ${modifiedCount}`);
    }
  },
};
