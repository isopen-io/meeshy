/**
 * Audit adversarial n°2 (A2-1, A2-2) — **la passe de conservation jugée sur des
 * DOCUMENTS, pas sur le texte de ses filtres.**
 *
 * Les collections sont des objets nus évalués par `helpers/mongo-where.ts`, qui
 * reproduit la sémantique MESURÉE contre mongo:8 (#8309) : un champ ABSENT n'est
 * pas `null`, et une négation (`NOT`, `not`, `notIn`) écarte le document qui
 * n'a pas la clé. Un témoin qui comparait le `where` à une copie de lui-même
 * gardait le défaut (mutant M6 de l'audit) : un ban écrit par
 * `BanService.createBan` n'a PAS de clé `liftedAt`, et `{ liftedAt: null }` ne
 * l'apparie pas — le compte banni n'était pas protégé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';
import { sweepRetention } from '../../../jobs/retention-sweep';
import {
  expiredSessionRetentionWhere,
  retainedSecurityEventWhere,
  retainedSessionWhere,
} from '../../../services/retention/retention-bounds';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const BANNED = '64b000000000000000000001';
const FREE = '64b000000000000000000002';
const LIFTED = '64b000000000000000000003';

type Collections = {
  ban: MongoDocument[];
  report: MongoDocument[];
  user: MongoDocument[];
  userSession: MongoDocument[];
  securityEvent: MongoDocument[];
  adminAuditLog: MongoDocument[];
};

const pick = (row: MongoDocument, select?: Record<string, boolean>) =>
  select ? Object.fromEntries(Object.keys(select).filter((k) => k in row).map((k) => [k, row[k]])) : row;

/** Un double Prisma minimal sur des tableaux — chaque lecture et écriture passe par `matchesMongoWhere`. */
const storeOf = (collections: Collections) => {
  // Copie à la main : `structuredClone` rend des `Date` d'un autre royaume, que
  // `instanceof Date` ne reconnaît pas dans le bac à sable de Jest.
  const data = Object.fromEntries(
    Object.entries(collections).map(([name, rows]) => [name, (rows as MongoDocument[]).map((row) => ({ ...row }))]),
  ) as Collections;
  const table = (name: keyof Collections) => ({
    findMany: async (args: { where?: MongoDocument; select?: Record<string, boolean> }) => {
      // Les filtres de relation (comptes purgés, anciens comptes) ne sont pas évalués ici :
      // ces étapes ont leurs propres témoins ; elles ne trouvent personne dans ce monde.
      if (name === 'user' && args?.where && JSON.stringify(args.where).match(/"(some|none)"/)) return [];
      return data[name].filter((row) => matchesMongoWhere(row, args?.where)).map((row) => pick(row, args?.select));
    },
    count: async (args: { where?: MongoDocument }) => data[name].filter((row) => matchesMongoWhere(row, args?.where)).length,
    deleteMany: async (args: { where?: MongoDocument }) => {
      const before = data[name].length;
      data[name] = data[name].filter((row) => !matchesMongoWhere(row, args?.where));
      return { count: before - data[name].length };
    },
    updateMany: async (args: { where?: MongoDocument; data: MongoDocument }) => {
      const hit = data[name].filter((row) => matchesMongoWhere(row, args?.where));
      hit.forEach((row) => Object.assign(row, args.data));
      return { count: hit.length };
    },
  });
  const prisma = {
    ban: table('ban'),
    report: table('report'),
    user: table('user'),
    userSession: table('userSession'),
    securityEvent: table('securityEvent'),
    adminAuditLog: table('adminAuditLog'),
  };
  return { prisma, data };
};

const oldTraces = (userId: string) => ({
  user: { id: userId, createdAt: daysAgo(800), registrationIp: '203.0.113.7', registrationLocation: 'Paris, France' },
  session: { id: `s-${userId}`, userId, isValid: false, invalidatedAt: daysAgo(200), lastActivityAt: daysAgo(200), expiresAt: daysAgo(150) },
  event: { id: `e-${userId}`, userId, eventType: 'PASSWORD_RESET_REQUEST', createdAt: daysAgo(500) },
  audit: { id: `a-${userId}`, userId, adminId: '64b0000000000000000000aa', action: 'VIEW_USER', createdAt: daysAgo(600) },
});

