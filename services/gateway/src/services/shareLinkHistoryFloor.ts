/**
 * Le plancher d'historique qu'un lien de partage impose à qui entre par lui.
 *
 * Un `ConversationShareLink` porte `allowViewHistory`. Quand il est faux, celui
 * qui rejoint par ce lien n'a droit qu'à ce qui a été écrit APRÈS son arrivée :
 * `GET /conversations/:id/messages` applique la règle depuis toujours, sous la
 * forme `historyStartDate = participant.joinedAt` puis `createdAt >= historyStartDate`
 * (`routes/conversations/messages.ts`).
 *
 * Ce module en est la forme ENSEMBLISTE, pour les lecteurs qui servent
 * plusieurs conversations d'un coup — `/sync` aujourd'hui. Trois propriétés que
 * les appelants tiennent pour acquises :
 *
 * - **La règle est portée par la LIGNE PARTICIPANT, pas par le type
 *   d'identité.** Un utilisateur inscrit qui rejoint par un lien sans historique
 *   porte le même `shareLinkId` que l'anonyme entré à côté de lui, et n'a pas
 *   plus de droit que lui sur l'avant-jointure. Le paramètre est donc une liste
 *   de participations, pas un `userId` ni un `participantId`.
 *
 * - **Le plancher est un `createdAt`, jamais un watermark.** C'est la seule
 *   borne qui exclue un message ancien RÉÉDITÉ depuis : son `updatedAt` est
 *   d'aujourd'hui, donc remonter la fenêtre delta (`updatedAt > since`) le
 *   laisserait passer avec tout son contenu. Le nom du champ rendu (`floor`
 *   appliqué à `createdAt`) est ce qui empêche l'appelant de se tromper de
 *   colonne.
 *
 * - **Qui n'a pas de lien ne paie rien.** Aucune participation avec
 *   `shareLinkId` ⇒ zéro requête et une map vide, donc un plan de requête
 *   inchangé pour l'écrasante majorité des lectures. Même contrat d'absence que
 *   `personalHistoryFilter` : une conversation absente de la map n'a pas de
 *   plancher.
 *
 * Un lien INTROUVABLE (supprimé depuis la jointure) ne borne rien — c'est la
 * posture de `messages.ts` (`if (shareLink) { … }`), et deux lecteurs de la même
 * règle qui divergeraient sur ce cas seraient pires que le cas lui-même.
 *
 * Ce que ce module ne fait PAS, et que `messages.ts` fait en plus : refuser
 * (403) un lien expiré ou à quota atteint. Ces contrôles ferment une PORTE
 * d'entrée, celui-ci rétrécit une LECTURE ; les fusionner demanderait de rendre
 * une décision de réponse depuis un module de filtre.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';

export type ShareLinkParticipation = {
  readonly conversationId: string;
  readonly joinedAt: Date;
  readonly shareLinkId: string | null;
};

/**
 * `conversationId` → instant avant lequel rien n'est lisible. Une conversation
 * absente n'a aucun plancher.
 */
export async function loadShareLinkHistoryFloors(
  prisma: PrismaClient,
  participations: readonly ShareLinkParticipation[],
): Promise<ReadonlyMap<string, Date>> {
  const floors = new Map<string, Date>();
  const linked = participations.filter((p) => Boolean(p.shareLinkId));
  if (linked.length === 0) return floors;

  const links = await prisma.conversationShareLink.findMany({
    where: { id: { in: [...new Set(linked.map((p) => p.shareLinkId as string))] } },
    select: { id: true, allowViewHistory: true },
  });
  const allowsHistory = new Map(links.map((l) => [l.id, l.allowViewHistory]));

  for (const p of linked) {
    if (allowsHistory.get(p.shareLinkId as string) === false) {
      floors.set(p.conversationId, p.joinedAt);
    }
  }
  return floors;
}

/**
 * La clause Prisma qui restreint un ensemble de conversations à ce que chacune
 * autorise.
 *
 * Elle s'AJOUTE au `conversationId: { in: [...] }` de l'appelant plutôt que de
 * le remplacer : c'est ce filtre-là que l'index sert, et le sous-`OR` ne fait
 * que le rétrécir. Rendue sous `AND` et non à plat, parce que le `OR` de
 * premier niveau appartient déjà au keyset de pagination — deux `OR` frères
 * s'écraseraient, et le survivant serait celui écrit en dernier.
 *
 * Rend `{}` quand rien n'est borné : l'appelant étale le résultat, et la
 * requête d'un lecteur sans lien de partage reste identique à l'octet près.
 */
export function historyFloorClause(
  conversationIds: readonly string[],
  floors: ReadonlyMap<string, Date>,
): Record<string, unknown> {
  if (floors.size === 0) return {};
  return {
    AND: [
      {
        OR: conversationIds.map((id) => {
          const floor = floors.get(id);
          return floor ? { conversationId: id, createdAt: { gte: floor } } : { conversationId: id };
        }),
      },
    ],
  };
}

/**
 * Variante tolérante : un plancher que l'on ne peut pas LIRE ne doit pas se
 * traduire par « pas de plancher ».
 *
 * Contrairement au masquage personnel — une courtoisie, dont l'échec dégrade
 * vers « on sert » — celui-ci est un CONTRÔLE D'ACCÈS. La seule dégradation
 * sûre est de ne rien servir des conversations concernées, ce que l'appelant
 * obtient en les retirant de son ensemble.
 */
export async function loadShareLinkHistoryFloorsOrFail(
  prisma: PrismaClient,
  participations: readonly ShareLinkParticipation[],
): Promise<{ floors: ReadonlyMap<string, Date>; unreadableConversationIds: readonly string[] }> {
  try {
    return {
      floors: await loadShareLinkHistoryFloors(prisma, participations),
      unreadableConversationIds: [],
    };
  } catch (error) {
    logger.warn('[share-link] history floor lookup failed, dropping linked conversations', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      floors: new Map(),
      unreadableConversationIds: participations
        .filter((p) => Boolean(p.shareLinkId))
        .map((p) => p.conversationId),
    };
  }
}
