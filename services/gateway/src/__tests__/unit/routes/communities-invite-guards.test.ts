/**
 * Inviter dans une communauté (#6376) — ce que la passerelle refuse,
 * maintenant que le web offre le geste à côté d'iOS.
 *
 * L'invitation AJOUTE la personne (aucune acceptation de sa part) : elle ne
 * peut donc viser ni un compte DÉSACTIVÉ, ni une personne qui a bloqué
 * l'inviteur ou qu'il a bloquée. Les deux rendent le même 404 qu'un compte
 * inexistant : la réponse ne dit pas à l'inviteur qu'on l'a bloqué.
 *
 * Le double Prisma HONORE les `where` qu'il reçoit (identifiant, désactivation,
 * blocage dans les deux sens) : une garde qui vit dans un `where` n'est visible
 * d'un témoin que si le faux applique ce `where`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn().mockImplementation(() => ({ recordEvent: jest.fn<any>().mockResolvedValue(undefined) })),
}));

const scheduleCommunityAddedAnnouncement = jest.fn<any>();
jest.mock('../../../services/notifications/community-added', () => ({
  scheduleCommunityAddedAnnouncement: (...args: unknown[]) => scheduleCommunityAddedAnnouncement(...args),
}));

import { registerMembershipRoutes } from '../../../routes/communities/membership';
import { registerMemberRoutes } from '../../../routes/communities/members';
import { findFirstIn } from '../../helpers/mongo-where';

const ADMIN = '507f1f77bcf86cd799439101';
const MEMBER = '507f1f77bcf86cd799439102';
const NEWCOMER = '507f1f77bcf86cd799439103';
const DEACTIVATED_USER = '507f1f77bcf86cd799439104';
const BLOCKS_ADMIN = '507f1f77bcf86cd799439105';
const BLOCKED_BY_ADMIN = '507f1f77bcf86cd799439106';
const SELF_DELETED = '507f1f77bcf86cd799439107';
// Rang 2 — `isActive: true` ET la colonne de soft-state POSÉE. Aucun chemin de
// production n'écrit cet état aujourd'hui (tout écrivain de `deactivatedAt` ou
// `deletedAt` pose aussi `isActive: false`), mais sans lui la suite ne peut PAS
// tomber : réduite à `{ isActive: true }`, la loi passerait au vert sur chacun de
// ses témoins, et c'est l'interdit du dépôt — un témoin de RANG s'écrit sur un
// rang AUTRE que le premier (audit adversarial du cycle 181, constat C2).
const DEACTIVATED_STILL_ACTIVE = '507f1f77bcf86cd799439108';
const DELETED_STILL_ACTIVE = '507f1f77bcf86cd799439109';
const MINEUR_DECLARE = '507f1f77bcf86cd79943910a';
const AGE_INCONNU = '507f1f77bcf86cd79943910b';
const COMMUNITY = '507f1f77bcf86cd7994391a1';

type Row = Record<string, unknown>;

/**
 * La forme NOMINALE de production : un compte jamais désactivé ni supprimé n'a
 * AUCUNE de ces deux colonnes — ni l'inscription (`registration.service.ts`) ni
 * la création par un administrateur (`user-management.service.ts`) ne les écrit.
 * Les poser `null` à la main décrit l'état MINORITAIRE (celui d'un compte
 * réactivé), et un filtre d'égalité nue y passe au vert alors qu'en base il
 * n'apparie presque personne (#19799).
 */
const USERS: Row[] = [
  { id: ADMIN, isActive: true, blockedUserIds: [BLOCKED_BY_ADMIN] },
  { id: MEMBER, isActive: true, blockedUserIds: [] },
  { id: NEWCOMER, isActive: true, blockedUserIds: [] },
  { id: DEACTIVATED_USER, isActive: false, deactivatedAt: new Date('2026-10-01'), blockedUserIds: [] },
  { id: BLOCKS_ADMIN, isActive: true, blockedUserIds: [ADMIN] },
  { id: BLOCKED_BY_ADMIN, isActive: true, blockedUserIds: [] },
  // Suppression demandée par l'utilisateur (`routes/account-deletion.ts`) : `isActive: false` + `deletedAt`, SANS `deactivatedAt`.
  { id: SELF_DELETED, isActive: false, deletedAt: new Date('2026-10-02'), blockedUserIds: [] },
  { id: DEACTIVATED_STILL_ACTIVE, isActive: true, deactivatedAt: new Date('2026-10-03'), blockedUserIds: [] },
  { id: DELETED_STILL_ACTIVE, isActive: true, deletedAt: new Date('2026-10-04'), blockedUserIds: [] },
  { id: MINEUR_DECLARE, isActive: true, birthDate: new Date('2014-01-01'), blockedUserIds: [] },
  // Date ABSENTE : `declaredAgeClass` rend `unknown`, jamais `adult` — et ne rien
  // déclarer ne restreint rien. C'est le témoin qui empêche de lire le refus du
  // mineur comme « tout compte sans date majeure est refusé ».
  { id: AGE_INCONNU, isActive: true, blockedUserIds: [] },
];

