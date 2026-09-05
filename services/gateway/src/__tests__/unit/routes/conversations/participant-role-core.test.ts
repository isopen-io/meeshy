/**
 * **Le noyau de `PATCH …/role` s'appelle SANS Fastify** (#4713).
 *
 * Aucun serveur, aucun `request`, aucun `reply` : `changerRangDeParticipant`
 * est appelé comme une fonction, avec un double de Prisma, une passerelle
 * socket structurelle et un service d'avis réduit à son seul verbe.
 *
 * Ce qu'il mesure au passage — et qui n'avait pas de témoin qui le lise sur
 * l'objet ÉMIS : `PARTICIPANT_ROLE_UPDATED.userId` porte la cible RÉSOLUE,
 * jamais le segment d'URL. Le résolveur accepte les deux colonnes, donc
 * désigner quelqu'un par son `Participant.id` doit tout de même faire partir
 * son `User.id` — recopier un `Participant.id` dans un champ qui déclare un
 * `User.id` est ce que le CLAUDE.md du gateway interdit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: async () => ({ isOnline: true, lastActiveAt: new Date('2026-01-01T00:00:00.000Z') }),
  }),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

import { changerRangDeParticipant } from '../../../../routes/conversations/participant-role-core';

const CONV_ID = '507f1f77bcf86cd799439033';
const ACTEUR_ID = '507f1f77bcf86cd799439011';
const CIBLE_PART_ID = '507f1f77bcf86cd799439022';
const CIBLE_USER_ID = '507f1f77bcf86cd799439044';

type EmissionEnregistree = { readonly room: string; readonly event: string; readonly payload: any };

function fabriquerSocket() {
  const emissions: EmissionEnregistree[] = [];
  const invalidations: Array<readonly [string, string]> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => { emissions.push({ room, event, payload }); },
    }),
  };
  const manager = {
    getIO: () => io,
    invalidateParticipantCache: (key: string, conversationId: string) => {
      invalidations.push([key, conversationId]);
    },
    joinUserToConversationRoom: async () => {},
  };
  return { emissions, invalidations, passerelle: { getManager: () => manager } };
}

/**
 * Le double de Prisma. `findFirst` sert d'abord la ligne du DEMANDEUR, puis
 * celle de la cible cherchée par `userId`, puis celle cherchée par
 * `Participant.id` — l'ordre exact que `resolveTargetParticipant` impose.
 */
function fabriquerPrisma(options: {
  readonly rangDemandeur?: string;
  readonly rangPlateforme?: string | null;
  readonly cible?: Record<string, unknown> | null;
  /** Vrai quand le segment d'URL porte un `Participant.id` : la 1re passe rend `null`. */
  readonly cibleParIdDeParticipant?: boolean;
} = {}) {
  const {
    rangDemandeur = 'admin',
    rangPlateforme = 'USER',
    cible = {
      id: CIBLE_PART_ID,
      userId: CIBLE_USER_ID,
      role: 'member',
      isActive: true,
      leftAt: null,
      bannedAt: null,
      displayName: 'Bob',
      shareLinkId: null,
    },
    cibleParIdDeParticipant = false,
  } = options;

  const findFirst = jest.fn<any>();
  findFirst.mockResolvedValueOnce({ id: 'part-acteur', role: rangDemandeur, user: { role: rangPlateforme } });
  if (cibleParIdDeParticipant) findFirst.mockResolvedValueOnce(null);
  findFirst.mockResolvedValueOnce(cible);

  return {
    participant: {
      findFirst,
      update: jest.fn<any>().mockResolvedValue({}),
      findUnique: jest.fn<any>().mockResolvedValue({
        id: CIBLE_PART_ID,
        userId: CIBLE_USER_ID,
        role: 'moderator',
        displayName: 'Bob',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        user: { id: CIBLE_USER_ID, username: 'bob', role: 'USER', deactivatedAt: null },
      }),
    },
  };
}

