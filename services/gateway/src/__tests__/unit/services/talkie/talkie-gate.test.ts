/**
 * #13935 — qui peut parler à qui par le talkie : dès Proche, sous la préférence de
 * réception du destinataire (#14407), jamais dans une paire que le serveur ne lit pas
 * (E10, #14408 : filtre canonique, toute casse, tout mode inconnu), et en repli vocal
 * quand l'autre est en appel, en Ne pas déranger, déconnecté — ou quand sa présence
 * n'est pas servie (audit #14459, M2 : le même code, quel que soit l'état).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { TALKIE_NOT_ALLOWED, judgeTalkie, type TalkieGateDb } from '../../../../services/talkie/talkieGate';
import { TALKIE_ERROR_CODES } from '@meeshy/shared/types/talkie';
import { relationStore } from '../../../helpers/user-relation-store';
import { matchesMongoWhere } from '../../../helpers/mongo-where';
import { AUTRE, MOI, NOW, lien } from '../../../helpers/relation-app';

type Options = {
  readonly level?: string;
  readonly blocked?: boolean;
  readonly talkieBlocked?: boolean;
  readonly notification?: Record<string, unknown>;
  /** Le mode de chiffrement de la conversation directe de la paire ; absent ⇒ pas de conversation. */
  readonly directMode?: string | null | 'absent';
  readonly inCall?: boolean;
  readonly connected?: boolean;
  readonly presenceServed?: boolean;
  readonly recipient?: Record<string, unknown>;
  readonly sender?: Record<string, unknown>;
};

function db(options: Options = {}) {
  const store = relationStore({ relations: options.level ? [lien(options.level, options.level)] : [] });
  const users = new Map([MOI, AUTRE].map((id) => [id, {
    id, role: 'USER', isActive: true, deletedAt: null, deactivatedAt: null, birthDate: null,
    blockedUserIds: options.blocked && id === AUTRE ? [MOI] : [],
    ...(id === AUTRE ? options.recipient ?? {} : options.sender ?? {}),
  }]));
  const conversation = options.directMode === undefined
    ? null
    : { id: 'c1', type: 'direct', ...(options.directMode === 'absent' ? {} : { encryptionMode: options.directMode }) };
  const participants = conversation ? [MOI, AUTRE].map((userId) => ({ id: `p-${userId}`, userId, isActive: true, conversationId: 'c1', conversation })) : [];
  const participantFindMany = jest.fn(async (args: { where: Record<string, unknown> }) =>
    participants.filter((p) => matchesMongoWhere(p as never, args.where as never)).map((p) => ({ id: p.id, conversationId: p.conversationId })));
  const accountParticipants = jest.fn(async (args: { where: { userId: string } }) => [{ id: `p-${args.where.userId}` }]);
  return {
    user: {
      findUnique: async (args: { where: { id: string } }) => users.get(args.where.id) ?? null,
      findFirst: async (args: { where: { OR: Array<{ id: string; blockedUserIds: { has: string } }> } }) =>
        args.where.OR.map((b) => users.get(b.id)).find((u, i) => u !== undefined && (u.blockedUserIds as string[]).includes(args.where.OR[i].blockedUserIds.has)) ?? null,
    },
    friendRequest: store.prisma.friendRequest,
    userRelation: store.prisma.userRelation,
    relationFeatureSetting: { findUnique: async () => (options.talkieBlocked ? { talkieBlockedAt: NOW } : null) },
    userPreferences: { findUnique: async () => (options.notification ? { notification: options.notification } : null) },
    participant: {
      findMany: (args: { where: Record<string, unknown> }) =>
        ('conversation' in args.where ? participantFindMany(args) : accountParticipants(args as { where: { userId: string } })),
      findFirst: async (args: { where: { userId: string; conversationId: { in: string[] } } }) =>
        participants.find((p) => p.userId === args.where.userId && args.where.conversationId.in.includes(p.conversationId)) ?? null,
    },
    callParticipant: {
      findFirst: async (args: { where: { participantId: { in: string[] } } }) =>
        (options.inCall && args.where.participantId.in.includes(`p-${AUTRE}`) ? { id: 'cp' } : null),
    },
    participantFindMany,
  };
}

