/**
 * LE RATTRAPAGE DES PACKS DES COMPTES DÉJÀ PURGÉS (#10151, LP3).
 *
 * `purgePackData` ne tourne qu'à l'expiration de la grâce : un compte purgé
 * AVANT que la purge des packs existe garde ses choix, sa bibliothèque, ses
 * propositions et leurs fichiers. Ce rattrapage retrouve ces comptes par leur
 * identité ANONYMISÉE (`anonymizeUserIdentity` n'est appelée qu'après la purge
 * isolée) — jamais un compte vivant, ni un compte encore dans sa grâce — et
 * leur applique la même purge, la même fonction, sans réécrire la règle.
 *
 * Le préfixe ne sert qu'à l'INDEX : « compte-supprime- » est un pseudo
 * recevable (16 caractères, lettres et tirets), qu'un compte vivant peut
 * porter. Seul le pseudo EXACT — préfixe + l'id du compte lui-même, 40
 * caractères qu'aucune validation n'accepte — prouve l'anonymisation.
 *
 * `dryRun` mesure par `measurePackData`, l'inventaire même de la purge : il
 * compte lignes et fichiers sans rien écrire. Idempotent : rejoué, il ne
 * trouve plus rien.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ANONYMIZED_USERNAME_PREFIX, anonymizedUsername } from '../AccountPurgeService';
import { measurePackData, purgePackData, type PackFileStore, type PackPrivacyDb, type PackPurgeSummary } from './PackPrivacy';

export type PackPurgeBackfillOptions = {
  readonly files: PackFileStore;
  readonly dryRun: boolean;
  readonly batchSize?: number;
  readonly onAccount?: (userId: string, summary: PackPurgeSummary) => void;
};

export type PackPurgeBackfillReport = {
  readonly accountsScanned: number;
  readonly accountsWithData: number;
  readonly totals: PackPurgeSummary;
};

const ZERO: PackPurgeSummary = { choicesDeleted: 0, libraryDeleted: 0, submissionsDeleted: 0, publishedAnonymized: 0, filesDeleted: 0, ownershipsDeleted: 0 };

const add = (a: PackPurgeSummary, b: PackPurgeSummary): PackPurgeSummary => ({
  choicesDeleted: a.choicesDeleted + b.choicesDeleted,
  libraryDeleted: a.libraryDeleted + b.libraryDeleted,
  submissionsDeleted: a.submissionsDeleted + b.submissionsDeleted,
  publishedAnonymized: a.publishedAnonymized + b.publishedAnonymized,
  filesDeleted: a.filesDeleted + b.filesDeleted,
  ownershipsDeleted: a.ownershipsDeleted + b.ownershipsDeleted,
});

const isEmpty = (summary: PackPurgeSummary): boolean => Object.values(summary).every((count) => count === 0);

export async function backfillPackPurge(
  prisma: PackPrivacyDb & Pick<PrismaClient, 'user'>,
  options: PackPurgeBackfillOptions,
): Promise<PackPurgeBackfillReport> {
  const take = options.batchSize ?? 200;
  const step = options.dryRun ? measurePackData : purgePackData;
  let cursor: string | null = null;
  let report: PackPurgeBackfillReport = { accountsScanned: 0, accountsWithData: 0, totals: ZERO };

  for (;;) {
    const accounts: readonly { id: string; username: string }[] = await prisma.user.findMany({
      where: { username: { startsWith: ANONYMIZED_USERNAME_PREFIX }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, username: true },
      orderBy: { id: 'asc' },
      take,
    });
    const anonymized = accounts.filter(({ id, username }) => username === anonymizedUsername(id));
    for (const { id } of anonymized) {
      const summary = await step(prisma, id, { files: options.files });
      options.onAccount?.(id, summary);
      report = {
        accountsScanned: report.accountsScanned + 1,
        accountsWithData: report.accountsWithData + (isEmpty(summary) ? 0 : 1),
        totals: add(report.totals, summary),
      };
    }
    if (accounts.length < take) return report;
    cursor = accounts[accounts.length - 1].id;
  }
}