beforeEach(() => {
  mockResolveConversationId.mockReset().mockResolvedValue(CONV_ID);
});

describe('changerRangDeParticipant — appelé DIRECTEMENT, sans Fastify (#4713)', () => {
  it('refuse un rang inconnu par un 400, avant toute lecture', async () => {
    const prisma = fabriquerPrisma();

    const verdict = await changerRangDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      targetKey: CIBLE_USER_ID,
      role: 'sorcier',
      currentUserId: ACTEUR_ID,
      viewer: null,
      socketIO: fabriquerSocket().passerelle as any,
      notifications: null,
    });

    expect(verdict).toEqual({
      genre: 'refus',
      statut: 400,
      message: 'Invalid role. Accepted roles are: admin, moderator, member',
    });
    expect(mockResolveConversationId).not.toHaveBeenCalled();
  });

  it('refuse un participant SANS COMPTE par un 400 qui porte son code', async () => {
    const prisma = fabriquerPrisma({
      cible: {
        id: CIBLE_PART_ID, userId: null, role: 'member', isActive: true,
        leftAt: null, bannedAt: null, displayName: 'Visiteur', shareLinkId: 'lien-1',
      },
      cibleParIdDeParticipant: true,
    });

    const verdict = await changerRangDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      targetKey: CIBLE_PART_ID,
      role: 'moderator',
      currentUserId: ACTEUR_ID,
      viewer: null,
      socketIO: fabriquerSocket().passerelle as any,
      notifications: null,
    });

    expect(verdict).toEqual({
      genre: 'refus',
      statut: 400,
      message: 'A participant without an account cannot hold a conversation rank yet',
      code: 'PARTICIPANT_HAS_NO_ACCOUNT',
    });
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('écrit le rang, avise la cible et rend le verdict d’accord', async () => {
    const prisma = fabriquerPrisma();
    const socket = fabriquerSocket();
    const avis = { createMemberRoleChangedNotification: jest.fn<any>().mockResolvedValue(null) };

    const verdict = await changerRangDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      targetKey: CIBLE_USER_ID,
      role: 'MODERATOR',
      currentUserId: ACTEUR_ID,
      viewer: null,
      socketIO: socket.passerelle as any,
      notifications: avis,
    });

    expect(verdict.genre).toBe('ok');
    if (verdict.genre !== 'ok') return;

    expect(verdict.donnees.role).toBe('moderator');
    expect(verdict.donnees.userId).toBe(CIBLE_USER_ID);
    expect(verdict.donnees.participantId).toBe(CIBLE_PART_ID);
    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: CIBLE_PART_ID },
      data: { role: 'moderator' },
    });
    expect(avis.createMemberRoleChangedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: CIBLE_USER_ID, newRole: 'MODERATOR', previousRole: 'member' }),
    );
    expect(socket.invalidations).toEqual([[CIBLE_USER_ID, CONV_ID]]);
  });

  it('émet le `User.id` RÉSOLU même quand l’URL désignait un `Participant.id`', async () => {
    const prisma = fabriquerPrisma({ cibleParIdDeParticipant: true });
    const socket = fabriquerSocket();

    await changerRangDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      targetKey: CIBLE_PART_ID,
      role: 'moderator',
      currentUserId: ACTEUR_ID,
      viewer: null,
      socketIO: socket.passerelle as any,
      notifications: null,
    });

    const emission = socket.emissions.find((e) => e.room === `conversation:${CONV_ID}`);
    expect(emission).toBeDefined();
    expect(emission!.payload.userId).toBe(CIBLE_USER_ID);
    expect(emission!.payload.newRole).toBe('moderator');
    // La diffusion n'a PAS de destinataire nommé : elle ne transporte donc
    // aucune présence, gatée ou non (#4009 + directive du 2026-08-25).
    expect('isOnline' in emission!.payload.participant).toBe(false);
    expect('lastActiveAt' in emission!.payload.participant).toBe(false);
  });
});
