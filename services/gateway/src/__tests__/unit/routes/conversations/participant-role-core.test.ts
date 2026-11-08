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
import { announceParticipantRoleWithCapabilities } from '../../../../services/conversations/obsoleteCapability';

const CONV_ID = '507f1f77bcf86cd799439033';
const ACTEUR_ID = '507f1f77bcf86cd799439011';
const CIBLE_PART_ID = '507f1f77bcf86cd799439022';
const CIBLE_USER_ID = '507f1f77bcf86cd799439044';

type EmissionEnregistree = { readonly room: string; readonly excepts: readonly string[]; readonly event: string; readonly payload: any };

function fabriquerSocket() {
  const emissions: EmissionEnregistree[] = [];
  const invalidations: Array<readonly [string, string]> = [];
  const diffusion = (room: string, excepts: readonly string[]): any => ({
    to: (autre: string) => diffusion(autre, excepts),
    except: (exclue: string) => diffusion(room, [...excepts, exclue]),
    emit: (event: string, payload: unknown) => { emissions.push({ room, excepts, event, payload }); },
  });
  const io = { to: (room: string) => diffusion(room, []) };
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
  /** Le rang RELU de la cible quand la capacité de son lecteur se calcule. */
  readonly rangRelu?: string;
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
    rangRelu = 'moderator',
  } = options;

  const findFirst = jest.fn<any>();
  findFirst.mockResolvedValueOnce({ id: 'part-acteur', role: rangDemandeur, user: { role: rangPlateforme } });
  if (cibleParIdDeParticipant) findFirst.mockResolvedValueOnce(null);
  findFirst.mockResolvedValueOnce(cible);

  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: CIBLE_USER_ID, role: 'USER' }]),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{
        conversationId: CONV_ID,
        userId: CIBLE_USER_ID,
        role: rangRelu,
        type: 'user',
        leftAt: null,
        bannedAt: null,
        conversation: { type: 'group', identifier: null },
      }]),
      groupBy: jest.fn<any>().mockResolvedValue([]),
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

/**
 * **Reposer le MÊME rang n'est pas un geste** (#17078).
 *
 * Le noyau n'a jamais comparé le rang demandé au rang courant : un `PATCH`
 * rejoué écrivait une ligne identique, diffusait `participant:role-updated` à
 * toute la salle **sans delta**, et poussait une notification dont
 * `previousRole === newRole` — « X vous a nommé administrateur » pour un geste
 * qui n'a rien changé.
 *
 * La garde d'idempotence existe sur la jumelle la plus proche
 * (`participant-ban-core` refuse 400 « déjà banni ») et pas ici : « une garde
 * posée sur un chemin se lit comme posée sur le SUJET ».
 *
 * ─── Pourquoi un 200 IDEMPOTENT et non le 400 de la jumelle ─────────────────
 *
 * Un bannissement est un acte de MODÉRATION : son refus informe l'acteur que
 * quelqu'un d'autre l'a déjà fait, ce qui est une information utile. Un rang
 * déjà au rang demandé est l'ÉTAT QUE L'APPELANT A DEMANDÉ : lui rendre une
 * erreur ferait échouer un geste réussi — et le rejeu vient d'un retry après
 * délai, d'un drain d'outbox ou d'un double tap, jamais d'une intention de
 * conflit.
 *
 * **Les témoins portent le REJEU** : au rang nominal (un vrai changement), la
 * forme juste et le défaut rendent le MÊME verdict.
 */
