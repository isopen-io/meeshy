/**
 * #6080 — **le CRÉATEUR d'une conversation fabriquée avec un lien de partage
 * est un membre NOMMÉ, et sa table de droits naît OUVERTE.**
 *
 * `mintConversationShareLink` a deux branches qui CRÉENT une conversation — la
 * branche `newConversation` (créateur + membres initiaux) et le repli LEGACY
 * (créateur seul) — et chacune posait son propre littéral fermé sur
 * `canSendVideos`/`canSendAudios`. Ce sont des membres nommés : contrairement
 * aux visiteurs qui SUIVRONT le lien (`routes/conversations/link-admission.ts`,
 * dont les droits viennent du lien et le restent), personne ne leur a imposé de
 * restriction — ils fabriquent la conversation.
 *
 * Les deux branches sont exercées, pas une seule : un témoin posé sur une seule
 * ne rougirait pas si l'autre redivergeait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../routes/links/utils/link-helpers', () => ({
  ...(jest.requireActual('../../../../routes/links/utils/link-helpers') as object),
  generateUniqueShareLinkId: jest.fn<any>().mockResolvedValue('mshy_TestLnk1'),
  ensureUniqueShareLinkIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique'),
}));

import { mintConversationShareLink } from '../../../../routes/links/utils/share-link-mint';
import { FOUNDING_MEMBER_PERMISSIONS } from '../../../../services/participantRights';

const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';

function prismaDouble() {
  return {
    conversation: {
      create: jest.fn<any>(async () => ({ id: CONV_ID, title: 'Neuve' })),
    },
    conversationShareLink: {
      create: jest.fn<any>(async (args: any) => ({ id: 'lnk', ...args?.data })),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      findUnique: jest.fn<any>(async (args: any) =>
        args?.where?.id === MOI
          ? { displayName: 'Moi', username: 'moi' }
          : { id: AUTRE, displayName: 'Alice', username: 'alice' }
      ),
      findMany: jest.fn<any>().mockResolvedValue([{ id: AUTRE, displayName: 'Alice', username: 'alice' }]),
    },
  };
}

const replyDouble = () => {
  const reply: any = {
    status: jest.fn<any>(() => reply),
    code: jest.fn<any>(() => reply),
    send: jest.fn<any>(() => reply),
  };
  return reply;
};

/**
 * `input` décide de la branche : `newConversation` pour la conversation neuve
 * avec membres, son absence totale pour le repli legacy.
 */
async function frapper(input: Record<string, unknown>) {
  const prisma = prismaDouble();

  const minted = await mintConversationShareLink({
    prisma: prisma as never,
    reply: replyDouble(),
    log: { error: jest.fn<any>() },
    notificationService: undefined,
    socketIOHandler: undefined,
    userId: MOI,
    userRole: 'USER',
    input: input as never,
  });

  expect(minted).not.toBeNull();
  expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  const data = (prisma.conversation.create.mock.calls[0] as any[])[0].data;
  return data.participants.create as Array<{ userId: string; role: string; permissions: Record<string, boolean> }>;
}

const brancheNeuve = () =>
  frapper({ name: 'Lien', newConversation: { title: 'Neuve', memberIds: [AUTRE] } });

const brancheLegacy = () => frapper({ name: 'Lien legacy' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe("#6080 — les deux branches de création d'un lien écrivent la table du site unique", () => {
  it('branche `newConversation` : créateur ET membres initiaux, champ par champ', async () => {
    const lignes = await brancheNeuve();

    expect(lignes).toHaveLength(2);
    for (const ligne of lignes) {
      expect(ligne.permissions).toEqual({ ...FOUNDING_MEMBER_PERMISSIONS });
    }
  });

  it('repli LEGACY : le créateur seul, même table', async () => {
    const lignes = await brancheLegacy();

    expect(lignes).toHaveLength(1);
    expect(lignes[0].role).toBe('creator');
    expect(lignes[0].permissions).toEqual({ ...FOUNDING_MEMBER_PERMISSIONS });
  });

  it('les deux branches posent la MÊME table — une seule assertion par branche ne verrait pas leur divergence', async () => {
    const neuve = await brancheNeuve();
    const legacy = await brancheLegacy();

    expect(legacy[0].permissions).toEqual(neuve[0].permissions);
  });

  it('et cette table ouvre VIDÉO et AUDIO', async () => {
    const [createur] = await brancheNeuve();

    expect(createur.permissions.canSendVideos).toBe(true);
    expect(createur.permissions.canSendAudios).toBe(true);
  });
});