const world = (bans: MongoDocument[]): Collections => {
  const accounts = [BANNED, FREE, LIFTED].map(oldTraces);
  return {
    ban: bans,
    report: [],
    user: accounts.map((a) => a.user),
    userSession: accounts.map((a) => a.session),
    securityEvent: accounts.map((a) => a.event),
    adminAuditLog: accounts.map((a) => a.audit),
  };
};

/** Un ban TEL QUE `BanService.createBan` l'écrit : ni `liftedAt` ni `liftedById` (clés ABSENTES). */
const banAsWritten = (userId: string): MongoDocument => ({ id: `ban-${userId}`, userId, bannedById: '64b0000000000000000000aa', reason: 'abus', expiresAt: null, createdAt: daysAgo(400) });

describe('A2-1 — un compte banni garde ses traces, quelle que soit la forme du ban', () => {
  it('un ban écrit sans clé `liftedAt` protège son compte ; un ban levé ne protège plus', async () => {
    const { prisma, data } = storeOf(world([
      banAsWritten(BANNED),
      { ...banAsWritten(LIFTED), liftedAt: daysAgo(10), liftedById: '64b0000000000000000000aa' },
    ]));

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(data.securityEvent.map((e) => e.userId)).toEqual([BANNED]);
    expect(data.userSession.map((s) => s.userId)).toEqual([BANNED]);
    expect(data.adminAuditLog.map((a) => a.userId)).toEqual([BANNED]);
    expect(data.user.find((u) => u.id === BANNED)?.registrationIp).toBe('203.0.113.7');
    expect(data.user.find((u) => u.id === FREE)?.registrationIp).toBeNull();
  });

  it('un ban dont la clé `expiresAt` est absente (sans échéance) protège aussi ; un ban échu ne protège plus', async () => {
    const { expiresAt: _absent, ...withoutExpiry } = banAsWritten(BANNED);
    const { prisma, data } = storeOf(world([withoutExpiry, { ...banAsWritten(FREE), expiresAt: daysAgo(1) }]));

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(data.securityEvent.map((e) => e.userId)).toEqual([BANNED]);
  });

  it('un événement sans clé `userId` (tentative sans compte) de plus de 12 mois part — une négation ne le rend pas éternel', async () => {
    const collections = world([banAsWritten(BANNED)]);
    collections.securityEvent.push({ id: 'e-orphan', eventType: 'RATE_LIMIT_EXCEEDED', createdAt: daysAgo(500) });
    collections.securityEvent.push({ id: 'e-null', userId: null, eventType: 'RATE_LIMIT_EXCEEDED', createdAt: daysAgo(500) });
    const { prisma, data } = storeOf(collections);

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(data.securityEvent.map((e) => e.id).sort()).toEqual([`e-${BANNED}`]);
  });

  it('à blanc : compte les mêmes lignes, n’en touche aucune', async () => {
    const collections = world([banAsWritten(BANNED)]);
    const { prisma, data } = storeOf(collections);

    const report = await sweepRetention(prisma as never, { now: NOW, apply: false });

    expect(report).toMatchObject({ closedSessions: 2, securityEvents: 2, adminAuditLogs: 2, registrationTraces: 2 });
    expect(data).toEqual(collections);
  });
});

describe('A2-2 — une session échue mais RAFRAÎCHIE est vivante : elle ne part pas', () => {
  const live = (lastActivityAt: Date): MongoDocument => ({ id: 's', userId: FREE, isValid: true, expiresAt: daysAgo(100), lastActivityAt, createdAt: daysAgo(130) });

  it('échue depuis 100 jours mais active aujourd’hui : gardée', () => {
    expect(matchesMongoWhere(live(daysAgo(0)), expiredSessionRetentionWhere(NOW))).toBe(false);
  });

  it('échue depuis 100 jours et inactive depuis 100 jours : effacée', () => {
    expect(matchesMongoWhere(live(daysAgo(100)), expiredSessionRetentionWhere(NOW))).toBe(true);
  });
});