describe('reposer le même rang n\'écrit, ne diffuse et ne notifie rien (#17078)', () => {
  const avis = () => ({ createMemberRoleChangedNotification: jest.fn<any>().mockResolvedValue(undefined) });

  it('un rejeu n\'écrit pas, ne diffuse pas, ne notifie pas — et répond quand même', async () => {
    const prisma = fabriquerPrisma({
      cible: {
        id: CIBLE_PART_ID, userId: CIBLE_USER_ID, role: 'moderator', isActive: true,
        leftAt: null, bannedAt: null, displayName: 'Bob', shareLinkId: null,
      },
    });
    const socket = fabriquerSocket();
    const notifications = avis();

    const verdict = await changerRangDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      targetKey: CIBLE_USER_ID,
      role: 'moderator',
      currentUserId: ACTEUR_ID,
      viewer: null,
      socketIO: socket.passerelle as any,
      notifications: notifications as any,
    });

    expect(verdict.genre).toBe('ok');
    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(socket.emissions).toEqual([]);
    expect(notifications.createMemberRoleChangedNotification).not.toHaveBeenCalled();
  });

  it('la casse du rang demandé ne fabrique pas un faux changement', async () => {
    // `member` → `MEMBER` : la casse seule change. Un rang PLUS ÉLEVÉ se
    // heurterait à la règle d'autorité entre pairs, qui est une AUTRE règle et
    // rendrait un refus — donc un témoin qui ne verrait rien de l'idempotence.
    const prisma = fabriquerPrisma({
      cible: {
        id: CIBLE_PART_ID, userId: CIBLE_USER_ID, role: 'member', isActive: true,
        leftAt: null, bannedAt: null, displayName: 'Bob', shareLinkId: null,
      },
    });
    const socket = fabriquerSocket();

    const verdict = await changerRangDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      targetKey: CIBLE_USER_ID,
      role: 'MEMBER',
      currentUserId: ACTEUR_ID,
      viewer: null,
      socketIO: socket.passerelle as any,
      notifications: null,
    });

    expect(verdict.genre).toBe('ok');
    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(socket.emissions).toEqual([]);
  });

  // NÉGATIF, vert des deux côtés : un vrai changement écrit, diffuse et
  // notifie. Il ne peut pas voir le défaut — c'est pourquoi les deux témoins
  // ci-dessus portent le rejeu — et il interdit que le correctif se paie en
  // supprimant le geste.
  it('un changement RÉEL écrit, diffuse et notifie', async () => {
    const prisma = fabriquerPrisma();
    const socket = fabriquerSocket();
    const notifications = avis();

    const verdict = await changerRangDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      targetKey: CIBLE_USER_ID,
      role: 'moderator',
      currentUserId: ACTEUR_ID,
      viewer: null,
      socketIO: socket.passerelle as any,
      notifications: notifications as any,
    });

    expect(verdict.genre).toBe('ok');
    expect(prisma.participant.update).toHaveBeenCalledTimes(1);
    expect(socket.emissions.map((e) => e.event)).toContain('participant:role-updated');
    expect(notifications.createMemberRoleChangedNotification).toHaveBeenCalledTimes(1);
  });
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

/**
 * #15987 — la capacité servie au lecteur SUIT son rang. `participant:role-updated`
 * ne touche pas `conversation.updatedAt` : sans la capacité recalculée dans
 * l'événement, un membre promu garderait le `canMakeObsolete: false` de son
 * ancien rang jusqu'au prochain rechargement complet.
 */
