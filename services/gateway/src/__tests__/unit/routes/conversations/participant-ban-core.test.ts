/**
 * **Les noyaux de `…/ban` et `…/unban` s'appellent SANS Fastify** (#4713).
 *
 * Aucun serveur, aucun `request`, aucun `reply` : `bannirParticipant` et
 * `leverBannissementDeParticipant` sont appelés comme des fonctions.
 *
 * Ce que ce témoin mesure en plus de l'appelabilité, c'est la SYMÉTRIE que les
 * deux gestes doivent tenir depuis la décision porteur du 2026-08-29 — « on
 * lève un bannissement qu'on aurait pu poser » : le MÊME plancher et la MÊME
 * comparaison de rang des deux côtés. Interrogée sur le noyau plutôt que sur la
 * route, la symétrie se lit sur DEUX appels de fonction dont on compare les
 * verdicts, ce qu'aucun témoin de route ne peut faire aussi directement.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();
const mockInvalidateParticipantLookup = jest.fn<any>();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: (...args: any[]) => mockInvalidateParticipantLookup(...args),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

import {
  bannirParticipant,
  leverBannissementDeParticipant,
} from '../../../../routes/conversations/participant-ban-core';

const CONV_ID = '507f1f77bcf86cd799439033';
const ACTEUR_ID = '507f1f77bcf86cd799439011';
const CIBLE_PART_ID = '507f1f77bcf86cd799439022';
const CIBLE_USER_ID = '507f1f77bcf86cd799439044';

type EmissionEnregistree = { readonly rooms: string[]; readonly event: string; readonly payload: any };

function fabriquerSocket() {
  const emissions: EmissionEnregistree[] = [];
  const rejointes: Array<readonly [string, string]> = [];
  const ordre: string[] = [];

  const chaine = (rooms: string[]) => ({
    to: (room: string) => chaine([...rooms, room]),
    emit: (event: string, payload: unknown) => {
      emissions.push({ rooms, event, payload });
      ordre.push(`emit:${event}`);
    },
  });

  const io = {
    to: (room: string) => chaine([room]),
    in: () => ({ fetchSockets: async () => [] }),
  };

  const manager = {
    getIO: () => io,
    invalidateParticipantCache: () => {},
    joinUserToConversationRoom: async (userId: string, conversationId: string) => {
      rejointes.push([userId, conversationId]);
      ordre.push('join');
    },
  };

  return { emissions, rejointes, ordre, passerelle: { getManager: () => manager } };
}

const CIBLE_ACTIVE = {
  id: CIBLE_PART_ID,
  userId: CIBLE_USER_ID,
  role: 'member',
  isActive: true,
  leftAt: null,
  bannedAt: null,
  displayName: 'Bob',
  shareLinkId: null,
};

function fabriquerPrisma(options: {
  readonly rangDemandeur?: string;
  readonly cible?: Record<string, unknown> | null;
} = {}) {
  const { rangDemandeur = 'moderator', cible = CIBLE_ACTIVE } = options;

  return {
    participant: {
      findFirst: jest.fn<any>()
        .mockResolvedValueOnce({ id: 'part-acteur', role: rangDemandeur })
        .mockResolvedValueOnce(cible),
      update: jest.fn<any>().mockResolvedValue({}),
      findMany: jest.fn<any>().mockResolvedValue([{ id: 'part-acteur', userId: ACTEUR_ID }]),
    },
    conversationShareLink: { update: jest.fn<any>().mockResolvedValue({}) },
  };
}

const demande = (prisma: unknown, socketIO: unknown, options: { platformRole?: string } = {}) => ({
  prisma: prisma as any,
  conversationIdentifier: CONV_ID,
  targetKey: CIBLE_USER_ID,
  currentUserId: ACTEUR_ID,
  platformRole: options.platformRole ?? 'USER',
  socketIO: socketIO as any,
});

beforeEach(() => {
  mockResolveConversationId.mockReset().mockResolvedValue(CONV_ID);
  mockInvalidateParticipantLookup.mockReset();
});

describe('bannirParticipant — appelé DIRECTEMENT, sans Fastify (#4713)', () => {
  it('écrit le bannissement, ferme le lien d’entrée et rend le verdict d’accord', async () => {
    const prisma = fabriquerPrisma({ cible: { ...CIBLE_ACTIVE, shareLinkId: 'lien-1' } });
    const socket = fabriquerSocket();

    const verdict = await bannirParticipant(demande(prisma, socket.passerelle));

    expect(verdict.genre).toBe('ok');
    if (verdict.genre !== 'ok') return;

    expect(verdict.donnees.participantId).toBe(CIBLE_PART_ID);
    expect(verdict.donnees.userId).toBe(CIBLE_USER_ID);
    expect(verdict.donnees.closedShareLinkId).toBe('lien-1');
    expect(typeof verdict.donnees.bannedAt).toBe('string');

    // La transition d'un membre ACTIF sort la personne ET date son départ.
    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: CIBLE_PART_ID },
      data: expect.objectContaining({ isActive: false }),
    });
    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith({
      where: { id: 'lien-1' },
      data: { isActive: false },
    });
    expect(mockInvalidateParticipantLookup).toHaveBeenCalledWith(CIBLE_PART_ID, CONV_ID);
  });

  it('refuse une cible déjà bannie par un 400', async () => {
    const prisma = fabriquerPrisma({ cible: { ...CIBLE_ACTIVE, bannedAt: new Date() } });

    const verdict = await bannirParticipant(demande(prisma, fabriquerSocket().passerelle));

    expect(verdict).toEqual({ genre: 'refus', statut: 400, message: 'Ce participant est déjà banni' });
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });
});

describe('leverBannissementDeParticipant — appelé DIRECTEMENT, sans Fastify (#4713)', () => {
  it('rebranche les sockets AVANT de diffuser, puis rend l’identité de la cible', async () => {
    const banni = { ...CIBLE_ACTIVE, isActive: false, bannedAt: new Date('2026-01-02T00:00:00.000Z'), leftAt: new Date('2026-01-02T00:00:00.000Z') };
    const prisma = fabriquerPrisma({ cible: banni });
    const socket = fabriquerSocket();

    const verdict = await leverBannissementDeParticipant(demande(prisma, socket.passerelle));

    expect(verdict).toEqual({ genre: 'ok', donnees: { participantId: CIBLE_PART_ID, userId: CIBLE_USER_ID } });
    expect(socket.rejointes).toEqual([[CIBLE_USER_ID, CONV_ID]]);
    // L'ordre est le contrat : rebrancher d'abord, diffuser ensuite — sinon
    // l'événement de room part avant que la cible y soit rentrée.
    expect(socket.ordre[0]).toBe('join');
    expect(socket.ordre[1]).toBe('emit:conversation:participant-unbanned');
  });

  it('refuse une cible qui n’est pas bannie par un 404', async () => {
    const prisma = fabriquerPrisma({ cible: CIBLE_ACTIVE });

    const verdict = await leverBannissementDeParticipant(demande(prisma, fabriquerSocket().passerelle));

    expect(verdict).toEqual({ genre: 'refus', statut: 404, message: 'Participant banni introuvable' });
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });
});

describe('la SYMÉTRIE des deux gestes se lit sur leurs deux verdicts (#4713)', () => {
  it('un MODÉRATEUR obtient un accord des DEUX côtés — il lève ce qu’il pouvait poser', async () => {
    const banni = { ...CIBLE_ACTIVE, isActive: false, bannedAt: new Date('2026-01-02T00:00:00.000Z'), leftAt: new Date('2026-01-02T00:00:00.000Z') };

    const ban = await bannirParticipant(
      demande(fabriquerPrisma({ rangDemandeur: 'moderator' }), fabriquerSocket().passerelle),
    );
    const levee = await leverBannissementDeParticipant(
      demande(fabriquerPrisma({ rangDemandeur: 'moderator', cible: banni }), fabriquerSocket().passerelle),
    );

    // L'asymétrie corrigée le 2026-08-29 : un modérateur posait un
    // bannissement qu'il ne pouvait pas lever. Les deux verdicts doivent
    // désormais s'accorder — c'est la MOITIÉ réparatrice qui manquait.
    expect(ban.genre).toBe('ok');
    expect(levee.genre).toBe('ok');
  });

  it('un simple MEMBRE est refusé des deux côtés, par le même plancher', async () => {
    const banni = { ...CIBLE_ACTIVE, bannedAt: new Date('2026-01-02T00:00:00.000Z') };

    const refusDuBan = await bannirParticipant(
      demande(fabriquerPrisma({ rangDemandeur: 'member' }), fabriquerSocket().passerelle),
    );
    const refusDeLaLevee = await leverBannissementDeParticipant(
      demande(fabriquerPrisma({ rangDemandeur: 'member', cible: banni }), fabriquerSocket().passerelle),
    );

    expect(refusDuBan).toEqual({
      genre: 'refus', statut: 403,
      message: 'Vous n\'avez pas les droits pour bannir un participant',
    });
    expect(refusDeLaLevee).toEqual({
      genre: 'refus', statut: 403,
      message: 'Vous n\'avez pas les droits pour lever un bannissement',
    });
  });

  it('un rang ÉGAL est hors de portée des deux côtés — un admin ne libère pas un admin banni', async () => {
    const cibleAdmin = { ...CIBLE_ACTIVE, role: 'admin' };
    const cibleAdminBannie = { ...cibleAdmin, bannedAt: new Date('2026-01-02T00:00:00.000Z') };

    const refusDuBan = await bannirParticipant(
      demande(fabriquerPrisma({ rangDemandeur: 'admin', cible: cibleAdmin }), fabriquerSocket().passerelle),
    );
    const refusDeLaLevee = await leverBannissementDeParticipant(
      demande(fabriquerPrisma({ rangDemandeur: 'admin', cible: cibleAdminBannie }), fabriquerSocket().passerelle),
    );

    expect(refusDuBan).toEqual({
      genre: 'refus', statut: 403,
      message: 'Vous ne pouvez pas bannir un participant de rang égal ou supérieur',
    });
    expect(refusDeLaLevee).toEqual({
      genre: 'refus', statut: 403,
      message: 'Vous ne pouvez pas lever le bannissement d\'un participant de rang égal ou supérieur',
    });
  });
});
