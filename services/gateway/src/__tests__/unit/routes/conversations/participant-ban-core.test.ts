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
    to: (room: string) => chaine([...rooms, room]), except: () => chaine(rooms),
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
    conversationShareLink: { updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
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
    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'lien-1', conversationId: CONV_ID },
      data: { isActive: false },
    });
    expect(mockInvalidateParticipantLookup).toHaveBeenCalledWith(CIBLE_PART_ID, CONV_ID);
  });

  it('ferme le lien d’entrée d’un invité entré avec le seul champ de session (#10465)', async () => {
    const ligneComplete = {
      ...CIBLE_ACTIVE,
      userId: null,
      shareLinkId: null,
      anonymousSession: { shareLinkId: 'lien-session' },
    };
    const projeter = (ligne: Record<string, unknown>, select: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(select)
          .filter(([cle]) => cle in ligne)
          .map(([cle, valeur]) => {
            const champ = ligne[cle];
            const sousSelection = (valeur as { select?: Record<string, unknown> }).select;
            return [cle, sousSelection && champ ? projeter(champ as Record<string, unknown>, sousSelection) : champ];
          }),
      );
    const prisma = fabriquerPrisma();
    prisma.participant.findFirst = jest.fn<any>()
      .mockResolvedValueOnce({ id: 'part-acteur', role: 'moderator' })
      .mockImplementationOnce(async (args: any) => projeter(ligneComplete, args.select));

    const verdict = await bannirParticipant(demande(prisma, fabriquerSocket().passerelle));

    expect(verdict.genre).toBe('ok');
    if (verdict.genre !== 'ok') return;
    expect(verdict.donnees.closedShareLinkId).toBe('lien-session');
    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'lien-session', conversationId: CONV_ID },
      data: { isActive: false },
    });
  });

  it('ne ferme pas un lien d’une AUTRE conversation que porterait la ligne bannie (#10465)', async () => {
    const prisma = fabriquerPrisma({ cible: { ...CIBLE_ACTIVE, shareLinkId: 'lien-ailleurs' } });
    prisma.conversationShareLink.updateMany.mockResolvedValue({ count: 0 });

    const verdict = await bannirParticipant(demande(prisma, fabriquerSocket().passerelle));

    expect(verdict.genre).toBe('ok');
    if (verdict.genre !== 'ok') return;
    expect(verdict.donnees.closedShareLinkId).toBeNull();
    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'lien-ailleurs', conversationId: CONV_ID },
      data: { isActive: false },
    });
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

/**
 * Audit de #19080, E1 (#16188) — lever un bannissement REND l'appartenance que
 * le bannissement avait prise. Dans un tête-à-tête devenu chiffré de bout en
 * bout, un tiers banni avant l'activation (la règle de la paire ne compte que
 * les actifs) redevenait actif. La porte passe par `returningMemberRefusal` :
 * hors de la paire, le bannissement est levé, l'appartenance n'est pas rendue —
 * même issue que le refus d'une communauté privée (`liftBanOnly`).
 *
 * Audit du delta (D1) : ce bloc tourne sur un double qui HONORE le `select` et
 * ÉVALUE le `where`. Un double qui rendait la ligne entière gardait vert un
 * `select` privé de `encryptionEnabledAt`. La paire RÉDUITE à un membre (B
 * banni après l'activation, C, l'ancien tiers, avant) est le cas où seule la
 * date tient la règle.
 */
