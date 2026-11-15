import { promises as fs } from 'fs';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { eraseMirroredCopy } from '../storage/objects/mirroredErasure';
import { conventionalDerivedPaths, derivedFileCandidates, resolveInsideUploadRoot } from './derivedAttachmentFiles';

/**
 * L'effacement des octets AVANT la ligne (#11269, audit adversarial F1).
 *
 * `deleteAttachment` supprime la ligne puis les fichiers, et un `unlink` en
 * échec (EBUSY, EACCES) y est journalisé, jamais levé. Pour un contenu qui
 * DOIT disparaître — une vue unique lue par tous —, c'était perdre la seule
 * chose qui désignait le fichier : la purge relisait zéro ligne, se déclarait
 * finie, et le fichier survivant ressortait par la route par chemin comme
 * « pas une pièce jointe », sans jeton.
 *
 * Ici, la LIGNE garde la clé : on efface d'abord les fichiers que plus aucune
 * AUTRE ligne ne cite (disque et copie du seau), on vérifie leur absence, et
 * l'appelant ne supprime la ligne que si rien n'a survécu. Une ligne restée
 * sous un message purgé n'est servie par aucune route (`viewOnceBurnedAt`), et
 * le balayage la reprend à la passe suivante.
 */

export type ErasableAttachment = {
  readonly id: string;
  readonly filePath: string;
  readonly thumbnailPath: string | null;
  readonly translations?: unknown;
  readonly imageVariants?: unknown;
  readonly avifVariants?: unknown;
  readonly renditions?: unknown;
};

export class AttachmentBytesSurvivedError extends Error {
  constructor(readonly survivors: readonly string[]) {
    super(`attachment bytes survived their erasure: ${survivors.length}`);
    this.name = 'AttachmentBytesSurvivedError';
  }
}

type ErasureClient = Pick<PrismaClient, 'messageAttachment'>;

/**
 * Les clés que CETTE ligne est seule à citer. Une lecture qui échoue lève :
 * l'appelant garde alors la ligne, et la passe suivante reprendra.
 */
async function keysOnlyThisRowCites(prisma: ErasureClient, attachment: ErasableAttachment): Promise<{
  readonly direct: readonly string[];
  readonly conventional: readonly string[];
}> {
  const others = { id: { not: attachment.id } };
  const fileShared = (await prisma.messageAttachment.count({ where: { filePath: attachment.filePath, ...others } })) > 0;
  const thumbShared = attachment.thumbnailPath
    ? (await prisma.messageAttachment.count({ where: { thumbnailPath: attachment.thumbnailPath, ...others } })) > 0
    : true;
  const siblings = await prisma.messageAttachment.findMany({
    where: { filePath: attachment.filePath, ...others },
    select: { filePath: true, thumbnailPath: true, translations: true, imageVariants: true, avifVariants: true, renditions: true },
  });
  const citedBySiblings = new Set(
    siblings.flatMap((row) => [row.filePath, row.thumbnailPath, ...derivedFileCandidates(row)]).filter((key): key is string => typeof key === 'string'),
  );
  const direct = [
    ...(fileShared ? [] : [attachment.filePath]),
    ...(thumbShared || !attachment.thumbnailPath ? [] : [attachment.thumbnailPath]),
    ...derivedFileCandidates(attachment).filter((key) => !citedBySiblings.has(key)),
  ];
  return { direct, conventional: fileShared ? [] : conventionalDerivedPaths(attachment.filePath) };
}

async function present(fullPath: string): Promise<boolean> {
  return fs.stat(fullPath).then(() => true, () => false);
}

/** Efface un fichier (disque puis seau) et rend `true` s'il en reste quelque chose. */
async function survivesErasure(fullPath: string, uploadRoot: string): Promise<boolean> {
  await fs.unlink(fullPath).catch(() => undefined);
  const mirrorGone = await eraseMirroredCopy(fullPath, uploadRoot);
  return !mirrorGone || (await present(fullPath));
}

/**
 * Efface les octets que cette ligne est seule à citer, puis rend les clés qui
 * ont SURVÉCU (disque ou seau). Vide ⇒ la ligne peut partir.
 */
export async function eraseBytesOnlyThisRowCites(
  prisma: ErasureClient,
  uploadRoot: string,
  attachment: ErasableAttachment,
): Promise<readonly string[]> {
  const { direct, conventional } = await keysOnlyThisRowCites(prisma, attachment);
  const resolve = (keys: readonly string[]) =>
    keys.map((key) => resolveInsideUploadRoot(uploadRoot, key)).filter((fullPath): fullPath is string => fullPath !== null);
  // Les chemins conventionnels n'existent le plus souvent pas (une image n'a
  // pas de rendu H.264) : seuls les PRÉSENTS sont des octets à effacer.
  const conventionalPresent = (
    await Promise.all(resolve(conventional).map(async (fullPath) => ((await present(fullPath)) ? fullPath : null)))
  ).filter((fullPath): fullPath is string => fullPath !== null);
  const targets = [...new Set([...resolve(direct), ...conventionalPresent])];
  const verdicts = await Promise.all(targets.map(async (fullPath) => ({ fullPath, survived: await survivesErasure(fullPath, uploadRoot) })));
  return verdicts.filter(({ survived }) => survived).map(({ fullPath }) => fullPath);
}
