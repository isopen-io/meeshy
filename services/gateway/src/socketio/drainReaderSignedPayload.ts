/**
 * LE DRAIN SIGNE LES ADRESSES DE PIÈCE POUR LE LECTEUR QU'IL SERT (#16655).
 *
 * ## Le défaut que ce module ferme
 *
 * Cinq sites bâtissent un plan signé par lecteur pour leur émission VIVANTE —
 * `emitAttachmentUpdated`, `broadcastMessageMutation` (`edited`), les deux
 * producteurs de `message:new` (socket et REST/ZMQ), et `link-message` par
 * dérivation — puis enfilent la charge **NUE** pour les absents. Au reconnect,
 * le rejeu écrase les URLs signées que le client détient par des adresses
 * mortes, et sa fusion fait de la morte la valeur EN CACHE.
 *
 * ## Pourquoi AU DRAIN, et pas à l'enfilage ni chez les émetteurs
 *
 * Une adresse signée vit 6–7 h (`READER_FILE_URL_LIFETIME_SECONDS` +
 * `READER_FILE_URL_STEP_SECONDS`) ; une entrée de file vit 48 h
 * (`DELIVERY_QUEUE_TTL_SECONDS`). Signer à l'enfilage échangerait un 404 contre
 * un autre. Le drain, lui, connaît le lecteur AU MOMENT où il émet.
 *
 * Et une seule fois ici, clavée par `eventType`, plutôt que chez cinq
 * producteurs : celui qui oublierait n'aurait, par construction, aucun témoin —
 * c'est la doctrine que `resolvePayloadForReader` écrit déjà pour la file.
 *
 * **Omettre les URLs de la charge enfilée n'était pas une option** : les trois
 * clients ont trois règles de fusion DIFFÉRENTES (le web écrase par
 * `{...cached, ...incoming}`, iOS préserve `fileUrl` et jette les entrées de
 * carte sans url, Android laisse gagner l'entrante même sans url selon son
 * horloge). Une omission est donc différemment dangereuse par client —
 * destructrice sur le web, inerte sur iOS. Il n'existe pas de contrat unique
 * d'omission qui soit sûr ; il existe un contrat unique de SIGNATURE.
 *
 * ## Fail-closed contre fail-open, et l'argument qui inverse l'intuition
 *
 * `RedisDeliveryQueue.restoreForRetry` est PRIVÉE : le manager ne peut pas
 * remettre une entrée en file. « Fail closed » ne peut donc signifier
 * qu'ABANDONNER, jamais réessayer — et c'est pourtant le bon choix :
 *
 * > Une entrée ABANDONNÉE laisse le cache du client INTACT et nomme sa
 * > conversation pour relecture (`pending-messages:delivered.conversationIds`
 * > est bâti depuis `[...delivered, ...undelivered]`, donc une entrée perdue
 * > nomme quand même la sienne). Une entrée NUE écrase une adresse qui
 * > marchait par une morte, et fait de la morte la valeur en cache.
 * > **Abandonner est strictement moins destructeur qu'émettre nu**, ce qui
 * > inverse la lecture naïve « le drain est destructif, donc fail open ».
 *
 * Un `signer` absent est l'exception, et elle est fail-OPEN : dans cette
 * configuration RIEN n'est signé nulle part, la route sert encore les adresses
 * nues, et refuser blanchirait tout rejeu de média.
 *
 * ## Le coût, mesuré
 *
 * Trois étages, et seul le dernier touche la base :
 * 1. un filtre à coût NUL sur la charge (`carriesSignableAddress`) — il sort
 *    les textes, réactions, épingles, suppressions sans une requête ;
 * 2. UNE lecture de protection groupée par `messageId`, et seulement s'il
 *    reste une porteuse ;
 * 3. la signature, HMAC pur.
 *
 * Plus la lecture des liens de partage, que `withoutExpiredShareLinks` saute
 * entièrement quand aucune ligne ne porte de `shareLinkId` — donc zéro requête
 * pour tout lecteur inscrit. Total : **+2 requêtes AU PLUS pour un drain de
 * 500 entrées**, indépendamment du nombre d'entrées. Une requête par entrée
 * serait un amplificateur de tempête de reconnexions.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { withoutExpiredShareLinks } from '../services/attachments/fileReaderAdmission';
import { MESSAGE_PROTECTION_COLUMNS } from './readerSignedDelivery';
import {
  isSignableStorageKey,
  signReaderAttachmentUrls,
  type ReaderBoundMessage,
  type SignableAttachment,
} from '../services/attachments/signedAttachmentUrls';
import { storageKeyFromMediaUrl } from '../services/attachments/mediaStorageKey';
import { readerFileUrlSignerFromEnv, type ReaderFileUrlSigner } from '../services/attachments/readerFileSignature';
import type { QueuedEventType } from './queuedEventContract';
import { logger } from '../utils/logger';

/**
 * OÙ la charge d'une famille porte ses pièces. `'none'` n'est pas un trou :
 * c'est une DÉCISION, et le témoin de table interdit qu'un `eventType` neuf
 * entre sans la prendre.
 */