const juger = async (options: Options = {}) => {
  const prisma = db(options);
  const presenceServed = jest.fn(async (_viewer: { userId: string; role: string }, _targetId: string) => options.presenceServed ?? true);
  const recipientConnected = jest.fn(async () => options.connected ?? true);
  const verdict = await judgeTalkie({ prisma: prisma as unknown as TalkieGateDb, now: () => NOW, recipientConnected, presenceServed }, MOI, AUTRE);
  return { verdict, prisma, presenceServed, recipientConnected };
};

describe('#16623 — l\'équipe a le talkie sans lien', () => {
  const equipe = { sender: { role: 'MODERATOR' }, recipient: { role: 'ADMIN' } };

  it('deux comptes de l\'équipe sans lien : la voix passe', async () => {
    expect((await juger(equipe)).verdict).toEqual({ ok: true });
  });

  it('un compte de l\'équipe face à un utilisateur ordinaire : refusé comme un inconnu', async () => {
    const ordinaire = await juger({ recipient: { role: 'USER' } });
    expect((await juger({ sender: { role: 'ADMIN' }, recipient: { role: 'USER' } })).verdict).toEqual(ordinaire.verdict);
    expect(ordinaire.verdict).toEqual(TALKIE_NOT_ALLOWED);
  });

  it('un rôle de cible inconnu n\'ouvre rien', async () => {
    expect((await juger({ sender: { role: 'ADMIN' }, recipient: { role: 'SUPERADMIN' } })).verdict).toEqual(TALKIE_NOT_ALLOWED);
  });

  it('la réception reste celle du destinataire : le rôle ne franchit pas un talkie coupé', async () => {
    expect((await juger({ ...equipe, talkieBlocked: true })).verdict).toMatchObject({ ok: false, code: TALKIE_ERROR_CODES.BLOCKED });
    expect((await juger({ ...equipe, notification: { talkieEnabled: false } })).verdict).toMatchObject({ ok: false, code: TALKIE_ERROR_CODES.BLOCKED });
  });

  it('le blocage ferme entre deux comptes de l\'équipe', async () => {
    expect((await juger({ ...equipe, blocked: true })).verdict).toEqual(TALKIE_NOT_ALLOWED);
  });
});

describe('#13935 — la loi : dès Proche', () => {
  it.each(['CLOSE', 'BLOOD'])('%s : ouvert', async (level) => {
    expect((await juger({ level })).verdict).toEqual({ ok: true });
  });

  it.each([undefined, 'ACQUAINTANCE', 'FRIEND'])('sous Proche (%s) : TALKIE_NOT_ALLOWED', async (level) => {
    expect((await juger({ level })).verdict).toMatchObject({ ok: false, code: 'TALKIE_NOT_ALLOWED' });
  });

  it('un blocage entre les deux : TALKIE_NOT_ALLOWED, indistinct d’un lien trop faible', async () => {
    expect((await juger({ level: 'BLOOD', blocked: true })).verdict).toEqual((await juger({ level: 'FRIEND' })).verdict);
  });

  it.each([
    ['inactif', { isActive: false }],
    ['supprimé', { deletedAt: NOW }],
    ['désactivé', { deactivatedAt: NOW }],
  ])('un destinataire %s : TALKIE_NOT_ALLOWED, jamais un repli vocal vers lui', async (_cas, recipient) => {
    expect((await juger({ level: 'BLOOD', recipient })).verdict).toMatchObject({ ok: false, code: 'TALKIE_NOT_ALLOWED' });
  });
});

describe('#13935 / #14407 — la préférence de réception, active par défaut', () => {
  it('coupée pour moi par le destinataire : TALKIE_BLOCKED', async () => {
    expect((await juger({ level: 'CLOSE', talkieBlocked: true })).verdict).toMatchObject({ ok: false, code: 'TALKIE_BLOCKED' });
  });

  it('coupée pour tous (« Recevoir le talkie ») : TALKIE_BLOCKED', async () => {
    expect((await juger({ level: 'CLOSE', notification: { talkieEnabled: false } })).verdict).toMatchObject({ ok: false, code: 'TALKIE_BLOCKED' });
  });
});

