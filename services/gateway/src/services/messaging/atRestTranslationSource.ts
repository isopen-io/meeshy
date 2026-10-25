/**
 * #11381 — ce que la TRADUCTION À LA DEMANDE lit d'un message `server`/`hybrid`.
 *
 * La ligne en base porte `content: ''` et le chiffré à côté : les trois portes
 * de retraduction (`POST /translate-blocking`, `POST /translate`, l'événement
 * socket `translation:request`) lisaient `content` et envoyaient une chaîne
 * vide au translator, qui rangeait une traduction vide que le Prisme servait
 * ensuite à tous les lecteurs de cette langue. Elles lisent désormais le clair
 * par la passerelle, et une ligne qu'aucune clé n'ouvre est REFUSÉE — jamais
 * traduite vide.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getEncryptionService } from '../EncryptionService';
import {
  AT_REST_MESSAGE_SELECT,
  isSealedAtRest,
  isServerAtRestMode,
  lazyKeyring,
  revealAtRest,
  type AtRestKeyring,
  type AtRestReadableRow,
} from './serverAtRest';

export const SERVER_AT_REST_UNREADABLE_TRANSLATION_MESSAGE =
  'Ce message chiffré sur le serveur ne peut plus être lu : il ne peut pas être traduit';

export type TranslationSource<T> = { readonly readable: true; readonly row: T } | { readonly readable: false };

export const gatewayKeyring = (prisma: PrismaClient): AtRestKeyring => lazyKeyring(() => getEncryptionService(prisma));

/** La ligne telle que le translator doit la lire : en clair, ou refusée. */
export async function translationSourceOf<T extends AtRestReadableRow>(row: T, keyring: AtRestKeyring): Promise<TranslationSource<T>> {
  if (!isSealedAtRest(row)) return { readable: true, row };
  const opened = await revealAtRest(row, keyring);
  return opened.isEncrypted === true ? { readable: false } : { readable: true, row: opened };
}

/**
 * #12822 — le texte que le translator lit d'une ligne `Message` : son clair,
 * ouvert par la passerelle quand la ligne est scellée au repos ; `null` quand
 * il n'y a rien à traduire (texte vide, ligne qu'aucune clé n'ouvre). La ligne
 * fait foi, jamais le texte qu'un appelant affirme être le sien.
 */
export async function translatableTextOf(row: AtRestReadableRow, keyring: AtRestKeyring): Promise<string | null> {
  const source = await translationSourceOf(row, keyring);
  if (!source.readable) return null;
  const text = source.row.content;
  return typeof text === 'string' && text.trim().length > 0 ? text : null;
}

/**
 * #12822 — le drapeau de la requête ZMQ : un texte chiffré au repos ne se pose
 * ni dans le cache Redis du translator ni dans ses journaux. Absent sinon, pour
 * que la trame des autres messages reste celle d'avant.
 */
export const atRestRequestFlag = (encryptionMode: string | null | undefined): { readonly atRest?: true } =>
  isServerAtRestMode(encryptionMode) ? { atRest: true } : {};

/** Le message que `translation:request` retraduit, son texte ouvert ; `content` vide s'il reste scellé. */
export async function loadTranslatableMessage(prisma: PrismaClient, messageId: string) {
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, content: true, originalLanguage: true, senderId: true, ...AT_REST_MESSAGE_SELECT },
  });
  if (!row) return null;
  const source = await translationSourceOf(row, gatewayKeyring(prisma));
  const content = source.readable ? source.row.content : '';
  return {
    id: row.id,
    conversationId: row.conversationId,
    content,
    originalLanguage: row.originalLanguage,
    senderId: row.senderId,
    encryptionMode: row.encryptionMode,
  };
}
