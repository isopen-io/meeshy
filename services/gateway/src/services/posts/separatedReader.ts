/**
 * Le lecteur d'une requête, avec ceux qu'un blocage sépare de lui (#16894),
 * lus par la même loi que le filtre de liste (`blockedIdsAroundViewer`). Module
 * à part : `postReferences` n'importe que la règle pure, jamais l'annuaire.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { blockedIdsAroundViewer } from '../ContactDirectoryService';
import type { WireReader } from './storyEffectsV3';

/**
 * Le lecteur d'une requête, avec ceux qu'un blocage sépare de lui. Sans compte,
 * personne. Une lecture qui échoue fait échouer la requête : on ne sert pas un
 * fil sans savoir ce qu'il doit taire.
 */
export async function readerSeparatedFrom(
  prisma: PrismaClient,
  viewerId: string | undefined,
  reader: WireReader | undefined,
): Promise<WireReader> {
  const separated = viewerId ? await blockedIdsAroundViewer(prisma, viewerId) : [];
  return { ...(reader ?? {}), separatedUserIds: new Set(separated) };
}
