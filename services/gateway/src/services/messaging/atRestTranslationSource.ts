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
import { contentDisappears } from './sealMessageAttachments';
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
 * il n'y a rien à traduire (texte vide, ligne qu'aucune clé n'ouvre, message
 * rappelé). La ligne fait foi, jamais le texte qu'un appelant affirme être le
 * sien.
 *
 * #16557 — tout chemin vers le traducteur passe ici, et les transports de
 * suppression gardent `content` : c'est le seul endroit où un rappel arrête
 * TOUTES les retraductions, quel que soit celui qui les a demandées.
 */
export async function translatableTextOf(
  row: AtRestReadableRow & { readonly deletedAt?: Date | null },
  keyring: AtRestKeyring,
): Promise<string | null> {
  if (row.deletedAt) return null;
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

/**
 * #13102 — le régime d'une tâche de traduction d'un message : protégée aussi
 * quand le message est destiné à disparaître (vue unique, flamme, éphémère),
 * comme sa tâche audio (`contentDisappears`).
 */
export const translationRequestRegime = (message: { readonly encryptionMode?: string | null; readonly [field: string]: unknown }): { readonly atRest?: true } =>
  isServerAtRestMode(message.encryptionMode) || contentDisappears(message) ? { atRest: true } : {};

/**
 * Le message que `translation:request` retraduit, son texte ouvert ; `content`
 * vide s'il reste scellé.
 *
 * #16552 — la garde de VIVACITÉ se relit CHEZ ELLE, pas chez l'appelant. Les
 * trois transports de suppression écrivent `{ translations: null, deletedAt }` :
 * ils effacent les copies traduites À DESSEIN et gardent `content`. Un message
 * rappelé passait donc la garde `!message.content` du handler, repartait au
 * traducteur, et sa traduction était RÉÉCRITE en base puis rediffusée à toute la
 * room et à la file hors ligne — le secret revenait sur le fil après qu'on a dit
 * à l'utilisateur qu'il était détruit.
 *
 * `deletedAt` non nul est la SEULE preuve d'un rappel (aucun chemin de la
 * passerelle ne supprime un message physiquement) : on refuse sur la PREUVE. Une
 * ligne absente reste traitée comme avant par l'appelant — `null` ici — ce qui ne
 * sert rien et ne divulgue pas l'existence du message.
 */
export async function loadTranslatableMessage(prisma: PrismaClient, messageId: string) {
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, content: true, originalLanguage: true, senderId: true, createdAt: true, deletedAt: true, ...AT_REST_MESSAGE_SELECT },
  });
  if (!row || row.deletedAt) return null;
  const source = await translationSourceOf(row, gatewayKeyring(prisma));
  const content = source.readable ? source.row.content : '';
  return {
    id: row.id,
    conversationId: row.conversationId,
    content,
    originalLanguage: row.originalLanguage,
    senderId: row.senderId,
    encryptionMode: row.encryptionMode,
    /** L'horloge que le plancher d'historique de l'appelant compare (#16552). */
    createdAt: row.createdAt,
  };
}
