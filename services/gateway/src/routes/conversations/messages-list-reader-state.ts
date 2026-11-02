/**
 * L'état du LECTEUR sur une page de `GET /conversations/:id/messages` : les
 * accusés agrégés de chaque message et la progression du participant courant
 * sur chaque pièce jointe. Deux chargeurs par page, chacun d'une requête,
 * extraits de `messages-list-query.ts` (budget de taille #4284/#4426) — la
 * sérialisation d'une ligne y reste et reçoit ces deux cartes.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from './messages-shared';
import type { CurrentUserConsumption } from './messages-list-query-types';

/**
 * Charge les accusés de lecture agrégés (`MessageReadStatusService`) pour une
 * page de `GET /conversations/:id/messages`. `hasAuthenticatedUserId` reflète
 * `authRequest.authContext?.userId` au site d'appel — un anonyme ou un
 * appelant sans messages reçoit une carte vide, sans requête.
 */
export async function loadMessageReadStatusMap(
  prisma: PrismaClient,
  conversationId: string,
  // `unknown[]` : l'appelant (`messages-list.ts`) construit `messages` via un `select` typé `any` — préexistant.
  messages: readonly unknown[],
  hasAuthenticatedUserId: boolean
): Promise<Map<string, {
  deliveredCount: number;
  readCount: number;
  recipientCount: number;
  deliveredToAllAt: Date | null;
  readByAllAt: Date | null;
}>> {
      // Enrichir les messages avec les vrais statuts de lecture.
      // Les champs dénormalisés en base (`deliveredCount`, `readCount`) n'ont
      // AUCUN écrivain : ils valent toujours zéro. Le comptage vit dans
      // `MessageReadStatusService.getConversationReadStatuses`, l'unique
      // source de vérité partagée avec les trois autres lecteurs d'accusés
      // (`getMessageReadStatus`, `getMessageStatusDetails`,
      // `getLatestMessageSummary`). Cette route en tenait une COPIE, qui avait
      // dérivé sur un point décisif : elle ne consultait pas la préférence
      // `showReadReceipts`, si bien que le rattrapage REST révélait à
      // l'expéditeur la lecture d'un destinataire qui l'avait explicitement
      // tue — et comptait ce même destinataire dans le dénominateur, que le
      // canal socket en retire.
      const readStatusMap = new Map<string, {
        deliveredCount: number;
        readCount: number;
        recipientCount: number;
        deliveredToAllAt: Date | null;
        readByAllAt: Date | null;
      }>();
      if (messages.length > 0 && hasAuthenticatedUserId) {
        try {
          const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
          const readStatusService = new MessageReadStatusService(prisma);
          const statuses = await readStatusService.getConversationReadStatuses(
            conversationId,
            (messages as ReadonlyArray<{ readonly id: string }>).map((m) => m.id)
          );
          for (const [messageId, status] of statuses) {
            readStatusMap.set(messageId, {
              deliveredCount: status.receivedCount,
              readCount: status.readCount,
              // Dénominateur all-or-nothing faisant autorité : les
              // destinataires actifs, expéditeur exclu, opt-out exclus. Permet
              // au client d'allumer ✓✓ / « lu » sur le compte réel du serveur
              // plutôt que sur un `memberCount` local périmé.
              recipientCount: status.totalMembers,
              // Les DATES du même seuil, dérivées de la même union — l'instant
              // du DERNIER destinataire servi, `null` tant qu'il en manque un.
              deliveredToAllAt: status.deliveredToAllAt,
              readByAllAt: status.readByAllAt,
            });
          }
        } catch (err) {
          logger.warn('[CONVERSATIONS] Failed to compute read statuses:', err);
        }
      }

  return readStatusMap;
}

/**
 * Charge la progression du participant courant sur les pièces jointes de la
 * PAGE — une seule requête, bornée aux identifiants rendus, scopée au
 * participant. Miroir exact de `userReactionsMap`.
 *
 * ## Ce champ a déjà vécu, et il est mort d'être indéclaré
 *
 * La projection existait depuis juin 2026 et `fast-json-stringify` la retirait
 * de CHAQUE réponse, faute d'être déclarée au `messageAttachmentSchema` : deux
 * requêtes Prisma par page payées pour un champ qu'aucun client ne recevait.
 * #4177 a retiré ce travail mort, à raison.
 *
 * Ce qui la ramène n'est pas l'inverse de ce retrait : c'est la DÉCLARATION,
 * posée d'abord (`packages/shared/types/api-schemas.ts`). Sans elle, ce
 * chargeur remourrait en silence — et le lecteur web qui l'attend
 * (`useMediaConsumptionReporter`) serait un contrôle non alimenté, ce qui se
 * voit encore moins qu'un champ absent.
 */
export async function loadCurrentUserConsumptionMap(
  prisma: PrismaClient,
  // `unknown[]`, même raison que `loadMessageReadStatusMap` ci-dessus.
  messages: readonly unknown[],
  currentParticipantId: string | undefined
): Promise<Map<string, CurrentUserConsumption>> {
  const map = new Map<string, CurrentUserConsumption>();
  if (!currentParticipantId || messages.length === 0) return map;

  const rows = messages as ReadonlyArray<{ readonly attachments?: ReadonlyArray<{ readonly id?: string | null }> | null }>;
  const attachmentIds: string[] = rows.flatMap((m) =>
    Array.isArray(m.attachments) ? m.attachments.map((a) => a.id).filter((id): id is string => !!id) : []
  );
  if (attachmentIds.length === 0) return map;

  try {
    const rows = await prisma.attachmentStatusEntry.findMany({
      where: { attachmentId: { in: attachmentIds }, participantId: currentParticipantId },
      // Borne EXACTE, pas arbitraire : `@@unique([attachmentId, participantId])`
      // garantit au plus une ligne par pièce jointe pour ce participant, donc
      // `take` ne peut rien tronquer — il DIT seulement la borne que le couple
      // impose déjà, ce que le cliquet des `findMany` non bornés demande.
      take: attachmentIds.length,
      select: {
        attachmentId: true,
        lastPlayPositionMs: true,
        listenedComplete: true,
        lastWatchPositionMs: true,
        watchedComplete: true,
      },
    });
    for (const row of rows) {
      map.set(row.attachmentId, {
        lastPlayPositionMs: row.lastPlayPositionMs ?? null,
        listenedComplete: row.listenedComplete ?? false,
        lastWatchPositionMs: row.lastWatchPositionMs ?? null,
        watchedComplete: row.watchedComplete ?? false,
      });
    }
  } catch (err) {
    // Une reprise absente coûte un redémarrage au début ; faire échouer la
    // liste entière coûte la conversation. La carte vide est le bon repli.
    logger.warn('[CONVERSATIONS] Failed to load media consumption:', err);
  }
  return map;
}