describe('leverBannissementDeParticipant — un tête-à-tête chiffré de bout en bout reste à deux (#16188)', () => {
  const ACTIVATION = new Date('2026-11-10T00:00:00.000Z');
  const BANNI_AVANT = new Date('2026-11-01T00:00:00.000Z');
  const BANNI_APRES = new Date('2026-11-12T00:00:00.000Z');
  const PAIR_USER_ID = '507f1f77bcf86cd799439055';

  type Select = { readonly [key: string]: boolean | { readonly select: Select } };
  type Ligne = Record<string, unknown>;

  const projetee = (ligne: Ligne, select: Select | undefined): Ligne =>
    select
      ? Object.fromEntries(Object.entries(select).flatMap(([cle, voulu]) => {
          if (voulu === false) return [];
          if (voulu === true) return [[cle, ligne[cle]]];
          return [[cle, ligne[cle] === null || ligne[cle] === undefined ? ligne[cle] : projetee(ligne[cle] as Ligne, voulu.select)]];
        }))
      : { ...ligne };

  const satisfait = (ligne: Ligne, where: Ligne): boolean =>
    Object.entries(where).every(([cle, valeur]) => ligne[cle] === valeur);

  const ligne = (id: string, userId: string, banniLe: Date | null, role = 'member'): Ligne => ({
    id, conversationId: CONV_ID, userId, role, isActive: banniLe === null, leftAt: banniLe, bannedAt: banniLe,
    displayName: userId.slice(-4), shareLinkId: null, anonymousSession: null, language: 'fr',
  });

  /** Un double de `participant` qui n'en rend que ce que le `select` demande, sur des lignes qu'il ÉVALUE. */
  const prismaE2ee = (lignes: Ligne[]) => {
    const conversation = { communityId: null, type: 'direct', encryptionMode: 'e2ee', encryptionEnabledAt: ACTIVATION };
    const prisma = fabriquerPrisma();
    prisma.participant.findFirst = jest.fn<any>(async ({ where, select }: { where: Ligne; select?: Select }) => {
      const trouvee = lignes.find((candidate) => satisfait(candidate, where));
      return trouvee ? projetee({ ...trouvee, conversation }, select) : null;
    });
    prisma.participant.findMany = jest.fn<any>(async ({ where, select }: { where: Ligne; select?: Select }) =>
      lignes.filter((candidate) => satisfait(candidate, where)).map((trouvee) => projetee(trouvee, select)));
    prisma.participant.update = jest.fn<any>(async ({ where, data }: { where: { id: string }; data: Ligne }) =>
      Object.assign(lignes.find((candidate) => candidate.id === where.id)!, data));
    return prisma;
  };

  const actifs = (lignes: readonly Ligne[]) => lignes.filter((candidate) => candidate.isActive).map((candidate) => candidate.userId);

  it('un tiers banni avant l’activation : le bannissement est levé, l’appartenance n’est pas rendue', async () => {
    const lignes = [ligne('part-acteur', ACTEUR_ID, null, 'moderator'), ligne('part-paire', PAIR_USER_ID, null), ligne(CIBLE_PART_ID, CIBLE_USER_ID, BANNI_AVANT)];
    const prisma = prismaE2ee(lignes);
    const socket = fabriquerSocket();

    const verdict = await leverBannissementDeParticipant(demande(prisma, socket.passerelle));

    expect(verdict.genre).toBe('ok');
    expect(prisma.participant.update).toHaveBeenCalledWith({ where: { id: CIBLE_PART_ID }, data: { bannedAt: null } });
    expect(socket.rejointes).toEqual([]);
    expect(actifs(lignes)).toEqual([ACTEUR_ID, PAIR_USER_ID]);
  });

  it('paire réduite à un membre : l’ancien tiers, banni AVANT l’activation, ne prend pas la place de celui banni APRÈS', async () => {
    const lignes = [ligne('part-acteur', ACTEUR_ID, null, 'moderator'), ligne('part-paire', PAIR_USER_ID, BANNI_APRES), ligne(CIBLE_PART_ID, CIBLE_USER_ID, BANNI_AVANT)];
    const prisma = prismaE2ee(lignes);

    const verdict = await leverBannissementDeParticipant(demande(prisma, fabriquerSocket().passerelle));

    expect(verdict.genre).toBe('ok');
    expect(prisma.participant.update).toHaveBeenCalledWith({ where: { id: CIBLE_PART_ID }, data: { bannedAt: null } });
    expect(actifs(lignes)).toEqual([ACTEUR_ID]);
  });

  it('un membre de la paire banni après l’activation retrouve sa place (contrôle)', async () => {
    const lignes = [ligne('part-acteur', ACTEUR_ID, null, 'moderator'), ligne(CIBLE_PART_ID, CIBLE_USER_ID, BANNI_APRES)];
    const prisma = prismaE2ee(lignes);

    await leverBannissementDeParticipant(demande(prisma, fabriquerSocket().passerelle));

    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: CIBLE_PART_ID },
      data: { bannedAt: null, isActive: true, leftAt: null },
    });
    expect(actifs(lignes)).toEqual([ACTEUR_ID, CIBLE_USER_ID]);
  });
});
