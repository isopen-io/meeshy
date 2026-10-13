import {
  CONTENT_EVENT_COLLECTION,
  CONTENT_EVENT_RECEIPT_RETENTION_MS,
  ejsonDate,
  eventKeyOf,
  insertDocuments,
  utcDayOf,
  type RawCommandPrisma,
} from './contentEvents';

/**
 * Les REJEUX des types de comptage (#10500) — un `eventId` déjà vu ne compte
 * rien de plus.
 *
 * Une vue ou une ouverture n'écrivent pas de ligne qui porterait leur
 * identifiant : leur déduplication passe par un REÇU dans `ContentEvent`
 * (`action = receipt`), sans acteur, sans contexte, conservé quatre jours —
 * la fenêtre d'acceptation (72 h) et un jour de marge. Le reçu s'écrit AVANT
 * l'effet : un reçu en doublon (E11000) est un rejeu, et son effet ne part
 * pas. Un même identifiant deux fois dans un lot : le second est un rejeu.
 *
 * L'impression d'un compte n'en a pas besoin : sa ligne `PostImpression`
 * porte elle-même la clé (`eventKey`, index unique partiel).
 */

export type ReceiptCandidate<T> = {
  readonly item: T;
  readonly eventId: string;
  readonly type: string;
  readonly postId: string;
  readonly derivedAt: Date;
};

/** Écrit les reçus en UNE commande ; rend les éléments qui sont des REJEUX. */
export async function claimCountingReceipts<T>(
  prisma: RawCommandPrisma,
  candidates: readonly ReceiptCandidate<T>[],
  receivedAt: Date,
): Promise<ReadonlySet<T>> {
  if (candidates.length === 0) return new Set();
  const documents = candidates.map((candidate) => ({
    eventKey: eventKeyOf(candidate.eventId),
    type: candidate.type,
    action: 'receipt',
    day: utcDayOf(candidate.derivedAt),
    derivedAt: ejsonDate(candidate.derivedAt),
    receivedAt: ejsonDate(receivedAt),
    actorKind: 'none',
    targetKind: 'post',
    targetId: candidate.postId,
    sampleRate: 1,
    expiresAt: ejsonDate(new Date(receivedAt.getTime() + CONTENT_EVENT_RECEIPT_RETENTION_MS)),
  }));
  const { duplicates } = await insertDocuments(prisma, CONTENT_EVENT_COLLECTION, documents);
  return new Set([...duplicates].map((index) => candidates[index].item));
}