describe('la borne de LECTURE est exactement le complément de la purge, champs absents compris', () => {
  const sessions: MongoDocument[] = [
    { id: 'vivante-sans-clôture', isValid: true, expiresAt: daysAgo(-300), lastActivityAt: daysAgo(1) },
    { id: 'close-récente', isValid: false, invalidatedAt: daysAgo(10), expiresAt: daysAgo(-300), lastActivityAt: daysAgo(10) },
    { id: 'close-ancienne', isValid: false, invalidatedAt: daysAgo(100), expiresAt: daysAgo(-300), lastActivityAt: daysAgo(100) },
    { id: 'close-sans-date-ancienne', isValid: false, expiresAt: daysAgo(-300), lastActivityAt: daysAgo(100) },
    { id: 'close-sans-date-récente', isValid: false, invalidatedAt: null, expiresAt: daysAgo(-300), lastActivityAt: daysAgo(5) },
    { id: 'échue-rafraîchie', isValid: true, expiresAt: daysAgo(100), lastActivityAt: daysAgo(0) },
    { id: 'échue-abandonnée', isValid: true, expiresAt: daysAgo(100), lastActivityAt: daysAgo(120) },
  ];

  it.each(sessions.map((s) => [s.id, s] as const))('%s', (_id, session) => {
    const purged = matchesMongoWhere(session, expiredSessionRetentionWhere(NOW));
    const served = matchesMongoWhere(session, retainedSessionWhere(NOW));
    expect(served).toBe(!purged);
  });

  it('une session vivante, sans clé `invalidatedAt`, est servie', () => {
    expect(matchesMongoWhere(sessions[0], retainedSessionWhere(NOW))).toBe(true);
  });

  it('un événement de 13 mois n’est plus servi, un de 11 mois l’est', () => {
    expect(matchesMongoWhere({ createdAt: daysAgo(395) }, retainedSecurityEventWhere(NOW))).toBe(false);
    expect(matchesMongoWhere({ createdAt: daysAgo(330) }, retainedSecurityEventWhere(NOW))).toBe(true);
  });
});

describe('les autres procédures, et les traces de connexion — sur documents', () => {
  it('un signalement OUVERT protège ; un signalement classé (dismissed) ne protège plus', async () => {
    const collections = world([]);
    collections.report = [
      { id: 'r1', reportedType: 'user', reportedEntityId: BANNED, status: 'pending', createdAt: daysAgo(3) },
      { id: 'r2', reportedType: 'user', reportedEntityId: FREE, status: 'dismissed', createdAt: daysAgo(30) },
    ];
    const { prisma, data } = storeOf(collections);

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(data.securityEvent.map((e) => e.userId)).toEqual([BANNED]);
  });

  it('un verrou ACTIF protège ; un verrou échu ne protège plus', async () => {
    const collections = world([]);
    collections.user = collections.user.map((u) =>
      u.id === BANNED ? { ...u, lockedUntil: daysAgo(-1) } : u.id === FREE ? { ...u, lockedUntil: daysAgo(5) } : u);
    const { prisma, data } = storeOf(collections);

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(data.securityEvent.map((e) => e.userId)).toEqual([BANNED]);
  });

  it('l’adresse, le lieu et l’agent de dernière connexion de plus de 12 mois passent à null ; récents, ils restent', async () => {
    const collections = world([]);
    collections.user = [
      { id: FREE, createdAt: daysAgo(800), lastLoginAt: daysAgo(400), lastLoginIp: '203.0.113.8', lastLoginLocation: 'Lyon', lastLoginDevice: 'UA' },
      { id: LIFTED, createdAt: daysAgo(800), lastLoginAt: daysAgo(10), lastLoginIp: '203.0.113.9', lastLoginLocation: 'Nice', lastLoginDevice: 'UA' },
    ];
    const { prisma, data } = storeOf(collections);

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(data.user.find((u) => u.id === FREE)).toMatchObject({ lastLoginIp: null, lastLoginLocation: null, lastLoginDevice: null });
    expect(data.user.find((u) => u.id === LIFTED)).toMatchObject({ lastLoginIp: '203.0.113.9' });
  });

  it('si les procédures ne se lisent pas, rien n’est effacé', async () => {
    const { prisma, data } = storeOf(world([banAsWritten(BANNED)]));
    const failing = { ...prisma, ban: { findMany: async () => { throw new Error('mongo down'); } } };

    await sweepRetention(failing as never, { now: NOW, apply: true });

    expect(data.securityEvent).toHaveLength(3);
    expect(data.userSession).toHaveLength(3);
  });
});
