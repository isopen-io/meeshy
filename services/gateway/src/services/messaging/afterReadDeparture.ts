import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isAfterReadEphemeral } from '@meeshy/shared/utils/ephemeral-countdown';
import { unsetOrNull } from '../../utils/prisma-unset';

export type AfterReadDeparturePrisma = Pick<PrismaClient, 'message' | 'messageStatusEntry'>;

export type AfterReadRegard = { readonly from: Date; readonly to: Date };

/** Lectures relues par passe, sur le préfixe `(conversationId, participantId)` de l'index des accusés. */
export const DEPARTURE_READ_PAGE = 500;
/** Au-delà, le reste attend la sortie déclarée par le client ou le plafond de rétention. */
export const DEPARTURE_READ_MAX_PAGES = 20;

const within = (at: Date, regards: readonly AfterReadRegard[]) =>
  regards.some(({ from, to }) => from.getTime() <= at.getTime() && at.getTime() <= to.getTime());

/**
 * Ce qu'un lecteur qui QUITTE a vu et doit voir disparaître (#18556) : les
 * flammes-œil d'un autre, encore servies dans la conversation, dont il porte un
 * `exactReadAt` posé PENDANT un de ses regards (`regards`, la conversation à
 * l'écran) et que rien n'a encore consommées.
 *
 * `exactReadAt`, jamais `readAt` : l'accusé HÉRITÉ grave `readAt` sur toute la
 * plage jusqu'à la frontière rapportée, messages survolés compris — il ne
 * prouve pas qu'une flamme a été vue. Seul l'accusé EXACT (la liste affichée)
 * pose `exactReadAt`. Un accusé posé hors de tout regard (bannière, widget,
 * autre conversation à l'écran) ne compte pas davantage.
 *
 * La lecture part des ACCUSÉS du lecteur dans ses regards, jamais des
 * messages de la conversation : son coût suit ce qui a été lu pendant la
 * visite, pas la taille du fil, et aucune flamme n'est écartée parce que
 * d'autres, plus récentes, occupaient une tranche.
 */
export async function readAfterReadIdsAtDeparture(
  prisma: AfterReadDeparturePrisma,
  params: {
    readonly conversationId: string;
    readonly participantId: string;
    readonly regards: readonly AfterReadRegard[];
    readonly now: Date;
  },
): Promise<string[]> {
  const { conversationId, participantId, regards, now } = params;
  if (regards.length === 0) return [];

  const flames: string[] = [];
  for (let page = 0; page < DEPARTURE_READ_MAX_PAGES; page += 1) {
    const entries = (await prisma.messageStatusEntry.findMany({
      where: {
        conversationId,
        participantId,
        AND: [
          { OR: regards.map(({ from, to }) => ({ exactReadAt: { gte: from, lte: to } })) },
          { OR: [...unsetOrNull('ephemeralExpiresAt').OR, { ephemeralExpiresAt: { gt: now } }] },
        ],
      },
      select: { messageId: true, exactReadAt: true },
      orderBy: [{ exactReadAt: 'asc' }, { id: 'asc' }],
      skip: page * DEPARTURE_READ_PAGE,
      take: DEPARTURE_READ_PAGE,
    })) as Array<{ messageId: string; exactReadAt: Date | null }>;

    // Le prédicat de base BORNE, le filet en processus DÉCIDE : sur le
    // connecteur MongoDB, une comparaison peut laisser passer l'absent ou le nul.
    const seen = entries
      .filter((entry) => entry.exactReadAt instanceof Date && within(entry.exactReadAt, regards))
      .map((entry) => entry.messageId);

    if (seen.length > 0) {
      const rows = (await prisma.message.findMany({
        where: {
          id: { in: seen },
          conversationId,
          senderId: { not: participantId },
          expiresAt: { gt: now },
          ...unsetOrNull('deletedAt'),
        },
        select: { id: true, effectFlags: true, expiresAt: true },
      })) as Array<{ id: string; effectFlags: number | null; expiresAt: Date | null }>;
      const servable = new Set(
        rows
          .filter(
            (row) =>
              isAfterReadEphemeral(row.effectFlags) &&
              row.expiresAt instanceof Date &&
              row.expiresAt.getTime() > now.getTime(),
          )
          .map((row) => row.id),
      );
      flames.push(...seen.filter((id) => servable.has(id)));
    }

    if (entries.length < DEPARTURE_READ_PAGE) break;
  }

  return [...new Set(flames)];
}
