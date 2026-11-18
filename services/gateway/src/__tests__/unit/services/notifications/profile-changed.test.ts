/**
 * #19384 — UNE FICHE OUVERTE SE RAFRAÎCHIT QUAND SON SUJET LA CHANGE.
 *
 * `user:profile-changed` est un signal SANS contenu : la ville, les adresses et le
 * décor dépendent du cercle du lecteur, rien ne peut donc voyager dans une charge
 * commune. Ce qui se garde ici est l'AUDIENCE : les liés de niveau Connaissance ou
 * plus et les partenaires de conversation, hors blocage, jamais le sujet.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { RelationLevel } from '@meeshy/shared/types/relation';

const mockComptesLies = jest.fn<(prisma: unknown, sujet: string) => Promise<{ id: string; niveau: RelationLevel }[]>>();
const mockPartners = jest.fn<(prisma: unknown, userId: string) => Promise<string[]>>();
const mockBlocked = jest.fn<(prisma: unknown, userId: string) => Promise<Set<string>>>();

jest.mock('../../../../services/friendship', () => ({
  comptesLies: (prisma: unknown, sujet: string) => mockComptesLies(prisma, sujet),
}));
jest.mock('../../../../utils/conversation-partners', () => ({
  getDistinctConversationPartnerUserIds: (prisma: unknown, userId: string) => mockPartners(prisma, userId),
}));
jest.mock('../../../../utils/blocking', () => ({
  getBlockRelatedUserIds: (prisma: unknown, userId: string) => mockBlocked(prisma, userId),
}));

import {
  announceProfileChanged,
  emitProfileChanged,
  profileChangedAudience,
  touchesProfileFiche,
} from '../../../../services/notifications/profile-changed';

const SUBJECT = 'subject-0000000000000001';
const AT = new Date('2026-11-17T10:00:00.000Z');
const prisma = {} as never;

const makeIO = () => {
  const emit = jest.fn();
  const to = jest.fn((_room: string) => ({ emit }));
  return { io: { to, emit } as never, to, emit };
};

const given = (opts: {
  liens?: { id: string; niveau: RelationLevel }[];
  partenaires?: string[];
  bloques?: string[];
}) => {
  mockComptesLies.mockResolvedValue(opts.liens ?? []);
  mockPartners.mockResolvedValue(opts.partenaires ?? []);
  mockBlocked.mockResolvedValue(new Set(opts.bloques ?? []));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('profileChangedAudience — qui revalide la fiche', () => {
  it('retient Connaissance et au-dessus, écarte Communauté et Public', async () => {
    given({
      liens: [
        { id: 'connaissance', niveau: 'ACQUAINTANCE' },
        { id: 'proche', niveau: 'CLOSE' },
        { id: 'communaute', niveau: 'COMMUNITY' },
        { id: 'public', niveau: 'PUBLIC' },
      ],
    });
    const audience = await profileChangedAudience(prisma, SUBJECT);
    expect([...audience].sort()).toEqual(['connaissance', 'proche']);
  });

  it('ajoute les partenaires de conversation, même sans lien (ils ont la fiche en cache)', async () => {
    given({ liens: [{ id: 'communaute', niveau: 'COMMUNITY' }], partenaires: ['communaute', 'inconnu-du-fil'] });
    const audience = await profileChangedAudience(prisma, SUBJECT);
    expect([...audience].sort()).toEqual(['communaute', 'inconnu-du-fil']);
  });

  it('retire tout blocage, dans un sens ou dans l’autre — lien ou partenaire', async () => {
    given({
      liens: [{ id: 'ami-bloque', niveau: 'FRIEND' }, { id: 'ami', niveau: 'FRIEND' }],
      partenaires: ['partenaire-bloque'],
      bloques: ['ami-bloque', 'partenaire-bloque'],
    });
    expect(await profileChangedAudience(prisma, SUBJECT)).toEqual(['ami']);
  });

  it('n’inclut jamais le sujet et ne double personne', async () => {
    given({ liens: [{ id: 'ami', niveau: 'FRIEND' }], partenaires: ['ami', SUBJECT] });
    expect(await profileChangedAudience(prisma, SUBJECT)).toEqual(['ami']);
  });
});

describe('emitProfileChanged — le signal sans contenu', () => {
  it('part vers la room personnelle de chaque lecteur, avec le seul sujet et son horloge', async () => {
    given({ liens: [{ id: 'connaissance', niveau: 'ACQUAINTANCE' }], partenaires: ['partenaire'] });
    const { io, to, emit } = makeIO();

    await emitProfileChanged({ io, prisma }, { userId: SUBJECT, updatedAt: AT });

    expect(to.mock.calls.map(([room]) => room).sort()).toEqual([ROOMS.user('connaissance'), ROOMS.user('partenaire')].sort());
    expect(emit).toHaveBeenCalledTimes(2);
    for (const [event, payload] of emit.mock.calls) {
      expect(event).toBe(SERVER_EVENTS.USER_PROFILE_CHANGED);
      expect(payload).toEqual({ userId: SUBJECT, updatedAt: AT.toISOString() });
    }
  });

  it('ne part vers personne quand le sujet n’a ni lien ni partenaire', async () => {
    given({ liens: [{ id: 'communaute', niveau: 'COMMUNITY' }] });
    const { io, emit } = makeIO();
    await emitProfileChanged({ io, prisma }, { userId: SUBJECT, updatedAt: AT });
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('announceProfileChanged — canal latéral, jamais bloquant', () => {
  it('est un no-op sans couche Socket.IO', async () => {
    given({ liens: [{ id: 'ami', niveau: 'FRIEND' }] });
    const fastify = { prisma, log: { warn: jest.fn(), error: jest.fn() } } as never;
    await expect(announceProfileChanged(fastify, { userId: SUBJECT, updatedAt: AT })).resolves.toBeUndefined();
    expect(mockComptesLies).not.toHaveBeenCalled();
  });

  it('avale l’échec d’une lecture d’audience : l’écriture REST ne tombe pas', async () => {
    mockComptesLies.mockRejectedValue(new Error('mongo down'));
    mockPartners.mockResolvedValue([]);
    mockBlocked.mockResolvedValue(new Set());
    const { io } = makeIO();
    const fastify = { prisma, log: { warn: jest.fn(), error: jest.fn() }, socketIOHandler: { io } } as never;
    await expect(announceProfileChanged(fastify, { userId: SUBJECT, updatedAt: AT })).resolves.toBeUndefined();
  });

  it('émet par la couche Socket.IO de l’instance', async () => {
    given({ liens: [{ id: 'ami', niveau: 'FRIEND' }] });
    const { io, emit } = makeIO();
    const fastify = { prisma, log: { warn: jest.fn(), error: jest.fn() }, socketIOHandler: { io } } as never;
    await announceProfileChanged(fastify, { userId: SUBJECT, updatedAt: AT });
    expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.USER_PROFILE_CHANGED, { userId: SUBJECT, updatedAt: AT.toISOString() });
  });
});

describe('touchesProfileFiche — ce qui, dans PATCH /users/me, change la fiche', () => {
  it.each(['bio', 'city', 'cityCircle', 'systemLanguage', 'regionalLanguage', 'customDestinationLanguage', 'voicePublic'])(
    '%s change la fiche',
    (field) => {
      expect(touchesProfileFiche({ [field]: field === 'voicePublic' ? false : '' })).toBe(true);
    },
  );

  it('un réglage hors fiche, ou un nom (déjà porté par user:updated), ne la change pas', () => {
    expect(touchesProfileFiche({ autoTranslateEnabled: true })).toBe(false);
    expect(touchesProfileFiche({ displayName: 'Ada' })).toBe(false);
    expect(touchesProfileFiche({})).toBe(false);
  });
});
