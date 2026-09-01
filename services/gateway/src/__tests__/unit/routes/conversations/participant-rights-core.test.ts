/**
 * **Le noyau de `PATCH …/rights` s'appelle SANS Fastify** (#4713).
 *
 * Ce témoin n'ouvre aucun serveur, ne construit ni `request` ni `reply` et
 * n'importe pas `registerParticipantWriteRoutes` : il appelle
 * `appliquerDroitsDeParticipant` comme une fonction. C'est exactement ce que
 * #4176 attend de l'extraction — un geste dont la LOI est interrogeable sans
 * monter une route —, et c'est aussi la seule façon de prouver que le noyau ne
 * dépend pas du transport.
 *
 * Ce qu'il mesure, au-delà de l'appelabilité : la FORME du verdict (un refus
 * porte son statut, et ne porte son `code` que lorsque la route en servait un),
 * et la SÉPARATION des deux charges de diffusion — la room de conversation ne
 * reçoit ni `historyVisibleFrom` ni `canViewHistory`, la room personnelle
 * reçoit les deux. Cette dernière est la règle #3898/#4009, et elle n'a jamais
 * eu de témoin qui la lise sur l'objet ÉMIS.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();
const mockCanAccessConversation = jest.fn<any>();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

import { appliquerDroitsDeParticipant } from '../../../../routes/conversations/participant-rights-core';

const CONV_ID = '507f1f77bcf86cd799439033';
const ACTEUR_ID = '507f1f77bcf86cd799439011';
const CIBLE_PART_ID = '507f1f77bcf86cd799439022';
const CIBLE_USER_ID = '507f1f77bcf86cd799439044';

/** Un instant PASSÉ : le schéma refuse une date à venir (mute déguisé en octroi). */
const HIER = new Date(Date.now() - 86_400_000);

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

function fabriquerPrisma(options: {
  readonly rangDemandeur?: string | null;
  readonly cible?: Record<string, unknown> | null;
} = {}) {
  const {
    rangDemandeur = 'admin',
    cible = {
      id: CIBLE_PART_ID,
      userId: CIBLE_USER_ID,
      type: 'user',
      permissions: { canSendMessages: true, canViewHistory: false },
      anonymousSession: null,
      historyVisibleFrom: null,
    },
  } = options;

  const findFirst = jest.fn<any>()
    .mockResolvedValueOnce(rangDemandeur === null ? null : { role: rangDemandeur })
    .mockResolvedValueOnce(cible);

  return {
    prisma: {
      participant: {
        findFirst,
        update: jest.fn<any>().mockImplementation(async (args: any) => ({ ...(cible ?? {}), ...args.data })),
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'part-hote', userId: 'user-hote' }]),
      },
    },
    findFirst,
  };
}

const auth = (userId: string, role = 'USER') => ({
  type: 'user' as const,
  isAuthenticated: true,
  isAnonymous: false,
  userId,
  displayName: 'Acteur',
  userLanguage: 'fr',
  hasFullAccess: true,
  canSendMessages: true,
  registeredUser: { id: userId, role } as any,
});

beforeEach(() => {
  mockResolveConversationId.mockReset().mockResolvedValue(CONV_ID);
  mockCanAccessConversation.mockReset().mockResolvedValue(true);
});

describe('appliquerDroitsDeParticipant — appelé DIRECTEMENT, sans Fastify (#4713)', () => {
  it('refuse une conversation introuvable par un verdict 403 SANS code', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const { prisma } = fabriquerPrisma();

    const verdict = await appliquerDroitsDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: 'inconnue',
      participantId: CIBLE_PART_ID,
      authContext: auth(ACTEUR_ID),
      body: { canSendMessages: false },
      socketIO: fabriquerSocket().passerelle as any,
    });

    expect(verdict).toEqual({
      genre: 'refus',
      statut: 403,
      message: 'Unauthorized access to this conversation',
    });
    // La CLÉ est absente, pas `undefined` : le gestionnaire appelle
    // `sendForbidden(reply, msg)` à DEUX arguments quand elle manque.
    expect('code' in verdict).toBe(false);
  });

  it("refuse l'octroi par DATE à un modérateur, avec le code que la route servait", async () => {
    const { prisma } = fabriquerPrisma({ rangDemandeur: 'moderator' });

    const verdict = await appliquerDroitsDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      participantId: CIBLE_PART_ID,
      authContext: auth(ACTEUR_ID),
      body: { historyVisibleFrom: HIER.toISOString() },
      socketIO: fabriquerSocket().passerelle as any,
    });

    expect(verdict).toEqual({
      genre: 'refus',
      statut: 403,
      message: 'Only conversation admins may grant or revoke history access by date',
      code: 'HISTORY_GRANT_REQUIRES_ADMIN',
    });
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('écrit l’octroi, invalide le cache et rend le verdict d’accord', async () => {
    const { prisma } = fabriquerPrisma();
    const socket = fabriquerSocket();

    const verdict = await appliquerDroitsDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      participantId: CIBLE_PART_ID,
      authContext: auth(ACTEUR_ID),
      body: { historyVisibleFrom: HIER.toISOString() },
      socketIO: socket.passerelle as any,
    });

    expect(verdict.genre).toBe('ok');
    if (verdict.genre !== 'ok') return;

    expect(verdict.donnees.participantId).toBe(CIBLE_PART_ID);
    expect(verdict.donnees.conversationId).toBe(CONV_ID);
    expect(verdict.donnees.historyVisibleFrom).toBe(HIER.toISOString());
    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: CIBLE_PART_ID },
      data: { historyVisibleFrom: HIER },
    });
    expect(socket.invalidations).toEqual([[CIBLE_PART_ID, CONV_ID]]);
  });

  it('sert DEUX charges : la room du fil ignore l’octroi, la room personnelle le porte', async () => {
    const { prisma } = fabriquerPrisma();
    const socket = fabriquerSocket();

    await appliquerDroitsDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      participantId: CIBLE_PART_ID,
      authContext: auth(ACTEUR_ID),
      body: { historyVisibleFrom: HIER.toISOString() },
      socketIO: socket.passerelle as any,
    });

    const versLeFil = socket.emissions.find((e) => e.room === `conversation:${CONV_ID}`);
    const versLaCible = socket.emissions.find((e) => e.room === `user:${CIBLE_USER_ID}`);

    expect(versLeFil).toBeDefined();
    expect(versLaCible).toBeDefined();

    // La room entière n'apprend NI la date NI le booléen qui la redit.
    expect('historyVisibleFrom' in versLeFil!.payload).toBe(false);
    expect('canViewHistory' in versLeFil!.payload.rights).toBe(false);

    // L'intéressé reçoit les deux : c'est SA date.
    expect(versLaCible!.payload.historyVisibleFrom).toBe(HIER.toISOString());
    expect('canViewHistory' in versLaCible!.payload.rights).toBe(true);

    // Et les AUTRES hôtes la reçoivent aussi, sur leur room personnelle.
    expect(socket.emissions.some((e) => e.room === 'user:user-hote')).toBe(true);
  });
});
