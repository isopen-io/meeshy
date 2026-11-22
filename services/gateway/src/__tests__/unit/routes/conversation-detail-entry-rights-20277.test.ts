/**
 * #20277 — **les droits qu'un client lit sur le détail sont ceux que la
 * passerelle APPLIQUERA.**
 *
 * `services/participantRights.ts` porte la loi : pour une entrée SANS COMPTE,
 * `anonymousSession.rights` passe DEVANT l'instantané figé au join
 * (`Participant.permissions`), et c'est ce que `middleware/auth.ts` fait
 * respecter à chaque envoi. `GET /conversations/:id` servait l'instantané nu.
 *
 * La divergence des deux colonnes n'est pas un accident à aligner : c'est la
 * DÉCISION de `PATCH …/participants/:id/rights`, qui n'écrit QUE la surcharge
 * pour qu'en la retirant le droit retombe sur sa valeur d'origine. La seule
 * réparation possible est donc que la lecture RÉSOLVE.
 *
 * Elle va dans les DEUX sens, et les deux mentent :
 * - un droit RETIRÉ par surcharge laissait sa tuile ouverte — un geste refusé
 *   en 403 ;
 * - un droit ACCORDÉ par surcharge restait caché — un geste permis, invisible.
 *
 * Témoin par la ROUTE et le vrai contrat de fil (`app.inject`) : un témoin de
 * valeur qui ne traverse pas fast-json-stringify atteste un contrat que
 * personne ne respecte. La PROJECTION a son propre témoin — aucun témoin de
 * valeur ne peut voir un `select`, un double Prisma rendant ce qu'on lui dit
 * (`conversation-detail-include.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439aaa';
const GUEST_PARTICIPANT_ID = 'p-guest';

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: async () => CONV_ID,
}));

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: async () => true,
  resolveCallerParticipant: async () => ({ id: 'p-1', role: 'admin', joinedAt: new Date('2026-07-01T10:00:00Z') }),
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    getUnreadCount() { return Promise.resolve(0); }
  },
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => ({ id: USER_ID, role: 'USER' }),
  presenceFor: () => ({ showOnline: false, showLastSeenTimestamp: false }),
}));

import { registerConversationDetailRoute } from '../../../routes/conversations/core-detail';

/** L'instantané du join : ce que le lien autorisait LE JOUR de l'entrée. */
const JOIN_SNAPSHOT = {
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: false,
  canViewHistory: true,
};

type Override = Record<string, boolean> | null;

const ROW = (rights: Override) => ({
  id: CONV_ID,
  identifier: 'mee_demo',
  type: 'group',
  title: 'Le salon',
  description: null,
  avatar: null,
  banner: null,
  communityId: null,
  isActive: true,
  lastMessageAt: new Date('2026-08-01T10:00:00Z'),
  defaultWriteRole: 'everyone',
  isAnnouncementChannel: false,
  slowModeSeconds: 0,
  createdAt: new Date('2026-07-01T10:00:00Z'),
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  encryptionMode: null,
  encryptionProtocol: null,
  encryptionEnabledAt: null,
  encryptionEnabledBy: null,
  serverEncryptionKeyId: null,
  autoTranslateEnabled: true,
  participants: [
    {
      id: GUEST_PARTICIPANT_ID,
      userId: null,
      type: 'anonymous',
      displayName: 'Invité',
      avatar: null,
      role: 'member',
      permissions: { ...JOIN_SNAPSHOT },
      anonymousSession: rights === null ? null : { rights },
      isActive: true,
      isOnline: false,
      lastActiveAt: null,
      joinedAt: new Date('2026-07-02T10:00:00Z'),
      user: null,
    },
    {
      id: 'p-1',
      userId: USER_ID,
      type: 'user',
      displayName: 'Ana',
      avatar: null,
      role: 'admin',
      permissions: { ...JOIN_SNAPSHOT },
      anonymousSession: null,
      isActive: true,
      isOnline: false,
      lastActiveAt: null,
      joinedAt: new Date('2026-07-01T10:00:00Z'),
      user: { id: USER_ID, username: 'ana', displayName: 'Ana', firstName: 'Ana', lastName: 'B' },
    },
  ],
  _count: { participants: 2 },
});

const HOST = {
  type: 'user',
  isAuthenticated: true,
  isAnonymous: false,
  userId: USER_ID,
  registeredUser: { id: USER_ID, role: 'USER' },
};