describe('participant:role-updated porte à la CIBLE sa capacité recalculée (#15987)', () => {
  const attendreLesLectures = () => new Promise((resolve) => setImmediate(resolve));

  async function changerLeRang(role: string, rangRelu: string) {
    const prisma = fabriquerPrisma({ rangRelu, rangDemandeur: 'creator', cible: {
      id: CIBLE_PART_ID, userId: CIBLE_USER_ID, role: role === 'admin' ? 'member' : 'admin', isActive: true,
      leftAt: null, bannedAt: null, displayName: 'Bob', shareLinkId: null,
    } });
    const socket = fabriquerSocket();
    const verdict = await changerRangDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      targetKey: CIBLE_USER_ID,
      role,
      currentUserId: ACTEUR_ID,
      viewer: null,
      socketIO: socket.passerelle as any,
      notifications: null,
    });
    expect(verdict.genre).toBe('ok');
    await attendreLesLectures();
    return socket.emissions.filter((e) => e.event === 'participant:role-updated');
  }

  it('un membre PROMU administrateur reçoit, dans SA room, canMakeObsolete: true', async () => {
    const emissions = await changerLeRang('admin', 'admin');

    const pourLaCible = emissions.find((e) => e.room === `user:${CIBLE_USER_ID}`);
    expect(pourLaCible).toBeDefined();
    expect(pourLaCible!.payload).toMatchObject({ userId: CIBLE_USER_ID, newRole: 'admin', viewerCapabilities: { canMakeObsolete: true } });
  });

  it('un administrateur RÉTROGRADÉ membre reçoit canMakeObsolete: false', async () => {
    const emissions = await changerLeRang('member', 'member');

    const pourLaCible = emissions.find((e) => e.room === `user:${CIBLE_USER_ID}`);
    expect(pourLaCible!.payload.viewerCapabilities).toEqual({ canMakeObsolete: false });
  });

  it('la salle reçoit l’événement SANS capacité, et la cible ne le reçoit qu’une fois', async () => {
    const emissions = await changerLeRang('admin', 'admin');

    const salle = emissions.find((e) => e.room === `conversation:${CONV_ID}`);
    expect(salle).toBeDefined();
    expect(salle!.excepts).toEqual([`user:${CIBLE_USER_ID}`]);
    expect('viewerCapabilities' in salle!.payload).toBe(false);
    expect(emissions).toHaveLength(2);
  });

  it('une lecture de capacité qui échoue livre tout de même l’événement à la cible, sans capacité', async () => {
    const prisma = fabriquerPrisma({ rangRelu: 'admin' });
    prisma.user.findMany.mockRejectedValue(new Error('mongo indisponible'));
    const socket = fabriquerSocket();
    await changerRangDeParticipant({
      prisma: prisma as any,
      conversationIdentifier: CONV_ID,
      targetKey: CIBLE_USER_ID,
      role: 'admin',
      currentUserId: ACTEUR_ID,
      viewer: null,
      socketIO: socket.passerelle as any,
      notifications: null,
    });
    await attendreLesLectures();

    const pourLaCible = socket.emissions.find((e) => e.room === `user:${CIBLE_USER_ID}`);
    expect(pourLaCible).toBeDefined();
    expect(pourLaCible!.payload.newRole).toBe('admin');
    expect('viewerCapabilities' in pourLaCible!.payload).toBe(false);
  });

  it('deux changements rapprochés : la cible reçoit ses exemplaires dans l’ORDRE, le dernier dit l’état final', async () => {
    const lectures: Array<() => void> = [];
    let rangEnBase = 'admin';
    const prisma = {
      user: {
        findMany: jest.fn<any>().mockImplementation(() => new Promise((resolve) => {
          lectures.push(() => resolve([{ id: CIBLE_USER_ID, role: 'USER' }]));
        })),
      },
      participant: {
        findMany: jest.fn<any>().mockImplementation(async () => [{
          conversationId: CONV_ID, userId: CIBLE_USER_ID, role: rangEnBase, type: 'user',
          leftAt: null, bannedAt: null, conversation: { type: 'group', identifier: null },
        }]),
        groupBy: jest.fn<any>().mockResolvedValue([]),
      },
    };
    const socket = fabriquerSocket();
    const io = socket.passerelle.getManager().getIO() as any;
    const annonce = (newRole: string) => announceParticipantRoleWithCapabilities(prisma as any, {
      io,
      payload: { conversationId: CONV_ID, userId: CIBLE_USER_ID, newRole, updatedBy: ACTEUR_ID },
      onError: () => undefined,
    });

    const promotion = annonce('admin');
    rangEnBase = 'member';
    const retrogradation = annonce('member');
    await attendreLesLectures();
    expect(lectures).toHaveLength(1);
    lectures[0]();
    await attendreLesLectures();
    expect(lectures).toHaveLength(2);
    lectures[1]();
    await Promise.all([promotion, retrogradation]);

    const pourLaCible = socket.emissions.filter((e) => e.room === `user:${CIBLE_USER_ID}`);
    expect(pourLaCible.map((e) => e.payload.newRole)).toEqual(['admin', 'member']);
    expect(pourLaCible[1].payload.viewerCapabilities).toEqual({ canMakeObsolete: false });
  });
});
