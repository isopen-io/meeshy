import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import {
  MESSAGE_LIVENESS_SELECT,
  messageLivenessOf,
  type MessageDeathCause,
} from '../services/messages/message-liveness';
import { carriesMessageText } from './queuedEventContract';

/**
 * La QUATRIÈME garde de la frontière de désérialisation du rejeu — et la seule
 * qui n'interroge pas l'ENTRÉE mais le MONDE (#16685).
 *
 * Les trois premières se prononcent sur ce que l'entrée DIT : `drainedEventName`
 * sur son nom, `isDeliverableQueuedPayload` sur la forme de sa charge,
 * `isAddressableConversationId` sur l'id qu'elle met en commun. Toutes les
 * trois peuvent répondre en lisant l'entrée seule. Celle-ci ne peut pas : une
 * charge parfaitement bien formée, nommée, adressable et AUTORISÉE peut porter
 * le texte d'un message que le serveur a détruit entre-temps.
 *
 * `enqueueForOfflineParticipants` écrit `payload: body` VERBATIM, et le drain
 * ne rejouait qu'un gate d'APPARTENANCE. Un message éphémère brûlé — `_burn`
 * pose `content: ''`, `encryptedContent: null`, `translations: null`,
 * `deletedAt`, et supprime les fichiers — laissait une copie LISIBLE de son
 * texte dans `delivery_queue:<userId>` (Redis, AOF) pour le reste des 48 h de
 * TTL. L'invariant que `_burn` revendique dans son propre commentaire — « le
 * contenu est détruit » — ne tenait pas.
 *
 * ## Ce que cette garde ne fait PAS, et c'est la moitié difficile
 *
 * Elle ne s'applique qu'aux familles que `carriesMessageText` déclare. Posée
 * sur toutes les entrées, elle serait un défaut PIRE que celui qu'elle
 * corrige : `'deleted'` et `'expired'` ont pour UNIQUE objet d'annoncer la mort
 * du message, et les refuser parce que le message est mort laisserait le client
 * afficher un message détruit pour toujours.
 *
 * ## Et ce qu'elle emprunte au cycle 112
 *
 * La lecture AGRÈGE les `messageId` du lot en un unique `id: { in: [...] }`,
 * donc elle a exactement la propriété qui n'a pas de correctif local : un id
 * que la colonne ne peut pas porter ferait lever la requête pour TOUT le lot,
 * et le fail-open transformerait une entrée corrompue en désactivation de la
 * garde pour les autres — c'est-à-dire en fuite du secret qu'on vient de
 * fermer. Les ids sont donc filtrés sur la forme ObjectId AVANT d'entrer dans
 * la question, et une entrée non interrogeable rend `unknown` : elle passe,
 * faute de preuve.
 */

export type QueuedLivenessRefusal = {
  readonly entry: QueuedMessagePayload;
  readonly cause: MessageDeathCause;
};

export type QueuedLivenessOutcome = {
  readonly kept: QueuedMessagePayload[];
  readonly refused: QueuedLivenessRefusal[];
};

/**
 * Retire du lot les entrées dont le message est PROUVÉ mort.
 *
 * Fail-OPEN sur tout le reste — ligne absente, id non interrogeable, lecture en
 * échec : « un message manqué se rattrape, un secret remis non » vaut dans les
 * deux sens, et c'est le second qui décide ici.
 */
export async function dropQueuedEntriesWhoseMessageDied(params: {
  readonly prisma: Pick<PrismaClient, 'message'>;
  readonly entries: QueuedMessagePayload[];
  readonly onReadFailure?: (error: unknown) => void;
}): Promise<QueuedLivenessOutcome> {
  const { prisma, entries } = params;

  // Les entrées à INTERROGER : celles qui portent du texte ET dont l'id est
  // interrogeable. Les autres ne sont pas « saines » — elles sont sans preuve,
  // ce qui n'est pas la même chose et se traite pareil.
  const interrogable = new Set<string>();
  for (const entry of entries) {
    if (!carriesMessageText(entry.eventType)) continue;
    if (!isValidObjectId(entry.messageId)) continue;
    interrogable.add(entry.messageId);
  }
  if (interrogable.size === 0) return { kept: entries, refused: [] };

  let rows: Array<{ id: string; deletedAt: Date | null; expiresAt: Date | null }>;
  try {
    rows = (await prisma.message.findMany({
      where: { id: { in: [...interrogable] } },
      select: { id: true, ...MESSAGE_LIVENESS_SELECT },
    })) as typeof rows;
  } catch (error) {
    // Même arbitrage que le `catch` du gate d'appartenance, et pour la même
    // raison écrite là-bas : « une absence de réponse n'autorise rien à
    // conclure ». Une tempête de reconnexions est exactement le moment où la
    // base est sous pression, et le drain est DESTRUCTIF.
    params.onReadFailure?.(error);
    return { kept: entries, refused: [] };
  }

  // UN instant pour tout le lot : deux entrées de la même rafale ne doivent pas
  // tomber de part et d'autre d'une échéance.
  const now = new Date();
  const dead = new Map<string, MessageDeathCause>();
  for (const row of rows) {
    const verdict = messageLivenessOf(row, now);
    if (verdict.liveness === 'gone') dead.set(row.id, verdict.cause);
  }
  if (dead.size === 0) return { kept: entries, refused: [] };

  const kept: QueuedMessagePayload[] = [];
  const refused: QueuedLivenessRefusal[] = [];
  for (const entry of entries) {
    const cause = carriesMessageText(entry.eventType) ? dead.get(entry.messageId) : undefined;
    if (cause) refused.push({ entry, cause });
    else kept.push(entry);
  }
  return { kept, refused };
}