function makePrisma() {
  const writes: Row[] = [];
  const members: Row[] = [
    { id: 'm-admin', communityId: COMMUNITY, userId: ADMIN, role: 'admin', isActive: true },
    { id: 'm-member', communityId: COMMUNITY, userId: MEMBER, role: 'member', isActive: true },
  ];
  const prisma = {
    community: {
      findFirst: jest.fn<any>(async ({ where, select }: { where: Row; select?: Row }) => {
        if (where.id !== COMMUNITY || where.isActive !== true) return null;
        const membersWhere = ((select?.members as Row | undefined)?.where ?? {}) as Row;
        return {
          id: COMMUNITY,
          isPrivate: false,
          createdBy: ADMIN,
          members: members.filter((row) => Object.entries(membersWhere).every(([key, value]) => row[key] === value)),
        };
      }),
    },
    user: {
      // Le double ÉVALUE le `where` avec la sémantique MongoDB (une clé ABSENTE
      // n'est pas une clé à `null`) : un évaluateur écrit à la main sur
      // `row[key] === value` accepte l'égalité nue que la base refuse.
      findFirst: jest.fn<any>(findFirstIn(USERS)),
    },
    communityMember: {
      findFirst: jest.fn<any>(async ({ where }: { where: Row }) =>
        members.find((row) => row.communityId === where.communityId && row.userId === where.userId) ?? null),
      create: jest.fn<any>(async ({ data }: { data: Row }) => {
        writes.push(data);
        // `deactivatedAt` porte une DATE, pas `null` : un double qui rend `null`
        // ne peut pas distinguer « le sérialiseur retire la clé » de « la valeur
        // était vide » (audit du cycle 181, constat C9).
        return { id: 'm-new', ...data, isActive: true, user: { id: data.userId, username: 'new', displayName: 'New', avatar: null, isOnline: true, deactivatedAt: new Date('2026-10-05') } };
      }),
      update: jest.fn<any>(async ({ data }: { data: Row }) => {
        writes.push(data);
        return {};
      }),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
  return { prisma, writes };
}

async function build(viewer: string): Promise<{ app: FastifyInstance; writes: Row[] }> {
  const { prisma, writes } = makePrisma();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: viewer, registeredUser: { id: viewer, role: 'USER' } };
  });
  app.decorate('prisma', prisma as any);
  await app.register(registerMembershipRoutes);
  await app.register(registerMemberRoutes);
  await app.ready();
  return { app, writes };
}

const invite = (app: FastifyInstance, userId: string) =>
  app.inject({ method: 'POST', url: `/communities/${COMMUNITY}/invite`, payload: { userId } });

