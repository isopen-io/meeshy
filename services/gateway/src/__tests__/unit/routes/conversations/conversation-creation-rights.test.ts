/**
 * #6080 — **une conversation créée dans l'app naît OUVERTE.**
 *
 * `POST /conversations` (`routes/conversations/core-lifecycle.ts`) posait un
 * `defaultPermissions` écrit à la main, partagé par le CRÉATEUR et par chacun
 * des membres initiaux, avec `canSendVideos: false, canSendAudios: false`.
 * Depuis #5151, un droit de type explicitement `false` REFUSE la pièce jointe
 * correspondante : dans tout groupe créé depuis l'app, une vidéo, un vocal et
 * un document étaient rejetés — seules les images passaient.
 *
 * Le témoin lit l'objet remis à `conversation.create`, jamais la réponse : la
 * table de droits ne figure dans aucune charge servie.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../routes/conversations/utils/identifier-generator', () => ({
  generateConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_groupe'),
  generateCompactConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_AbCdEfGhIjKl'),
  ensureUniqueConversationIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique'),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('../../../../utils/response', () => ({
  sendSuccess: jest.fn<any>((reply: any) => reply),
  sendForbidden: jest.fn<any>((reply: any) => reply),
  sendNotFound: jest.fn<any>((reply: any) => reply),
  sendInternalError: jest.fn<any>((reply: any) => reply),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationResponseSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
  createConversationRequestSchema: { type: 'object' },
  updateConversationRequestSchema: { type: 'object' },
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn<any>().mockReturnValue({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

jest.mock('../../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn<any>().mockImplementation(() => ({
    recordEvent: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

import { registerCreateConversationRoute } from '../../../../routes/conversations/core-lifecycle';
import { FOUNDING_MEMBER_PERMISSIONS } from '../../../../services/participantRights';

const CONV_ID = '507f1f77bcf86cd799439011';
const MOI = '507f1f77bcf86cd799439022';
const AUTRE = '507f1f77bcf86cd799439033';

function prismaDouble() {
  return {
    community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>(async () => ({
        id: CONV_ID, type: 'group', title: 'Équipe', createdAt: new Date(), participants: [],
      })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: MOI, displayName: 'Moi', username: 'moi', avatar: null },
        { id: AUTRE, displayName: 'Alice', username: 'alice', avatar: null },
      ]),
    },
  };
}

function replyDouble() {
  const reply: any = {
    status: jest.fn<any>(() => reply),
    code: jest.fn<any>(() => reply),
    header: jest.fn<any>(() => reply),
    send: jest.fn<any>(() => reply),
  };
  return reply;
}

/**
 * Crée un GROUPE avec un membre initial, et rend les lignes `Participant`
 * telles qu'elles partent vers Prisma — c'est le seul endroit où la table
 * apparaît.
 */
async function creerGroupe() {
  const prisma = prismaDouble();
  let handler: any;
  const fastify: any = {
    post: jest.fn<any>((_path: string, _opts: any, h: any) => { handler = h; }),
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
  };

  registerCreateConversationRoute(fastify, prisma as never, jest.fn<any>());

  await handler(
    {
      body: { type: 'group', title: 'Équipe', participantIds: [AUTRE] },
      params: {}, query: {}, headers: {},
      authContext: {
        type: 'user', isAuthenticated: true, isAnonymous: false,
        userId: MOI, registeredUser: { id: MOI, role: 'USER' },
      },
      user: { userId: MOI },
    },
    replyDouble(),
  );

  expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  const data = (prisma.conversation.create.mock.calls[0] as any[])[0].data;
  return data.participants.create as Array<{ userId: string; role: string; permissions: Record<string, boolean> }>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('#6080 — `POST /conversations` écrit la table du site unique', () => {
  it('la pose sur le CRÉATEUR et sur chaque membre initial, champ par champ', async () => {
    const lignes = await creerGroupe();

    expect(lignes).toHaveLength(2);
    for (const ligne of lignes) {
      expect(ligne.permissions).toEqual({ ...FOUNDING_MEMBER_PERMISSIONS });
    }
  });

  it('ouvre VIDÉO et AUDIO — le créateur lui-même en était privé', async () => {
    const createur = (await creerGroupe()).find((l) => l.role === 'creator');

    expect(createur?.permissions.canSendVideos).toBe(true);
    expect(createur?.permissions.canSendAudios).toBe(true);
    expect(createur?.permissions.canSendFiles).toBe(true);
  });

  it("n'ouvre ni la position ni les liens — le lot ne touche pas ce que le site fermait déjà", async () => {
    const [premiere] = await creerGroupe();

    expect(premiere.permissions.canSendLocations).toBe(false);
    expect(premiere.permissions.canSendLinks).toBe(false);
  });

  it("garde l'historique OUVERT — la valeur que le site laissait au défaut de schéma", async () => {
    const [premiere] = await creerGroupe();

    expect(premiere.permissions.canViewHistory).toBe(true);
  });
});