export type AttachmentSlot = 'attachment' | 'attachments' | 'message.attachments' | 'none';

export const ATTACHMENT_SLOT = {
  new: 'attachments',
  edited: 'attachments',
  deleted: 'none',
  expired: 'none',
  'reaction-added': 'none',
  'reaction-removed': 'none',
  'attachment-reaction-added': 'none',
  'attachment-reaction-removed': 'none',
  'attachment-updated': 'attachment',
  translation: 'none',
  pinned: 'none',
  unpinned: 'none',
  // L'enveloppe de lien porte le message ENTIER sous `message` ; c'est la même
  // référence d'objet que `_drainedEmissions` rend en seconde émission, donc
  // signer l'entrée une fois couvre les deux de façon cohérente.
  'link-message': 'message.attachments',
} as const satisfies Record<QueuedEventType, AttachmentSlot>;

export const attachmentSlotOf = (eventType: QueuedMessageLike['eventType']): AttachmentSlot =>
  ATTACHMENT_SLOT[(eventType ?? 'new') as QueuedEventType] ?? 'none';

/** La forme minimale d'une entrée de file dont ce module ait besoin. */
export type QueuedMessageLike = {
  readonly eventType?: QueuedEventType | undefined;
  readonly messageId?: string | undefined;
  readonly conversationId?: string | undefined;
  readonly payload?: unknown;
};

export type DrainSignRefusal =
  | 'reader-participant-unresolved'
  | 'attachment-protection-unresolved'
  | 'file-reader-not-admitted'
  | 'signing-failed';

export type DrainSignedPayload =
  | { readonly kind: 'as-is' }
  | { readonly kind: 'signed'; readonly payload: Record<string, unknown> }
  | { readonly kind: 'refuse'; readonly reason: DrainSignRefusal };

/** Une ligne `Participant` du lecteur, telle que le drain la lit déjà. */
export type DrainReaderRow = {
  readonly conversationId: string;
  readonly bannedAt: Date | null;
  readonly id: string;
  readonly shareLinkId: string | null;
};