describe('POST /communities/:id/invite — qui peut être ajouté', () => {
  it('un membre invite un nouvel arrivant dans une communauté publique', async () => {
    const { app, writes } = await build(MEMBER);
    expect((await invite(app, NEWCOMER)).statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    await app.close();
  });

  it('un compte désactivé n’est pas ajouté : 404, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await invite(app, DEACTIVATED_USER)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('un compte supprimé par son titulaire n’est pas ajouté : 404, sans écriture', async () => {
    const { app, writes } = await build(MEMBER);
    expect((await invite(app, SELF_DELETED)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it.each([
    ['désactivé', DEACTIVATED_STILL_ACTIVE],
    ['supprimé', DELETED_STILL_ACTIVE],
  ])('un compte %s dont `isActive` est resté à `true` n’est pas ajouté : 404, sans écriture', async (_etat, target) => {
    const { app, writes } = await build(ADMIN);
    expect((await invite(app, target)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('un mineur DÉCLARÉ n’est pas ajouté : 404, sans écriture — fail-closed provisoire (#19811)', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await invite(app, MINEUR_DECLARE)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('un âge INCONNU est ajouté : ne rien déclarer ne restreint rien', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await invite(app, AGE_INCONNU)).statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    await app.close();
  });

  it('une personne qui a bloqué l’inviteur n’est pas ajoutée : 404 comme un inconnu, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    const res = await invite(app, BLOCKS_ADMIN);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('User to invite not found');
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('une personne que l’inviteur a bloquée n’est pas ajoutée : 404, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await invite(app, BLOCKED_BY_ADMIN)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('un membre déjà actif rend 409, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await invite(app, MEMBER)).statusCode).toBe(409);
    expect(writes).toHaveLength(0);
    await app.close();
  });
});

const add = (app: FastifyInstance, userId: string) =>
  app.inject({ method: 'POST', url: `/communities/${COMMUNITY}/members`, payload: { userId } });

describe('POST /communities/:id/members — la route jumelle de l’administrateur garde les mêmes personnes', () => {
  it('un administrateur ajoute un nouvel arrivant', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await add(app, NEWCOMER)).statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    await app.close();
  });

  it.each([
    ['un compte désactivé', DEACTIVATED_USER],
    ['un compte supprimé par son titulaire', SELF_DELETED],
    ['un compte désactivé dont `isActive` est resté à `true`', DEACTIVATED_STILL_ACTIVE],
    ['un compte supprimé dont `isActive` est resté à `true`', DELETED_STILL_ACTIVE],
    ['un mineur déclaré (fail-closed provisoire, #19811)', MINEUR_DECLARE],
    ['une personne qui a bloqué l’administrateur', BLOCKS_ADMIN],
    ['une personne que l’administrateur a bloquée', BLOCKED_BY_ADMIN],
  ])('%s n’est pas ajouté : 404, sans écriture', async (_label, target) => {
    const { app, writes } = await build(ADMIN);
    expect((await add(app, target)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });
});

/**
 * Ce qui part À CÔTÉ du verdict (cycle 125). Les deux routes servent le membre
 * créé, dont la ligne `user` porte `deactivatedAt` : il n'est retenu que par
 * l'OMISSION de `communityMemberSchema` → `userMinimalSchema`, c'est-à-dire par
 * `fast-json-stringify` — dont `services/gateway/CLAUDE.md` dit qu'il « n'est pas
 * une garde de confidentialité ». Portée réelle nulle aujourd'hui (la porte
 * refuse un compte désactivé), donc c'est un PIÈGE ARMÉ, et la doctrine du
 * cycle 84 est claire : une non-fuite accidentelle se garde par un témoin, qui
 * garde une PORTE et non un bug. Il tombera le jour où quelqu'un déclare le champ.
 */
describe('la désactivation ne part pas avec le membre servi', () => {
  it.each([
    ['POST …/invite', invite],
    ['POST …/members', add],
  ])('%s sert le membre sans `deactivatedAt`', async (_route, porte) => {
    const { app } = await build(ADMIN);
    const res = await porte(app, NEWCOMER);
    expect(res.statusCode).toBe(200);
    // La NON-VACUITÉ d'abord : sur un corps vide, le `not.toContain` ci-dessous
    // passerait sans rien attester — et une charge servie à `{}` est un défaut
    // que ce dépôt a payé plusieurs fois.
    expect(res.body).toContain('username');
    expect(res.body).not.toContain('deactivatedAt');
    await app.close();
  });
});

describe("la personne ajoutée l'apprend (#18052)", () => {
  const announced = () => scheduleCommunityAddedAnnouncement.mock.calls.map((call) => call[1]);

  it.each([
    ['invitée', invite],
    ['ajoutée par un administrateur', add],
  ])('une personne %s est prévenue, au nom de qui l’a fait entrer', async (_label, door) => {
    scheduleCommunityAddedAnnouncement.mockClear();
    const { app } = await build(ADMIN);
    expect((await door(app, NEWCOMER)).statusCode).toBe(200);
    expect(announced()).toEqual([{ communityId: COMMUNITY, actorId: ADMIN, recipientIds: [NEWCOMER] }]);
    await app.close();
  });

  it.each([
    ['un compte désactivé', invite, DEACTIVATED_USER],
    ['un blocage', invite, BLOCKS_ADMIN],
    ['un membre déjà actif (409)', invite, MEMBER],
    ['un membre déjà actif ré-ajouté', add, MEMBER],
  ])('rien ne part pour %s', async (_label, door, target) => {
    scheduleCommunityAddedAnnouncement.mockClear();
    const { app } = await build(ADMIN);
    await door(app, target);
    expect(scheduleCommunityAddedAnnouncement).not.toHaveBeenCalled();
    await app.close();
  });
});
