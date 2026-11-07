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
 *  - **jamais banni** : `bannedAt` absent OU nul. Une ligne peut être active
 *    ET bannie (bannie pendant qu'elle était inactive, puis rallumée par
 *    `restore-for-me` avant #10436 — voir `PARTICIPATION_VIVANTE`), et la
 *    colonne est ABSENTE du document de tout participant jamais banni
 *    (`utils/prisma-unset.ts`) ;
 *  - **entré par un lien non échu** : la porte de lecture du fil
 *    (`services/shareLinkReadGate.ts`) — seule la date ferme, un lien
 *    introuvable ne ferme rien ; une lecture de liens qui échoue ferme tous les
 *    invités dont un lien décidait.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { logger } from '../../utils/logger';
import { shareLinkHasExpired } from '../shareLinkReadGate';

/**
 * L'admission d'un lecteur de fichier EST l'appartenance vivante — et c'est
 * désormais la MÊME constante, pas une seconde expression de la règle (#16690).
 *
 * Les deux valeurs étaient écrites séparément et byte pour byte identiques
 * (`{ isActive: true, ...unsetOrNull('bannedAt') }`). Deux définitions d'une
 * seule règle divergent au premier cycle qui en touche une : c'est la « jumelle »
 * du § `services/gateway/CLAUDE.md`, ici sous un nom qui la rendait invisible —
 * on ne cherche pas `PARTICIPATION_VIVANTE` en lisant `fileReaderAdmission`.
 *
 * Le NOM survit parce qu'il dit l'USAGE (quelle porte, pour quel contenu), et le
 * cliquet des audiences (`conversation-audience-living-participation`) ne
 * l'accepte comme épellation de la loi que parce que le témoin voisin prouve
 * cette identité.
 */
export const ADMITTED_FILE_READER_WHERE = PARTICIPATION_VIVANTE;

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
