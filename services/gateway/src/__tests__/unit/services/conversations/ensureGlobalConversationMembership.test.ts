/**
 * `ensureGlobalConversationMembership` — SOURCE UNIQUE de l'ajout au salon
 * global "meeshy", partagée par l'inscription publique
 * (`AuthService.register`), la création d'un compte par un administrateur
 * (`UserManagementService.createUser`) et le seed (`InitService`).
 *
 * Avant #3876, seule l'inscription publique ajoutait l'utilisateur au salon
 * global — un compte créé par un administrateur n'y entrait JAMAIS.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  ensureGlobalConversationMembership,
  type GlobalMembershipSocketManager,
} from '../../../../services/conversations/ensureGlobalConversationMembership';

const GLOBAL_CONV = { id: 'conv-global', identifier: 'meeshy' };
const USER_ID = 'user-new';

type Harness = {
  prisma: {
    conversation: { findFirst: jest.Mock };
    participant: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    message: { create: jest.Mock };
  };
};

function harness(overrides: { globalConv?: any; existingMember?: any } = {}): Harness {
  const { globalConv = GLOBAL_CONV, existingMember = null } = overrides;
  return {
    prisma: {
      conversation: { findFirst: jest.fn<any>().mockResolvedValue(globalConv) },
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(existingMember),
        create: jest.fn<any>().mockResolvedValue({ id: 'part-new' }),
        update: jest.fn<any>().mockResolvedValue({}),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
      message: { create: jest.fn<any>().mockResolvedValue({ id: 'msg-1' }) },
    },
  };
}

function makeIo() {
  const broadcast = { to: jest.fn(), except: jest.fn(), emit: jest.fn() };
  broadcast.to.mockReturnValue(broadcast);
  broadcast.except.mockReturnValue(broadcast);
  const io = { to: jest.fn<any>().mockReturnValue(broadcast) };
  return { io, broadcast };
}

const baseInput = { userId: USER_ID, displayName: 'New User' };

describe('ensureGlobalConversationMembership', () => {
  let h: Harness;
  beforeEach(() => { h = harness(); });

  it('rend "no-global-conversation" et ne crée rien si le salon global est introuvable', async () => {
    h = harness({ globalConv: null });

    const result = await ensureGlobalConversationMembership({ prisma: h.prisma as never }, baseInput);

    expect(result).toEqual({ outcome: 'no-global-conversation' });
    expect(h.prisma.participant.create).not.toHaveBeenCalled();
  });

  it('rend "already-member" et ne crée rien si la participation existe déjà', async () => {
    h = harness({ existingMember: { id: 'part-existing' } });

    const result = await ensureGlobalConversationMembership({ prisma: h.prisma as never }, baseInput);

    expect(result).toEqual({ outcome: 'already-member', participantId: 'part-existing' });
    expect(h.prisma.participant.create).not.toHaveBeenCalled();
    expect(h.prisma.message.create).not.toHaveBeenCalled();
  });

  // Trouvé pendant ce lot : InitService.createBigbossUser/createAdminUser
  // appellent AuthService.register() (qui rejoint DÉJÀ le salon global en
  // "member") puis essayaient de créer une SECONDE ligne en "creator"/"admin"
  // pour la même paire (conversationId, userId) — violation de l'index unique,
  // qui laissait BIGBOSS/ADMIN coincés à "member" dans leur propre salon.
  it('met À NIVEAU le rôle d\'une participation existante quand un rôle EXPLICITE est demandé (seed)', async () => {
    h = harness({ existingMember: { id: 'part-existing', role: 'member' } });

    const result = await ensureGlobalConversationMembership(
      { prisma: h.prisma as never },
      { ...baseInput, role: 'creator' },
    );

    expect(result).toEqual({ outcome: 'already-member', participantId: 'part-existing' });
    expect(h.prisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'part-existing' },
      data: { role: 'creator' },
    });
  });

  it('ne met PAS à niveau quand la participation existante a DÉJÀ le rôle demandé', async () => {
    h = harness({ existingMember: { id: 'part-existing', role: 'creator' } });

    await ensureGlobalConversationMembership({ prisma: h.prisma as never }, { ...baseInput, role: 'creator' });

    expect(h.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('ne met JAMAIS à niveau sans rôle explicite — l\'inscription et la création admin ne rétrogradent/promeuvent personne', async () => {
    h = harness({ existingMember: { id: 'part-existing', role: 'admin' } });

    const result = await ensureGlobalConversationMembership({ prisma: h.prisma as never }, baseInput);

    expect(result).toEqual({ outcome: 'already-member', participantId: 'part-existing' });
    expect(h.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('crée la participation avec le rôle "member" par défaut', async () => {
    await ensureGlobalConversationMembership({ prisma: h.prisma as never }, baseInput);

    expect(h.prisma.participant.create).toHaveBeenCalledWith({
      data: {
        conversationId: GLOBAL_CONV.id,
        userId: USER_ID,
        type: 'user',
        displayName: 'New User',
        role: 'member',
        permissions: {
          canSendMessages: true,
          canSendFiles: true,
          canSendImages: true,
          canSendVideos: true,
          canSendAudios: true,
          canSendLocations: true,
          canSendLinks: true,
          canViewHistory: false,
        },
        joinedAt: expect.any(Date),
        isActive: true,
      },
    });
  });

  it('respecte un rôle explicite (seed : creator/admin des comptes réservés)', async () => {
    await ensureGlobalConversationMembership({ prisma: h.prisma as never }, { ...baseInput, role: 'creator' });

    expect(h.prisma.participant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'creator' }) }),
    );
  });

  it('rend "joined" avec l\'id du participant créé', async () => {
    const result = await ensureGlobalConversationMembership({ prisma: h.prisma as never }, baseInput);

    expect(result).toEqual({ outcome: 'joined', participantId: 'part-new' });
  });

  it('poste l\'avis d\'arrivée, signé du Participant.id créé', async () => {
    await ensureGlobalConversationMembership({ prisma: h.prisma as never }, baseInput);

    expect(h.prisma.message.create).toHaveBeenCalledTimes(1);
    const { data } = h.prisma.message.create.mock.calls[0][0] as any;
    expect(data).toMatchObject({
      conversationId: GLOBAL_CONV.id,
      senderId: 'part-new',
      messageType: 'system',
      messageSource: 'system',
      metadata: expect.objectContaining({
        displayName: 'New User',
        isAnonymous: false,
        viaShareLink: false,
      }),
    });
  });

  it('diffuse l\'avis via le manager résolu, quand il en existe un', async () => {
    const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);
    const resolveSocketManager = jest.fn<any>().mockReturnValue({ broadcastMessage } as GlobalMembershipSocketManager);

    await ensureGlobalConversationMembership({ prisma: h.prisma as never, resolveSocketManager }, baseInput);

    expect(broadcastMessage).toHaveBeenCalledTimes(1);
    expect(broadcastMessage.mock.calls[0][1]).toBe(GLOBAL_CONV.id);
  });

  it('ne casse rien sans manager résolu — l\'ajout reste acquis sans socket', async () => {
    const result = await ensureGlobalConversationMembership({ prisma: h.prisma as never }, baseInput);

    expect(result.outcome).toBe('joined');
  });

  it('émet l\'effectif temps réel quand le manager expose getIO', async () => {
    const { io } = makeIo();
    const resolveSocketManager = jest.fn<any>().mockReturnValue({
      broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
      getIO: () => io,
    } as GlobalMembershipSocketManager);

    await ensureGlobalConversationMembership({ prisma: h.prisma as never, resolveSocketManager }, baseInput);

    expect(io.to).toHaveBeenCalled();
  });

  it('n\'émet AUCUN effectif quand le manager n\'expose pas getIO (ex: seed au boot)', async () => {
    const resolveSocketManager = jest.fn<any>().mockReturnValue({
      broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
    } as GlobalMembershipSocketManager);

    await ensureGlobalConversationMembership({ prisma: h.prisma as never, resolveSocketManager }, baseInput);

    // Rien à vérifier côté io — le manager n'en a pas exposé. Le test prouve
    // surtout l'absence de throw (pas de `getIO!()` non gardé).
    expect(h.prisma.participant.create).toHaveBeenCalledTimes(1);
  });

  it('AVALE une panne de l\'effectif temps réel — accessoire, jamais une condition de l\'ajout', async () => {
    const { io } = makeIo();
    h.prisma.participant.findMany.mockRejectedValue(new Error('mongo down'));
    const resolveSocketManager = jest.fn<any>().mockReturnValue({
      broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
      getIO: () => io,
    } as GlobalMembershipSocketManager);

    const result = await ensureGlobalConversationMembership(
      { prisma: h.prisma as never, resolveSocketManager },
      baseInput,
    );

    expect(result.outcome).toBe('joined');
  });
});
