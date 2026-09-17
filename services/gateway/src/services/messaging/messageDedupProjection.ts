/**
 * **La relecture d'un message DÉJÀ ÉCRIT, pour les deux déduplications** (#6910).
 *
 * `MessageProcessor` porte deux gardes contre le doublon, et toutes deux doivent
 * rendre le message existant sous la MÊME forme que celle qu'un message neuf
 * aurait prise — l'expéditeur, les pièces jointes, et le message cité avec les
 * siennes (parité REST : sans elles, l'aperçu de citation est vide) :
 *
 * 1. la garde NOMINALE, sur la clé d'idempotence `(conversationId,
 *    clientMessageId)`, rattrapée au `P2002` de l'index unique partiel ;
 * 2. le REPLI par contenu, quand le producteur refabrique sa clé à chaque
 *    ré-émission — la règle pure vit dans `contentWindowDedup.ts`.
 *
 * Cette projection vit ICI, en un seul exemplaire, plutôt que dans le fichier
 * qui l'utilise : elle y existait déjà en DEUX copies rigoureusement
 * identiques, et le repli en aurait fait une troisième — c'est-à-dire la paire
 * qui finit par diverger, sur le champ qu'un seul des chemins gagne.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { attachmentFullSelect } from '../attachments/attachmentIncludes';
import { performanceLogger, enhancedLogger } from '../../utils/logger-enhanced';
import { withOrphanedSenderRepair } from './withOrphanedSenderRepair';
import {
  CONTENT_WINDOW_DEDUP_MS,
  findRecentIdenticalMessage,
  type ContentWindowCandidate,
} from './contentWindowDedup';

const logger = enhancedLogger.child({ module: 'MessageDedup' });

/**
 * Relit un message existant avec la projection complète.
 *
 * `withOrphanedSenderRepair` est conservé : une relecture de dédoublonnage porte
 * le même risque de `sender` orphelin qu'une lecture ordinaire, et c'est la
 * seule chose qui l'en protège.
 */
export async function findExistingMessage(params: {
  readonly prisma: PrismaClient;
  readonly where: Prisma.MessageWhereInput;
  readonly conversationId: string;
  readonly timingLabel: string;
  readonly corr: Record<string, any>;
}) {
  const { prisma, where, conversationId, timingLabel, corr } = params;

  return performanceLogger.withTiming(
    timingLabel,
    () => withOrphanedSenderRepair(
      { prisma, conversationIds: [conversationId] },
      () => prisma.message.findFirst({
        where,
        include: {
          sender: {
            select: {
              id: true, displayName: true, avatar: true, type: true,
              nickname: true, userId: true,
              user: {
                select: {
                  id: true, username: true, displayName: true,
                  firstName: true, lastName: true, avatar: true
                }
              }
            }
          },
          attachments: true,
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true, displayName: true, avatar: true, type: true,
                  nickname: true, userId: true,
                  user: {
                    select: {
                      id: true, username: true, displayName: true,
                      firstName: true, lastName: true, avatar: true
                    }
                  }
                }
              },
              attachments: { select: attachmentFullSelect, take: 4 }
            }
          }
        }
      })
    ),
    corr
  );
}

/**
 * Le REPLI, câblé : décision pure (`contentWindowDedup`) + lecture Prisma.
 *
 * Rend le message identique déjà écrit dans la fenêtre, ou `null` — et `null`
 * aussi quand la lecture ÉCHOUE : un palliatif n'empêche jamais un envoi.
 *
 * Le `deletedAt: null` n'est pas décoratif : un message RAPPELÉ ne doit pas
 * absorber un renvoi, sans quoi l'expéditeur qui réécrit après avoir supprimé
 * verrait son second message disparaître dans le premier.
 */
export async function findContentWindowDuplicate(params: {
  readonly prisma: PrismaClient;
  readonly candidate: ContentWindowCandidate;
  readonly clientMessageId?: string;
  readonly corr: Record<string, any>;
  readonly now?: Date;
}) {
  const { prisma, candidate, clientMessageId, corr, now = new Date() } = params;

  const existing = await findRecentIdenticalMessage({
    candidate,
    now,
    lookup: ({ conversationId, senderId, content, since }) => findExistingMessage({
      prisma,
      where: { conversationId, senderId, content, createdAt: { gte: since }, deletedAt: null },
      conversationId,
      timingLabel: 'messaging.contentWindowDedupFindFirst',
      corr
    }),
    onError: (error) => logger.warn('Content-window dedup lookup failed — message created anyway', {
      conversationId: candidate.conversationId,
      error
    })
  });

  if (existing) {
    logger.info('Content-window dedup hit on identical content', {
      conversationId: candidate.conversationId,
      clientMessageId,
      messageId: existing.id,
      windowMs: CONTENT_WINDOW_DEDUP_MS
    });
  }

  return existing;
}
