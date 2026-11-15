import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { MESSAGE_LIVENESS_SELECT } from '../services/messages/message-liveness';
import { carriesMessageText } from './queuedEventContract';

/**
 * Ce que le drain doit savoir des MESSAGES que son lot nomme — lu UNE fois,
 * pour tous ses gates (#18615).
 *
 * Deux gardes du rejeu interrogent la même ligne `Message` : la VIVACITÉ
 * (`queuedMessageLiveness`, #16685 — ce message existe-t-il encore ?) et le
 * PLANCHER D'HISTOIRE (`drainHistoryFloor`, #18615 — ce message est-il au-dessus
 * du plancher de CE lecteur ?). La seconde n'a besoin que d'une colonne de plus
 * (`createdAt`) sur une requête que la première fait déjà, et le drain est le
 * chemin de la tempête de reconnexions : « avant de conclure qu'une garde
 * coûterait une requête, regarder ce que le site lit déjà. »
 *
 * ─── Une lecture PARTAGÉE n'impose pas une posture PARTAGÉE ──────────────────
 *
 * C'est la propriété qui rend ce module possible, et elle vaut d'être écrite :
 * cette unité ne décide RIEN de ce qu'il faut faire d'un échec. Elle rend
 * `'unreadable'` et laisse chaque consommateur arbitrer — et les deux
 * arbitrent à l'OPPOSÉ sur le MÊME échec :
 *
 * | garde | ce qui manque | verdict |
 * |---|---|---|
 * | vivacité | la preuve que le message est MORT | fail-OPEN — « un message manqué se rattrape » |
 * | plancher | la preuve que le message est LISIBLE | fail-CLOSED — un secret remis ne se rattrape pas |
 *
 * Les confondre dans un `catch` commun aurait imposé la posture du premier
 * écrit au second. C'est le fail-open qui aurait gagné, puisque la vivacité
 * existait d'abord — et la garde de confidentialité qu'on ajoute aurait été
 * désarmée par la lecture qu'on lui a fait partager.
 *
 * ─── Et un id non interrogeable n'est pas une entrée saine ───────────────────
 *
 * Les ids sont filtrés sur la forme ObjectId AVANT d'entrer dans la question,
 * pour la raison du cycle 112 : ils sont AGRÉGÉS en un unique `id: { in: [...] }`,
 * donc un id que la colonne ne peut pas porter ferait lever la requête pour
 * TOUT le lot. Une entrée dont l'id n'est pas interrogeable n'apparaît donc
 * pas dans `byId` — elle est SANS PREUVE, ce que chaque consommateur arbitre
 * de son côté, et non « saine ».
 */
export type QueuedMessageFactsRow = {
  readonly createdAt: Date | null;
  readonly deletedAt: Date | null;
  readonly expiresAt: Date | null;
};

export type QueuedMessageFacts =
  /** La lecture a abouti. Un id absent de `byId` n'a PAS de ligne, ou n'était pas interrogeable. */
  | { readonly kind: 'read'; readonly byId: ReadonlyMap<string, QueuedMessageFactsRow> }
  /** La lecture n'a rien prouvé — ni dans un sens, ni dans l'autre. */
  | { readonly kind: 'unreadable'; readonly error: unknown };

/** Aucune question à poser : le lot ne porte aucun texte, ou aucun id interrogeable. */
export const NO_QUEUED_MESSAGE_FACTS: QueuedMessageFacts = { kind: 'read', byId: new Map() };

/**
 * Les `messageId` que les deux gardes ont le droit d'interroger : ceux des
 * entrées porteuses de TEXTE, de forme ObjectId.
 *
 * Le cadrage est `TextBearingQueuedEvent` (#12822) et il n'est pas réénuméré :
 * les deux gardes s'y adossent déjà, et une seconde liste écrite ici
 * divergerait au premier `eventType` neuf.
 */
export function interrogableMessageIds(entries: readonly QueuedMessagePayload[]): readonly string[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!carriesMessageText(entry.eventType)) continue;
    if (!isValidObjectId(entry.messageId)) continue;
    ids.add(entry.messageId);
  }
  return [...ids];
}

export async function readQueuedMessageFacts(
  prisma: Pick<PrismaClient, 'message'>,
  entries: readonly QueuedMessagePayload[],
): Promise<QueuedMessageFacts> {
  const ids = interrogableMessageIds(entries);
  if (ids.length === 0) return NO_QUEUED_MESSAGE_FACTS;

  try {
    const rows = (await prisma.message.findMany({
      where: { id: { in: [...ids] } },
      // `createdAt` entre pour le plancher ; les trois autres colonnes étaient
      // déjà celles de la vivacité. La requête ne change pas de forme — elle
      // change de largeur d'une colonne, sur une ligne déjà lue.
      select: { id: true, createdAt: true, ...MESSAGE_LIVENESS_SELECT },
    })) as Array<{ id: string; createdAt?: Date | null; deletedAt?: Date | null; expiresAt?: Date | null }>;
    return {
      kind: 'read',
      byId: new Map(
        rows.map((row) => [
          row.id,
          { createdAt: row.createdAt ?? null, deletedAt: row.deletedAt ?? null, expiresAt: row.expiresAt ?? null },
        ]),
      ),
    };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}