describe('#14408 (E10) — jamais de clair à côté d’une conversation que le serveur ne lit pas', () => {
  it.each(['e2ee', 'E2EE', 'mls-futur'])('conversation directe en « %s » : TALKIE_E2EE_CONVERSATION', async (directMode) => {
    expect((await juger({ level: 'BLOOD', directMode })).verdict).toMatchObject({ ok: false, code: 'TALKIE_E2EE_CONVERSATION' });
  });

  it.each([['server'], ['hybrid'], [null], ['absent']])('conversation directe en « %s » : ouvert', async (directMode) => {
    expect((await juger({ level: 'BLOOD', directMode: directMode as string | null })).verdict).toEqual({ ok: true });
  });

  it('le chiffrement ne se juge qu’APRÈS la loi : un lien trop faible n’apprend rien du chiffrement de la paire', async () => {
    const { verdict, prisma } = await juger({ level: 'FRIEND', directMode: 'e2ee' });

    expect(verdict).toMatchObject({ code: 'TALKIE_NOT_ALLOWED' });
    expect(prisma.participantFindMany).not.toHaveBeenCalled();
  });
});

describe('#13935 — repli en message vocal', () => {
  it.each([
    ['en appel', { inCall: true }],
    ['sans appareil connecté', { connected: false }],
    ['en Ne pas déranger', { notification: { dndEnabled: true, dndStartTime: '00:00', dndEndTime: '23:59', dndDays: [] } }],
  ])('destinataire %s : TALKIE_FALLBACK_VOICE', async (_cas, options) => {
    expect((await juger({ level: 'CLOSE', ...options })).verdict).toMatchObject({ ok: false, code: 'TALKIE_FALLBACK_VOICE' });
  });

  it.each([
    ['disponible', {}],
    ['en appel', { inCall: true }],
    ['déconnecté', { connected: false }],
  ])('M2 — présence masquée, destinataire %s : le MÊME repli, sans lire sa disponibilité', async (_cas, options) => {
    const { verdict, recipientConnected } = await juger({ level: 'BLOOD', presenceServed: false, ...options });

    expect(verdict).toMatchObject({ ok: false, code: 'TALKIE_FALLBACK_VOICE' });
    expect(recipientConnected).not.toHaveBeenCalled();
  });

  it('la présence est demandée pour CE lecteur, avec son rôle', async () => {
    const { presenceServed } = await juger({ level: 'CLOSE' });

    expect(presenceServed).toHaveBeenCalledWith({ userId: MOI, role: 'USER' }, AUTRE);
  });
});

describe('#17094 — l’ouverture ne fait pas attendre ce qui peut se lire ensemble', () => {
  it('le chiffrement de la paire et la présence servie se lisent EN MÊME TEMPS, une fois la loi passée', async () => {
    const prisma = db({ level: 'CLOSE' });
    let releaseE2ee: () => void = () => undefined;
    const e2eeHeld = new Promise<void>((resolve) => { releaseE2ee = resolve; });
    const lookup = prisma.participant.findMany;
    prisma.participant.findMany = ((args: { where: Record<string, unknown> }) =>
      ('conversation' in args.where ? e2eeHeld.then(() => lookup(args)) : lookup(args))) as typeof lookup;
    const presenceServed = jest.fn(async () => true);
    const recipientConnected = jest.fn(async () => true);

    const judging = judgeTalkie({ prisma: prisma as unknown as TalkieGateDb, now: () => NOW, recipientConnected, presenceServed }, MOI, AUTRE);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    expect(presenceServed).toHaveBeenCalledTimes(1);
    releaseE2ee();
    expect(await judging).toEqual({ ok: true });
  });

  it('une paire chiffrée garde son refus même quand la présence n’est pas servie', async () => {
    expect((await juger({ level: 'BLOOD', directMode: 'e2ee', presenceServed: false })).verdict)
      .toMatchObject({ ok: false, code: 'TALKIE_E2EE_CONVERSATION' });
  });
});
