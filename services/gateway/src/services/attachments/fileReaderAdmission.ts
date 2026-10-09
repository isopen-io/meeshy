/**
 * QUI peut lire un fichier protégé — un prédicat, deux côtés (#9600, #9646).
 *
 * La route qui SERT les octets (adresse signée, routes par identifiant :
 * `attachmentReadVerdict.ts`) et la remise temps réel qui DISTRIBUE les
 * adresses signées (`socketio/readerSignedDelivery.ts`) jugent le même
 * participant. Deux prédicats dériveraient : la remise signerait une adresse
 * que la route refuse, ou pire, la route servirait ce que la remise n'aurait
 * jamais dû adresser.
 *
 *  - **actif** (`isActive`) ;
 *  - **jamais banni** : `bannedAt` absent OU nul. Un bannissement écrit bien
 *    `isActive: false`, mais une restauration de compte rallume `isActive` sans
 *    regarder `bannedAt` (`routes/me/delete-account.ts`), et la colonne est
 *    ABSENTE du document de tout participant jamais banni (`utils/prisma-unset.ts`) ;
 *  - **entré par un lien non échu** : la porte de lecture du fil
 *    (`services/shareLinkReadGate.ts`) — seule la date ferme, un lien
 *    introuvable ne ferme rien ; une lecture de liens qui échoue ferme tous les
 *    invités dont un lien décidait.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { unsetOrNull } from '../../utils/prisma-unset';
import { logger } from '../../utils/logger';
import { shareLinkHasExpired } from '../shareLinkReadGate';

/** À répandre dans le `where` d'une lecture `Participant` — il porte une clé `OR`. */
export const ADMITTED_FILE_READER_WHERE = { isActive: true, ...unsetOrNull('bannedAt') } as const;

export async function withoutExpiredShareLinks<T extends { readonly shareLinkId?: string | null }>(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  participants: readonly T[],
  now: Date,
): Promise<readonly T[]> {
  const linkIds = [...new Set(participants.flatMap((p) => (p.shareLinkId ? [p.shareLinkId] : [])))];
  if (linkIds.length === 0) return participants;
  try {
    const links = await prisma.conversationShareLink.findMany({
      where: { id: { in: linkIds } },
      select: { id: true, expiresAt: true },
    });
    const expired = new Set(links.filter((link) => shareLinkHasExpired(link, now)).map((link) => link.id));
    return participants.filter((p) => !p.shareLinkId || !expired.has(p.shareLinkId));
  } catch (error) {
    logger.warn('[file-reader-admission] share link lookup failed — every link guest is closed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return participants.filter((p) => !p.shareLinkId);
  }
}
