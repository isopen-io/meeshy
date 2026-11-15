import {
  CONTENT_EVENT_COLLECTION,
  CONTENT_EVENT_RECEIPT_RETENTION_MS,
  ejsonDate,
  eventKeyOf,
  insertDocuments,
  utcDayOf,
  type RawCommandPrisma,
} from './contentEvents';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { errorIdentity } from '../../utils/error-identity';

/**
 * Les REJEUX des types de comptage (#10500) — un `eventId` déjà vu ne compte
 * rien de plus.
 *
 * Une vue ou une ouverture n'écrivent pas de ligne qui porterait leur
 * identifiant : leur déduplication passe par un REÇU dans `ContentEvent`
 * (`action = receipt`), sans acteur, sans cible, sans contexte, conservé
 * trente jours. Le reçu s'écrit AVANT l'effet : un reçu en doublon (E11000)
 * est un rejeu, et son effet ne part pas ; si l'effet échoue, le reçu est
 * RENDU (`releaseCountingReceipts`) pour que le renvoi compte. Un même identifiant deux fois dans un lot : le second est un rejeu.
 *
 * L'impression d'un compte n'en a pas besoin : sa ligne `PostImpression`
 * porte elle-même la clé (`eventKey`, index unique partiel).
 */

export type ReceiptCandidate<T> = {
  readonly item: T;
  readonly eventId: string;
  readonly type: string;
};

export type CountingReceipts<T> = {
  /** Les éléments dont l'identifiant a déjà été reçu : ils ne recomptent rien. */
  readonly replays: ReadonlySet<T>;
  /** Les reçus écrits par CET appel, par élément — à rendre pour ceux dont l'effet n'est pas parti. */
  readonly claimed: ReadonlyMap<T, string>;
};

/**
 * Écrit les reçus en UNE commande ; rend les REJEUX et les clés prises.
 *
 * Un reçu ne dit RIEN du contenu ni de la personne (#10553) : une clé HMAC, le
 * type, le jour de réception, une échéance. Il s'écrit donc aussi pour un
 * compte qui refuse l'analyse — c'est de la déduplication, pas du comportement.
 *
 * Si l'écriture des reçus échoue (autre chose qu'un doublon), on COMPTE quand
 * même : mieux vaut un rejeu compté deux fois qu'une vue perdue.
 */
export async function claimCountingReceipts<T>(
  prisma: RawCommandPrisma,
  candidates: readonly ReceiptCandidate<T>[],
  receivedAt: Date,
): Promise<CountingReceipts<T>> {
  if (candidates.length === 0) return { replays: new Set(), claimed: new Map() };
  const keys = candidates.map((candidate) => eventKeyOf(candidate.eventId));
  const documents = candidates.map((candidate, index) => ({
    eventKey: keys[index],
    type: candidate.type,
    action: 'receipt',
    day: utcDayOf(receivedAt),
    derivedAt: ejsonDate(receivedAt),
    receivedAt: ejsonDate(receivedAt),
    actorKind: 'none',
    sampleRate: 1,
    expiresAt: ejsonDate(new Date(receivedAt.getTime() + CONTENT_EVENT_RECEIPT_RETENTION_MS)),
  }));
  try {
    const { inserted, duplicates } = await insertDocuments(prisma, CONTENT_EVENT_COLLECTION, documents);
    return {
      replays: new Set([...duplicates].map((index) => candidates[index].item)),
      claimed: new Map([...inserted].map((index) => [candidates[index].item, keys[index]] as const)),
    };
  } catch (error) {
    enhancedLogger.warn('[countingReplays] reçus non écrits — le lot est compté sans déduplication', { error: errorIdentity(error) });
    return { replays: new Set(), claimed: new Map() };
  }
}

/** Rend les reçus pris quand l'effet a échoué : le renvoi du client comptera. */
export async function releaseCountingReceipts(prisma: RawCommandPrisma, claimed: readonly string[]): Promise<void> {
  if (claimed.length === 0) return;
  await prisma.$runCommandRaw({
    delete: CONTENT_EVENT_COLLECTION,
    deletes: [{ q: { eventKey: { $in: [...claimed] }, action: 'receipt' }, limit: 0 }],
  }).catch((error: unknown) =>
    enhancedLogger.warn('[countingReplays] reçus non rendus après un échec de comptage', { error: errorIdentity(error) }));
}
