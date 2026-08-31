/**
 * Unit tests for routes/me/index.ts
 * Tests the root /me GET endpoint and sub-route registration.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/socket-broadcast', () => ({ broadcastToUser: jest.fn() }));

// `jest.requireActual` PAR DÉFAUT (CLAUDE.md « un double partiel d'un module
// perd en silence tout ce que le module GAGNE ») : `get-me.ts` importe
// `userSchema` depuis ce même module pour composer son schéma de réponse
// (`...userSchema.properties`) — un double qui ne renvoyait QUE
// `errorResponseSchema` faisait échouer le CHARGEMENT du module au lieu de
// simplement omettre un champ, ce qui aurait pu passer inaperçu plus
// longtemps sous une forme plus permissive.
jest.mock('@meeshy/shared/types/api-schemas', () => ({
  ...(jest.requireActual('@meeshy/shared/types/api-schemas') as object),
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CATEGORY_CREATED: 'category:created',
    CATEGORY_UPDATED: 'category:updated',
    CATEGORY_DELETED: 'category:deleted',
    CATEGORIES_REORDERED: 'categories:reordered',
  },
}));

// Mock sub-routes to avoid complex dependency chains
jest.mock('../../../../routes/me/preferences', () => ({
  userPreferencesRoutes: jest.fn(async () => {}),
}));

jest.mock('../../../../routes/me/delete-account', () => ({
  deleteAccountRoutes: jest.fn(async () => {}),
}));

jest.mock('../../../../routes/me/export', () => ({
  dataExportRoutes: jest.fn(async () => {}),
}));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>(({ op }: { op: () => Promise<any> }) => op()),
}));

jest.mock('../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn<any>().mockResolvedValue([]),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import meRoutes from '../../../../routes/me/index';
import { createUnifiedAuthMiddleware } from '../../../../middleware/auth';

const mockCreateAuth = createUnifiedAuthMiddleware as jest.MockedFunction<any>;

// Le plugin est monté sous le préfixe RÉEL de la production
// (`route-registration.ts` : `${API_PREFIX}/me`). C'est le seul montage qui
// puisse voir un défaut de COMPOSITION : la route déclarait '/me' sous ce
// préfixe, servait donc `/api/v1/me/me`, et un test qui l'enregistre sans
// préfixe la trouvait toujours (#4141).
const PREFIXE_PRODUCTION = '/api/v1/me';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'usr-me-test-00001';

const mockUser = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice',
  avatar: null,
  role: 'USER',
};

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(mockUser),
    },
    signalPreKeyBundle: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    // Le magasin de `autoTranslateEnabled` (#3736) — `User` n'a aucune colonne
    // de ce nom, la lecture de soi relit donc le document `application`.
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

type AuthState = 'authenticated' | 'unauthenticated';

// Depuis #4178, la racine (`GET /`) passe par `createUnifiedAuthMiddleware`
// (mocké au niveau du module, comme le reste de ce fichier) au lieu de
// `fastify.authenticate` — c'est précisément ce qui permet à la MÊME route
// de servir un porteur de session anonyme (critère 1). `authContext` doit
// donc porter la forme que `handleGetMe` (`routes/me/get-me.ts`) attend :
// `type: 'user'` et `registeredUser` au grain que `formatUserResponse` lit.
async function buildApp(opts: {
  prisma?: ReturnType<typeof makePrisma>;
  auth?: AuthState;
} = {}): Promise<FastifyInstance> {
  const { prisma = makePrisma(), auth = 'authenticated' } = opts;

  mockCreateAuth.mockImplementation(() => async (req: FastifyRequest) => {
    if (auth === 'authenticated') {
      (req as any).authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        type: 'user',
        userId: USER_ID,
        displayName: mockUser.displayName,
        userLanguage: 'fr',
        hasFullAccess: true,
        canSendMessages: true,
        registeredUser: {
          id: USER_ID,
          username: mockUser.username,
          email: mockUser.email,
          role: mockUser.role,
          systemLanguage: 'fr',
          regionalLanguage: 'en',
          isOnline: true,
          lastActiveAt: new Date(),
        },
      };
    } else {
      (req as any).authContext = { isAuthenticated: false, isAnonymous: true };
    }
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  // Decorate fastify.prisma
  app.decorate('prisma', prisma);

  await app.register(meRoutes, { prefix: PREFIXE_PRODUCTION });
  await app.ready();
  return app;
}

// ─── GET /me ─────────────────────────────────────────────────────────────────

describe('GET /me — authenticated user', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 with user data nested under data.user — la forme UNIFIÉE (#4178), partagée avec GET /auth/me', async () => {
    const res = await app.inject({ method: 'GET', url: `${PREFIXE_PRODUCTION}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(USER_ID);
    expect(body.data.user.username).toBe('alice');
  });
});

describe('GET /me — unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    const app = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: `${PREFIXE_PRODUCTION}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ─── Sub-route registration ───────────────────────────────────────────────────

describe('meRoutes — sub-route registration', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('builds the app successfully with all sub-routes', async () => {
    const { userPreferencesRoutes } = require('../../../../routes/me/preferences');
    const { deleteAccountRoutes } = require('../../../../routes/me/delete-account');
    const { dataExportRoutes } = require('../../../../routes/me/export');
    expect(userPreferencesRoutes).toHaveBeenCalled();
    expect(deleteAccountRoutes).toHaveBeenCalled();
    expect(dataExportRoutes).toHaveBeenCalled();
  });
});