/** Le visiteur SANS COMPTE lui-même : il ne reçoit que SA ligne (#10205). */
const GUEST = {
  type: 'anonymous',
  isAuthenticated: true,
  isAnonymous: true,
  userId: GUEST_PARTICIPANT_ID,
  participantId: GUEST_PARTICIPANT_ID,
};

async function detail(rights: Override, authContext: Record<string, unknown> = HOST) {
  const prisma = {
    conversation: { findFirst: jest.fn<any>().mockResolvedValue(ROW(rights)) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as any;
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('notificationService', { markConversationNotificationsAsRead: async () => undefined } as never);
  app.decorate('presenceChecker', undefined as never);
  registerConversationDetailRoute(app, prisma, async (req: any) => { req.authContext = authContext; });
  await app.ready();
  const response = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });
  await app.close();
  expect(response.statusCode).toBe(200);
  return response.json().data as Record<string, any>;
}

const participantOf = (data: Record<string, any>, id: string) =>
  (data.participants as Array<Record<string, any>>).find((p) => p.id === id);

describe('#20277 — GET /conversations/:id sert les droits RÉSOLUS d’une entrée sans compte', () => {
  it('un droit RETIRÉ par l’hôte ne laisse plus sa tuile ouverte', async () => {
    const data = await detail({ canSendImages: false });
    expect(participantOf(data, GUEST_PARTICIPANT_ID)?.permissions.canSendImages).toBe(false);
  });

  it('un droit ACCORDÉ par l’hôte est servi, même si le join le refusait', async () => {
    const data = await detail({ canSendVideos: true });
    expect(participantOf(data, GUEST_PARTICIPANT_ID)?.permissions.canSendVideos).toBe(true);
  });

  it('un droit que la surcharge ne NOMME pas suit l’instantané — une surcharge est un DELTA, jamais une table', async () => {
    const data = await detail({ canSendImages: false });
    const served = participantOf(data, GUEST_PARTICIPANT_ID)?.permissions;
    expect(served.canSendMessages).toBe(true);
    expect(served.canSendFiles).toBe(true);
    expect(served.canSendAudios).toBe(false);
  });

  it('sans aucune surcharge, la ligne sert exactement l’instantané du join', async () => {
    const data = await detail(null);
    expect(participantOf(data, GUEST_PARTICIPANT_ID)?.permissions).toMatchObject({
      canSendMessages: true, canSendFiles: true, canSendImages: true,
      canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false,
    });
  });

  it('la ligne d’un INSCRIT est inchangée — il ne porte aucune surcharge (`PARTICIPANT_HAS_ACCOUNT`)', async () => {
    const data = await detail({ canSendImages: false });
    expect(participantOf(data, 'p-1')?.permissions.canSendImages).toBe(true);
  });

  it('le VISITEUR qui lit sa PROPRE ligne y trouve les droits résolus — c’est elle qui gouverne son composeur (#20264)', async () => {
    const data = await detail({ canSendImages: false }, GUEST);
    expect((data.participants as Array<{ id: string }>).map((p) => p.id)).toEqual([GUEST_PARTICIPANT_ID]);
    expect(participantOf(data, GUEST_PARTICIPANT_ID)?.permissions.canSendImages).toBe(false);
  });

  /**
   * NON-RÉGRESSION DE FIL, et il faut dire ce qu'elle ne prouve PAS.
   *
   * La source de la surcharge porte `canViewHistory`, le fait de modération que
   * #4056 réserve aux hôtes. Ce témoin-ci NE PEUT PAS TOMBER sur son retrait :
   * `conversationParticipantSchema` ne déclare ni `anonymousSession` ni
   * `canViewHistory`, donc fast-json-stringify les retire quoi que la fabrique
   * remette — mesuré, en rendant la fabrique bavarde : ce fichier reste VERT.
   *
   * Il garde donc la seule chose qu'il peut garder — que rien de tout cela
   * n'atteint le fil aujourd'hui — et **la décision vit chez la loi**, avec son
   * témoin qui, lui, tombe (`__tests__/unit/services/participantRights.test.ts`
   * § #20277). Le jour où quelqu'un déclare l'une de ces deux clés, c'est ce
   * témoin-ci qui l'obligera à voir ce qu'il ouvre.
   */
  it('ne sert NI la source de la surcharge NI `canViewHistory`, sur aucune ligne', async () => {
    const data = await detail({ canSendImages: false, canViewHistory: false });
    for (const participant of data.participants as Array<Record<string, any>>) {
      expect(participant).not.toHaveProperty('anonymousSession');
      expect(participant.permissions).not.toHaveProperty('canViewHistory');
    }
    expect(JSON.stringify(data)).not.toContain('canViewHistory');
  });
});
