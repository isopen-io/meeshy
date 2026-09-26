/**
 * `hideProfileFromSearch` est honoré par TOUTES les résolutions
 * identifiant → compte (#8104).
 *
 * Le réglage était écrit, relu par son écran, et lu par aucune porte. Chaque
 * porte qui joint un numéro, un e-mail, un pseudo, un nom ou un carnet
 * d'adresses à un compte appelle désormais la même loi
 * (`services/profile-discoverability.ts`) : un compte caché est introuvable,
 * sauf pour lui-même et ses amis ACCEPTÉS.
 *
 * Chaque témoin assert sur ce que la réponse SERT, après sérialisation.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({
  ...(jest.requireActual('../../../../utils/logger') as object),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async (_viewer: unknown, ids: string[]) =>
      new Map(ids.map((id) => [id, { showOnline: false, showLastSeenTimestamp: false }])),
    resolveForTarget: async () => ({ showOnline: false, showLastSeenTimestamp: false }),
  }),
}));

import { matchContacts } from '../../../../routes/users/contacts-match';
import { getUserByEmail, getUserByPhone } from '../../../../routes/users/profile';
import { directoryContactsRoutes } from '../../../../routes/directory/contacts';
import { directoryPeopleRoutes } from '../../../../routes/directory/people';
import { searchUsers } from '../../../../routes/users/preferences';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';

const MOI = '507f1f77bcf86cd799439011';
const CACHEE = '507f1f77bcf86cd799439022';
const AMIE_CACHEE = '507f1f77bcf86cd799439033';

const compte = (id: string, nom: string, extra: Record<string, unknown> = {}) => ({
  id,
  username: nom,
  firstName: nom,
  lastName: 'Test',
  displayName: nom,
  avatar: null,
  isOnline: false,
  lastActiveAt: null,
  systemLanguage: 'fr',
  createdAt: new Date('2026-01-01'),
  ...extra,
});

const CACHEE_ROW = compte(CACHEE, 'cachee', { phoneNumber: '+33612345678', email: 'cachee@exemple.fr' });
const AMIE_ROW = compte(AMIE_CACHEE, 'amie', { phoneNumber: '+33687654321', email: 'amie@exemple.fr' });

function prismaDouble(options: { hiding?: readonly string[]; amis?: readonly string[] } = {}) {
  const { hiding = [CACHEE, AMIE_CACHEE], amis = [AMIE_CACHEE] } = options;
  const comptes = [CACHEE_ROW, AMIE_ROW];
  return {
    user: {
      findMany: jest.fn<any>(async (args: any) => (args?.where?.blockedUserIds ? [] : comptes)),
      findFirst: jest.fn<any>(async (args: any) => {
        const where = args?.where ?? {};
        return comptes.find((c) => c.email === where.email || c.phoneNumber === where.phoneNumber) ?? null;
      }),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
      count: jest.fn<any>(async () => comptes.length),
    },
    userContact: {
      findMany: jest.fn<any>(async () => comptes.map((c, i) => ({
        id: `aaaaaaaaaaaaaaaaaaaaaaa${i}`, contactKey: `k${i}`, displayName: `Carnet ${c.username}`,
        phoneNumbers: [c.phoneNumber], emails: [], usernames: [], matchedBy: 'phone',
        matchedAt: new Date('2026-09-01'), lastSyncedAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
        matchedUser: c,
      }))),
      count: jest.fn<any>(async () => comptes.length),
    },
    userPreferences: {
      findMany: jest.fn<any>(async (args: any) =>
        (args.where.userId.in as string[]).map((userId) => ({ userId, privacy: { hideProfileFromSearch: hiding.includes(userId) } }))
      ),
    },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    friendRequest: {
      findMany: jest.fn<any>(async () => amis.map((id) => ({ senderId: MOI, receiverId: id }))),
    },
  };
}

async function monter(prisma = prismaDouble()): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true, type: 'user', userId: MOI,
      registeredUser: { id: MOI, role: 'USER' },
    };
    (req as any).user = { userId: MOI, role: 'USER' };
  });
  await matchContacts(app);
  await getUserByEmail(app);
  await getUserByPhone(app);
  await searchUsers(app);
  await app.register(directoryContactsRoutes, { prefix: '/directory' });
  await app.register(directoryPeopleRoutes, { prefix: '/directory' });
  await app.ready();
  return app;
}

beforeEach(() => clearPrivacyPreferencesCache());

describe('le carnet d’adresses ne retrouve pas un compte caché', () => {
  it('match : la cachée n’apparaît pas, l’amie cachée si', async () => {
    const app = await monter();

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/contacts/match',
      payload: { contacts: [{ phoneNumbers: ['+33612345678'] }, { phoneNumbers: ['+33687654321'] }] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.matches.map((m: any) => m.user.id)).toEqual([AMIE_CACHEE]);
    await app.close();
  });

  it('le répertoire persisté rend la cachée « à inviter », sans son compte', async () => {
    const app = await monter();

    const res = await app.inject({ method: 'GET', url: '/directory/contacts' });

    expect(res.statusCode).toBe(200);
    const lignes = res.json().data as any[];
    const cachee = lignes.find((l) => l.displayName === 'Carnet cachee');
    const amie = lignes.find((l) => l.displayName === 'Carnet amie');
    expect(cachee).toMatchObject({ isOnMeeshy: false, matchedUser: null, matchedBy: null });
    expect(amie).toMatchObject({ isOnMeeshy: true });
    expect(amie.matchedUser.id).toBe(AMIE_CACHEE);
    await app.close();
  });
});

describe('les recherches unitaires par numéro et par e-mail', () => {
  it('par e-mail : 404 sur la cachée, 200 sur l’amie cachée', async () => {
    const app = await monter();

    const cachee = await app.inject({ method: 'GET', url: '/users/email/cachee@exemple.fr' });
    const amie = await app.inject({ method: 'GET', url: '/users/email/amie@exemple.fr' });

    expect(cachee.statusCode).toBe(404);
    expect(amie.statusCode).toBe(200);
    expect(amie.json().data.id).toBe(AMIE_CACHEE);
    await app.close();
  });

  it('par numéro : 404 sur la cachée, identique à un numéro inconnu', async () => {
    const app = await monter();

    const cachee = await app.inject({ method: 'GET', url: '/users/phone/33612345678' });
    const inconnu = await app.inject({ method: 'GET', url: '/users/phone/33600000000' });

    expect(cachee.statusCode).toBe(404);
    expect(cachee.json()).toEqual(inconnu.json());
    await app.close();
  });

  it('un compte qui ne se cache pas reste trouvable par un inconnu', async () => {
    const app = await monter(prismaDouble({ hiding: [], amis: [] }));

    const res = await app.inject({ method: 'GET', url: '/users/email/cachee@exemple.fr' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('les recherches par nom', () => {
  it('/users/search n’affiche pas la cachée', async () => {
    const app = await monter();

    const res = await app.inject({ method: 'GET', url: '/users/search?q=test' });

    expect(res.statusCode).toBe(200);
    expect((res.json().data as any[]).map((u) => u.id)).toEqual([AMIE_CACHEE]);
    await app.close();
  });

  it('/directory/people n’affiche pas la cachée', async () => {
    const app = await monter();

    const res = await app.inject({ method: 'GET', url: '/directory/people?q=test' });

    expect(res.statusCode).toBe(200);
    expect((res.json().data as any[]).map((u) => u.id)).toEqual([AMIE_CACHEE]);
    await app.close();
  });
});
