/**
 * #13935 — qui peut parler à qui par le talkie : dès Proche, sous la préférence de
 * réception du destinataire (#14407), jamais dans une paire chiffrée de bout en bout
 * (E10, #14408), et en repli vocal quand l'autre est en appel, en Ne pas déranger ou
 * déconnecté.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { judgeTalkie, type TalkieGateDb } from '../../../../services/talkie/talkieGate';
import { relationStore } from '../../../helpers/user-relation-store';
import { AUTRE, MOI, NOW, lien } from '../../../helpers/relation-app';

type Options = {
  readonly level?: string;
  readonly blocked?: boolean;
  readonly talkieBlocked?: boolean;
  readonly notification?: Record<string, unknown>;
  readonly e2eeDirect?: boolean;
  readonly inCall?: boolean;
  readonly connected?: boolean;
};

function db(options: Options = {}) {
  const store = relationStore({ relations: options.level ? [lien(options.level, options.level)] : [] });
  const users = new Map([MOI, AUTRE].map((id) => [id, { id, deactivatedAt: null, birthDate: null, blockedUserIds: options.blocked && id === AUTRE ? [MOI] : [] }]));
  const participantFindMany = jest.fn(async (args: { where: { conversation: { is: { encryptionMode: string } } } }) =>
    options.e2eeDirect && args.where.conversation.is.encryptionMode === 'e2ee' ? [{ conversationId: 'c1' }] : []);
  return {
    user: {
      findUnique: async (args: { where: { id: string } }) => users.get(args.where.id) ?? null,
      findFirst: async (args: { where: { OR: Array<{ id: string; blockedUserIds: { has: string } }> } }) =>
        args.where.OR.map((b) => users.get(b.id)).find((u, i) => u !== undefined && u.blockedUserIds.includes(args.where.OR[i].blockedUserIds.has)) ?? null,
    },
    friendRequest: store.prisma.friendRequest,
    userRelation: store.prisma.userRelation,
    relationFeatureSetting: { findUnique: async () => (options.talkieBlocked ? { talkieBlockedAt: NOW } : null) },
    userPreferences: { findUnique: async () => (options.notification ? { notification: options.notification } : null) },
    participant: { findMany: participantFindMany, findFirst: async () => (options.e2eeDirect ? { id: 'p' } : null) },
    callParticipant: { findFirst: async () => (options.inCall ? { id: 'cp' } : null) },
    participantFindMany,
  };
}

const juger = (options: Options = {}) => {
  const prisma = db(options);
  return judgeTalkie({ prisma: prisma as unknown as TalkieGateDb, now: () => NOW, recipientConnected: async () => options.connected ?? true }, MOI, AUTRE)
    .then((verdict) => ({ verdict, prisma }));
};

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
});

describe('#13935 / #14407 — la préférence de réception, active par défaut', () => {
  it('coupée pour moi par le destinataire : TALKIE_BLOCKED', async () => {
    expect((await juger({ level: 'CLOSE', talkieBlocked: true })).verdict).toMatchObject({ ok: false, code: 'TALKIE_BLOCKED' });
  });

  it('coupée pour tous (« Recevoir le talkie ») : TALKIE_BLOCKED', async () => {
    expect((await juger({ level: 'CLOSE', notification: { talkieEnabled: false } })).verdict).toMatchObject({ ok: false, code: 'TALKIE_BLOCKED' });
  });
});

describe('#14408 (E10) — jamais de clair à côté d’une conversation chiffrée', () => {
  it('la conversation directe de la paire est E2EE : TALKIE_E2EE_CONVERSATION', async () => {
    expect((await juger({ level: 'BLOOD', e2eeDirect: true })).verdict).toMatchObject({ ok: false, code: 'TALKIE_E2EE_CONVERSATION' });
  });

  it('le chiffrement ne se juge qu’APRÈS la loi : un lien trop faible n’apprend rien du chiffrement de la paire', async () => {
    const { verdict, prisma } = await juger({ level: 'FRIEND', e2eeDirect: true });

    expect(verdict).toMatchObject({ code: 'TALKIE_NOT_ALLOWED' });
    expect(prisma.participantFindMany).not.toHaveBeenCalled();
  });

  it('la recherche ne vise que les conversations DIRECTES chiffrées de bout en bout, actives', async () => {
    const { prisma } = await juger({ level: 'CLOSE' });

    expect(prisma.participantFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: MOI, isActive: true, conversation: { is: { type: 'direct', encryptionMode: 'e2ee' } } },
    }));
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
});
