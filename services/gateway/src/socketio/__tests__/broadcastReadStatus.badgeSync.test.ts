/**
 * #18910 (serveur-transport-6, audit) — la pastille de l'iPhone suit l'AVANCÉE DU CURSEUR, pas le marquage des
 * notifications.
 *
 * Le total d'icône compte les conversations non lues par leur curseur de lecture. La synchronisation partait
 * pourtant du seul marquage de NOTIFICATIONS : une lecture progressive sur le web (le curseur avance au défilement)
 * marquait toutes les notifications de la conversation à la première salve, comptait 2 s plus tard un total où la
 * conversation était encore non lue, puis ne repartait plus jamais — les salves suivantes ne marquant rien. Même trou
 * pour des messages arrivés sans notification (Ne pas déranger, nouveaux messages coupés). L'icône gardait « 1 ».
 *
 * `broadcastReadStatus` est la diffusion partagée de toute écriture d'accusé (les portes REST et l'arriéré de
 * l'expéditeur), appelée APRÈS l'écriture du curseur : c'est elle qui annonce la lecture au service de notifications.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { broadcastReadStatus } from '../broadcastReadStatus';
import { makeChainableIO } from '../../__tests__/helpers/chainable-io';
import { setSharedNotificationService } from '../../services/notifications/notification-service-registry';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const ACTOR_USER_ID = '507f1f77bcf86cd799439077';
const ACTOR_PARTICIPANT_ID = '507f1f77bcf86cd799439066';

const noteReadCursorMoved = jest.fn<(userId: string) => void>();

function deps(over: { io?: unknown } = {}) {
  return {
    io: 'io' in over ? over.io : makeChainableIO(),
    prisma: {
      conversationReadCursor: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    },
    readStatusService: {
      getLatestMessageSummary: jest.fn<any>().mockResolvedValue({ lastMessageId: 'm1' }),
      getUnreadCount: jest.fn<any>().mockResolvedValue(0),
    },
    privacyPreferencesService: { shouldShowReadReceipts: jest.fn<any>().mockResolvedValue(false) },
  } as any;
}

const args = (over: Record<string, unknown> = {}) => ({
  conversationId: CONVERSATION_ID,
  participantId: ACTOR_PARTICIPANT_ID,
  userId: ACTOR_USER_ID,
  isAnonymous: false,
  type: 'read' as const,
  ...over,
});

describe('broadcastReadStatus — la lecture écrite remet la pastille de l’iPhone à jour (#18910)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSharedNotificationService({ noteReadCursorMoved } as never);
  });

  afterEach(() => setSharedNotificationService(undefined));

  it('un accusé de LECTURE écrit annonce la lecture du compte, qu’une notification ait été marquée ou non', async () => {
    await broadcastReadStatus(deps(), args());

    expect(noteReadCursorMoved).toHaveBeenCalledWith(ACTOR_USER_ID);
  });

  it('chaque salve d’une lecture progressive l’annonce : la dernière fixe le chiffre', async () => {
    await broadcastReadStatus(deps(), args());
    await broadcastReadStatus(deps(), args());
    await broadcastReadStatus(deps(), args());

    expect(noteReadCursorMoved).toHaveBeenCalledTimes(3);
  });

  it('même sans Socket.IO branché : l’iPhone n’a pas besoin d’un socket', async () => {
    await broadcastReadStatus(deps({ io: undefined }), args());

    expect(noteReadCursorMoved).toHaveBeenCalledWith(ACTOR_USER_ID);
  });

  it('un accusé de RÉCEPTION n’avance aucun curseur de lecture : rien n’est annoncé', async () => {
    await broadcastReadStatus(deps(), args({ type: 'received' }));

    expect(noteReadCursorMoved).not.toHaveBeenCalled();
  });

  it('un lecteur anonyme n’a ni compte ni iPhone inscrit : rien n’est annoncé', async () => {
    await broadcastReadStatus(deps(), args({ isAnonymous: true, userId: ACTOR_PARTICIPANT_ID }));

    expect(noteReadCursorMoved).not.toHaveBeenCalled();
  });
});
