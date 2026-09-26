/**
 * « X a rejoint Meeshy » (#8105) — la partie SERVEUR.
 *
 * Quand un compte s'inscrit, ou vérifie un numéro / un e-mail, chaque
 * utilisateur dont le carnet (`UserContact`) contient cet identifiant est
 * prévenu — une fois par paire, dans SA langue, avec le nom sous lequel IL
 * connaît la personne, et sans jamais recevoir l'identifiant apparié.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => {
  const log = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { child: () => log }, notificationLogger: log };
});

import { announceContactJoined, scheduleContactJoinedAnnouncement, CONTACT_JOINED_GROUPING_WINDOW_MS } from '../contact-joined';
import { clearPrivacyPreferencesCache } from '../../preferences/privacy-cache';

const MARIE = '507f1f77bcf86cd799439011';
const PAUL = '507f1f77bcf86cd799439012';
const ANNA = '507f1f77bcf86cd799439021';
const BOB = '507f1f77bcf86cd799439022';
const ZOE = '507f1f77bcf86cd799439023';
const NOW = new Date('2026-09-26T12:00:00.000Z');

type Row = { id: string; ownerId: string; displayName: string | null; phoneNumbers: string[]; emails: string[]; matchedUserId: string | null };

const arrivant = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  username: `u-${id.slice(-2)}`,
  displayName: 'Marie Curie',
  firstName: 'Marie',
  lastName: 'Curie',
  avatar: 'https://cdn/marie.jpg',
  phoneNumber: '+33612345678',
  phoneVerifiedAt: new Date('2026-09-26T11:59:00Z'),
  email: 'marie@exemple.fr',
  emailVerifiedAt: null,
  isActive: true,
  deletedAt: null,
  ...overrides,
});

const destinataire = (id: string, systemLanguage = 'fr') => ({
  id, isActive: true, deletedAt: null, systemLanguage, regionalLanguage: null,
  customDestinationLanguage: null, deviceLocale: null,
});

function monde(options: {
  joiner?: Record<string, unknown> | null;
  rows?: Row[];
  recipients?: ReturnType<typeof destinataire>[];
  hiding?: readonly string[];
  blockedBy?: readonly string[];
  friends?: readonly string[];
  notices?: Array<{ recipientId: string; joinerId: string }>;
  pending?: Array<Record<string, unknown>>;
} = {}) {
  const notices = [...(options.notices ?? [])];
  const joiner = options.joiner === undefined ? arrivant(MARIE) : options.joiner;
  const rows = options.rows ?? [];
  const prisma = {
    user: {
      findUnique: jest.fn<any>(async (args: any) => {
        if (args.where.id === joiner?.id) return joiner;
        return { id: args.where.id, blockedUserIds: [] };
      }),
      findMany: jest.fn<any>(async (args: any) => {
        if (args.where?.blockedUserIds) return (options.blockedBy ?? []).map((id) => ({ id }));
        const ids: string[] = args.where?.id?.in ?? [];
        return (options.recipients ?? []).filter((r) => ids.includes(r.id));
      }),
    },
    userContact: {
      findMany: jest.fn<any>(async () => rows),
      updateMany: jest.fn<any>(async () => ({ count: 0 })),
    },
    userPreferences: {
      findMany: jest.fn<any>(async (args: any) =>
        (args.where.userId.in as string[]).map((userId) => ({ userId, privacy: { hideProfileFromSearch: (options.hiding ?? []).includes(userId) } }))),
    },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    friendRequest: {
      findMany: jest.fn<any>(async () => (options.friends ?? []).map((id) => ({ senderId: MARIE, receiverId: id }))),
    },
    contactJoinNotice: {
      findMany: jest.fn<any>(async (args: any) =>
        notices.filter((n) => n.joinerId === args.where.joinerId && (args.where.recipientId.in as string[]).includes(n.recipientId))),
      create: jest.fn<any>(async (args: any) => {
        const { recipientId, joinerId } = args.data;
        if (notices.some((n) => n.recipientId === recipientId && n.joinerId === joinerId)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        notices.push({ recipientId, joinerId });
        return args.data;
      }),
    },
    notification: {
      findFirst: jest.fn<any>(async (args: any) =>
        (options.pending ?? []).find((n) => n.userId === args.where.userId) ?? null),
      update: jest.fn<any>(async (args: any) => args.data),
    },
  };
  const createNotification = jest.fn<any>(async (params: any) => ({ id: `n-${params.userId}`, ...params }));
  return { prisma, createNotification, notices };
}

const run = (m: ReturnType<typeof monde>, joinerId = MARIE) =>
  announceContactJoined({ prisma: m.prisma as never, notifications: { createNotification: m.createNotification }, now: () => NOW }, joinerId);

const ligne = (id: string, ownerId: string, displayName: string | null, extra: Partial<Row> = {}): Row => ({
  id, ownerId, displayName, phoneNumbers: ['+33612345678'], emails: [], matchedUserId: null, ...extra,
});

beforeEach(() => clearPrivacyPreferencesCache());

describe('prévenir chaque carnet qui contient l’arrivant', () => {
  it('notifie le propriétaire du carnet, dans SA langue, sous le nom de SON carnet', async () => {
    const m = monde({
      rows: [ligne('c1', ANNA, 'Maman'), ligne('c2', BOB, null)],
      recipients: [destinataire(ANNA, 'fr'), destinataire(BOB, 'en')],
    });

    const rapport = await run(m);

    expect(rapport.notified).toBe(2);
    const [pourAnna, pourBob] = [ANNA, BOB].map((id) => m.createNotification.mock.calls.map((c: any) => c[0]).find((p: any) => p.userId === id));
    expect(pourAnna).toMatchObject({ type: 'contact_joined', lang: 'fr', content: 'Dites-lui bonjour 👋' });
    expect(pourAnna.actor).toEqual({ id: MARIE, username: 'u-11', displayName: 'Maman', avatar: 'https://cdn/marie.jpg' });
    expect(pourBob).toMatchObject({ lang: 'en', content: 'Say hello 👋' });
    expect(pourBob.actor.displayName).toBe('Marie Curie');
  });

  it('la charge ne transporte JAMAIS l’identifiant apparié', async () => {
    const m = monde({ rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)] });

    await run(m);

    const charge = JSON.stringify(m.createNotification.mock.calls[0][0]);
    expect(charge).not.toContain('+33612345678');
    expect(charge).not.toContain('marie@exemple.fr');
    expect(m.createNotification.mock.calls[0][0].metadata).toEqual({ action: 'view_profile', joinerIds: [MARIE], joinerCount: 1 });
  });

  it('rapproche le carnet : matchedUserId / matchedBy / matchedAt posés', async () => {
    const m = monde({ rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)] });

    await run(m);

    expect(m.prisma.userContact.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1'] } },
      data: { matchedUserId: MARIE, matchedBy: 'phone', matchedAt: NOW },
    });
  });

  it('un seul avis par destinataire même si son carnet a deux fiches de l’arrivant', async () => {
    const m = monde({
      rows: [ligne('c1', ANNA, 'Maman'), ligne('c2', ANNA, 'Marie C.')],
      recipients: [destinataire(ANNA)],
    });

    await run(m);

    expect(m.createNotification).toHaveBeenCalledTimes(1);
  });
});

describe('ce qui ne se prévient pas', () => {
  it('n’apparie que des identifiants VÉRIFIÉS', async () => {
    const m = monde({
      joiner: arrivant(MARIE, { phoneVerifiedAt: null, emailVerifiedAt: null }),
      rows: [ligne('c1', ANNA, 'Maman')],
      recipients: [destinataire(ANNA)],
    });

    expect((await run(m)).notified).toBe(0);
    expect(m.prisma.userContact.findMany).not.toHaveBeenCalled();
  });

  it('pas si l’arrivant a demandé à ne pas être trouvé', async () => {
    const m = monde({ rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)], hiding: [MARIE] });

    expect((await run(m)).notified).toBe(0);
    expect(m.prisma.userContact.updateMany).not.toHaveBeenCalled();
  });

  it('pas si l’un a bloqué l’autre', async () => {
    const m = monde({ rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)], blockedBy: [ANNA] });

    expect((await run(m)).notified).toBe(0);
  });

  it('pas à soi-même', async () => {
    const m = monde({ rows: [ligne('c1', MARIE, 'Moi')], recipients: [destinataire(MARIE)] });

    expect((await run(m)).notified).toBe(0);
  });

  it('pas à un ami déjà accepté — il le sait', async () => {
    const m = monde({ rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)], friends: [ANNA] });

    expect((await run(m)).notified).toBe(0);
  });

  it('une seule fois par paire : la seconde vérification ne renotifie pas', async () => {
    const m = monde({ rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)] });

    await run(m);
    await run(m);

    expect(m.createNotification).toHaveBeenCalledTimes(1);
  });

  it('une course perdue sur l’unicité (P2002) ne notifie pas', async () => {
    const m = monde({ rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)] });
    m.prisma.contactJoinNotice.findMany.mockResolvedValueOnce([]);
    m.notices.push({ recipientId: ANNA, joinerId: MARIE });

    expect((await run(m)).notified).toBe(0);
    expect(m.createNotification).not.toHaveBeenCalled();
  });

  it('un compte désactivé ne s’annonce pas', async () => {
    const m = monde({ joiner: arrivant(MARIE, { isActive: false }), rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)] });

    expect((await run(m)).notified).toBe(0);
  });
});

describe('regroupement : pas de rafale chez un même destinataire', () => {
  it('une annonce non lue récente est ENRICHIE au lieu d’en créer une seconde', async () => {
    const recente = {
      id: 'n-exist', userId: ANNA, type: 'contact_joined', isRead: false,
      createdAt: new Date(NOW.getTime() - CONTACT_JOINED_GROUPING_WINDOW_MS / 2),
      actor: { id: PAUL, username: 'paul', displayName: 'Paul', avatar: null },
      metadata: { action: 'view_profile', joinerIds: [PAUL, ZOE], joinerCount: 2 },
    };
    const m = monde({ rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)], pending: [recente] });

    const rapport = await run(m);

    expect(rapport).toMatchObject({ notified: 0, grouped: 1 });
    expect(m.createNotification).not.toHaveBeenCalled();
    const where = m.prisma.notification.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: ANNA, type: 'contact_joined', isRead: false });
    expect(where.createdAt.gte.getTime()).toBe(NOW.getTime() - CONTACT_JOINED_GROUPING_WINDOW_MS);
    const { data } = m.prisma.notification.update.mock.calls[0][0];
    expect(data.title).toBe('Maman et 2 autres de vos contacts sont sur Meeshy !');
    expect(data.content).toBe('Dites-leur bonjour 👋');
    expect(data.metadata).toEqual({ action: 'view_profile', joinerIds: [MARIE, PAUL, ZOE], joinerCount: 3 });
    expect(data.actor.id).toBe(MARIE);
  });
});

describe('scheduleContactJoinedAnnouncement — le point d’entrée des portes', () => {
  it('part APRÈS la réponse, par l’exécuteur fourni', async () => {
    const m = monde({ rows: [ligne('c1', ANNA, 'Maman')], recipients: [destinataire(ANNA)] });
    const differees: Array<() => Promise<void>> = [];

    scheduleContactJoinedAnnouncement(m.prisma as never, MARIE, {
      notifications: { createNotification: m.createNotification },
      afterResponse: (task) => { differees.push(task); },
    });

    expect(m.createNotification).not.toHaveBeenCalled();
    await differees[0]!();
    expect(m.createNotification).toHaveBeenCalledTimes(1);
  });

  it('sans service de notification (seed, tests), ne programme rien', () => {
    const programme = jest.fn();

    scheduleContactJoinedAnnouncement({} as never, MARIE, { afterResponse: programme });

    expect(programme).not.toHaveBeenCalled();
  });
});