export type DrainSigningContext = {
  readonly signer: ReaderFileUrlSigner | null;
  /** `'unavailable'` = la lecture d'appartenance n'a rien PROUVÉ. */
  readonly readerByConversation: ReadonlyMap<string, string> | 'unavailable';
  /** `'unavailable'` = la lecture de protection a levé. */
  readonly protectionByMessageId: ReadonlyMap<string, ReaderBoundMessage> | 'unavailable';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const signableUrl = (value: unknown): boolean => {
  if (typeof value !== 'string' || value === '') return false;
  const key = storageKeyFromMediaUrl(value);
  return key !== null && isSignableStorageKey(key);
};

const pieceCarriesSignable = (piece: unknown): boolean => {
  if (!isRecord(piece)) return false;
  if (signableUrl(piece.fileUrl) || signableUrl(piece.thumbnailUrl)) return true;
  for (const list of [piece.imageVariants, piece.avifVariants, piece.renditions]) {
    if (Array.isArray(list) && list.some((entry) => isRecord(entry) && signableUrl(entry.url))) return true;
  }
  const translations = piece.translations;
  if (isRecord(translations)) {
    return Object.values(translations).some((entry) => isRecord(entry) && signableUrl(entry.url));
  }
  return false;
};

/** Les pièces que la charge d'une entrée porte, selon sa famille. */
const piecesOf = (entry: QueuedMessageLike): readonly unknown[] => {
  const payload = entry.payload;
  if (!isRecord(payload)) return [];
  switch (attachmentSlotOf(entry.eventType)) {
    case 'attachment':
      return [payload.attachment];
    case 'attachments':
      return Array.isArray(payload.attachments) ? payload.attachments : [];
    case 'message.attachments': {
      const message = payload.message;
      return isRecord(message) && Array.isArray(message.attachments) ? message.attachments : [];
    }
    case 'none':
      return [];
  }
};

/**
 * LE FILTRE À COÛT NUL — lu sur la CHARGE, sans une requête.
 *
 * Il se trompe du côté PERMISSIF par construction : il ne dit pas qu'une pièce
 * est protégée, seulement qu'elle porte une adresse que la signature saurait
 * réécrire. C'est assez pour éviter toute lecture de base sur les familles qui
 * ne portent aucun média, et c'est le seul étage qui s'exécute pour elles.
 */
export const carriesSignableAddress = (entry: QueuedMessageLike): boolean =>
  piecesOf(entry).some(pieceCarriesSignable);

/**
 * Les DEUX lectures groupées du drain, faites une fois pour tout le lot.
 *
 * `readerRows` vient de la lecture d'appartenance que le drain fait DÉJÀ pour
 * son gate d'autorisation : ce module n'en ouvre pas une seconde, il en reçoit
 * le résultat (ou `'unavailable'` quand elle n'a rien prouvé).
 */
export async function prepareDrainSigning(params: {
  readonly prisma: Pick<PrismaClient, 'message' | 'conversationShareLink'>;
  readonly now: Date;
  readonly readerRows: readonly DrainReaderRow[] | 'unavailable';
  readonly entries: readonly QueuedMessageLike[];
}): Promise<DrainSigningContext> {
  const { prisma, now, readerRows, entries } = params;
  const carriers = entries.filter(carriesSignableAddress);
  const signer = readerFileUrlSignerFromEnv(now);

  // Rien de signable dans tout le lot : aucune lecture, aucune carte. C'est le
  // cas nominal d'un drain de messages texte.
  if (carriers.length === 0) {
    return { signer, readerByConversation: new Map(), protectionByMessageId: new Map() };
  }

  const readerByConversation: ReadonlyMap<string, string> | 'unavailable' =
    readerRows === 'unavailable'
      ? 'unavailable'
      : new Map(
          (await withoutExpiredShareLinks(prisma, readerRows.filter((row) => row.bannedAt == null), now)).map((row) => [
            row.conversationId,
            row.id,
          ])
        );

  const messageIds = [...new Set(carriers.flatMap((entry) => (entry.messageId ? [entry.messageId] : [])))];
  let protectionByMessageId: ReadonlyMap<string, ReaderBoundMessage> | 'unavailable';
  try {
    const protections = messageIds.length === 0
      ? []
      : await prisma.message.findMany({ where: { id: { in: messageIds } }, select: { id: true, ...MESSAGE_PROTECTION_COLUMNS } });
    protectionByMessageId = new Map(protections.map((row) => [row.id, row as ReaderBoundMessage]));
  } catch (error) {
    // Fail-CLOSED : une protection non résolue ne se devine pas, et l'adresse
    // nue d'une pièce peut-être protégée ne doit pas sortir — c'est le même
    // arbitrage que `readerSignedPlanBestEffort`, qui refuse pour cette raison
    // de retomber sur la diffusion de room.
    logger.warn('[drain-signing] protection read failed — media-bearing entries will be refused', {
      messageIds: messageIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
    protectionByMessageId = 'unavailable';
  }

  return { signer, readerByConversation, protectionByMessageId };
}

const signedPieces = (
  entry: QueuedMessageLike,
  participantId: string,
  message: ReaderBoundMessage,
  signer: ReaderFileUrlSigner
): Record<string, unknown> | null => {
  const payload = entry.payload;
  if (!isRecord(payload)) return null;
  const context = { message, readerParticipantId: participantId, signer };
  const sign = (piece: unknown): unknown =>
    isRecord(piece) ? signReaderAttachmentUrls(piece as SignableAttachment, context) : piece;

  switch (attachmentSlotOf(entry.eventType)) {
    case 'attachment':
      return { ...payload, attachment: sign(payload.attachment) };
    case 'attachments':
      return { ...payload, attachments: (payload.attachments as readonly unknown[]).map(sign) };
    case 'message.attachments': {
      const inner = payload.message as Record<string, unknown>;
      return { ...payload, message: { ...inner, attachments: (inner.attachments as readonly unknown[]).map(sign) } };
    }
    case 'none':
      return null;
  }
};

/**
 * La charge d'UNE entrée, signée pour le lecteur que le drain sert — ou le
 * refus qui la nomme.
 *
 * **Ne lève jamais.** Le drain l'appelle dans une boucle dont tout l'objet est
 * l'isolation par entrée : une levée ici emporterait les entrées SUIVANTES,
 * plus l'annonce de fin de rejeu, plus tous les accusés de réception.
 */
export function signedQueuedPayloadForReader(
  entry: QueuedMessageLike,
  context: DrainSigningContext
): DrainSignedPayload {
  try {
    if (!carriesSignableAddress(entry)) return { kind: 'as-is' };
    // Fail-OPEN, et c'est la seule exception : sans clé, RIEN n'est signé dans
    // cette configuration, la route sert encore les adresses nues, et refuser
    // blanchirait tout rejeu de média.
    if (!context.signer) return { kind: 'as-is' };

    if (context.readerByConversation === 'unavailable') return { kind: 'refuse', reason: 'reader-participant-unresolved' };
    if (context.protectionByMessageId === 'unavailable') return { kind: 'refuse', reason: 'attachment-protection-unresolved' };

    const conversationId = entry.conversationId;
    const participantId = conversationId === undefined ? undefined : context.readerByConversation.get(conversationId);
    // Le lecteur que le PLAN n'admettrait pas — un invité dont le lien a
    // expiré, que le gate d'appartenance du drain ne couvre pas. La route
    // refuserait son adresse signée et rend 404 sur la nue : une adresse que
    // personne ne peut utiliser ne vaut pas d'empoisonner un cache.
    if (participantId === undefined) return { kind: 'refuse', reason: 'file-reader-not-admitted' };

    // Une ligne ABSENTE rend `{}`, que la loi de sortie lit comme une preuve
    // manquante et ferme : on signe. L'absence ne prouve pas l'ordinaire.
    const message = (entry.messageId === undefined ? undefined : context.protectionByMessageId.get(entry.messageId)) ?? {};
    const payload = signedPieces(entry, participantId, message, context.signer);
    return payload === null ? { kind: 'as-is' } : { kind: 'signed', payload };
  } catch (error) {
    logger.warn('[drain-signing] signing failed for a queued entry', {
      eventType: entry.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: 'refuse', reason: 'signing-failed' };
  }
}
