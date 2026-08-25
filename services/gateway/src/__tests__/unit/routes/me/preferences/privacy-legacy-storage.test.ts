/**
 * L'écran Confidentialité doit montrer CE QUE LE SERVEUR OBÉIT.
 *
 * Le dépôt porte deux rangements pour la même préférence (cf.
 * `services/preferences/privacy-storage.ts`) : le document JSON
 * `UserPreferences.privacy`, seul écrit par l'application, et les lignes
 * clé/valeur `UserPreference` en kebab-case, écrites par un endpoint présent du
 * 12 au 18 janvier 2026 puis retiré sans reprise de données.
 *
 * Les six portes de diffusion lisent les DEUX, par le résolveur. Les routes
 * `/me/preferences` ne lisaient que le document. Pour la population de janvier
 * — un opt-out posé, aucun document écrit depuis — cela produisait trois
 * défauts, que ces témoins tiennent :
 *
 *  A. l'écran affiche le défaut « tout visible » pendant que le serveur tait ;
 *  B. le `PATCH` reconstruit sa base sur ce même défaut, donc toucher UN
 *     réglage sans rapport réécrit l'opt-out à `true` — destruction silencieuse
 *     d'un consentement par un geste qui ne le visait pas ;
 *  C. « réinitialiser » laisse les lignes de janvier en place : le serveur
 *     continue de les obéir, et plus aucun écran ne les montre.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(),
}));

jest.mock('../../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../../utils/socket-broadcast', () => ({
  broadcastToUser: jest.fn(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' } },
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CATEGORY_CREATED: 'category:created',
    CATEGORY_UPDATED: 'category:updated',
    CATEGORY_DELETED: 'category:deleted',
    CATEGORIES_REORDERED: 'categories:reordered',
  },
}));

jest.mock('../../../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>(({ op }: { op: () => Promise<any> }) => op()),
}));

jest.mock('../../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn<any>().mockResolvedValue([]),
  })),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { createUnifiedAuthMiddleware } from '../../../../../middleware/auth';
import { userPreferencesRoutes } from '../../../../../routes/me/preferences/index';
import { clearPrivacyPreferencesCache } from '../../../../../services/preferences/privacy-cache';
import { PRIVACY_KEY_MAPPING } from '../../../../../config/user-preferences-defaults';

const mockCreateAuth = createUnifiedAuthMiddleware as jest.MockedFunction<any>;

const USER_ID = 'usr-january-000001';

const LEGACY_KEYS = Object.values(PRIVACY_KEY_MAPPING);

/** L'opt-out de janvier : accusés de lecture et « vu à » coupés. */
const JANUARY_OPT_OUT = [
  { userId: USER_ID, key: 'show-read-receipts', value: 'false' },
  { userId: USER_ID, key: 'show-last-seen', value: 'false' },
];

function makePrisma(opts: {
  /** Document `UserPreferences.privacy` — `null` = la population de janvier. */
  privacyDocument?: unknown;
  legacyRows?: Array<{ userId: string; key: string; value: string }>;
} = {}) {
  const { privacyDocument = null, legacyRows = JANUARY_OPT_OUT } = opts;

  const row = privacyDocument === null ? null : { id: 'pref-1', privacy: privacyDocument };

  return {
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(row),
      upsert: jest.fn<any>(async ({ create, update }: any) => ({
        id: 'pref-1',
        ...(update ?? create),
      })),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    userPreference: {
      findMany: jest.fn<any>().mockResolvedValue(legacyRows),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: legacyRows.length }),
    },
    userConversationCategory: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    conversationPreference: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn<any>().mockResolvedValue([]),
  } as any;
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  mockCreateAuth.mockImplementation(() => async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  await app.register(userPreferencesRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearPrivacyPreferencesCache();
});

// ─── Défaut A — l'écran contredit le serveur ──────────────────────────────────

describe('la population de janvier voit son opt-out', () => {
  it('GET /privacy rend l\'opt-out des lignes héritées, pas le défaut', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/privacy' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.showReadReceipts).toBe(false);
    expect(res.json().data.showLastSeen).toBe(false);
    await app.close();
  });

  it('GET /privacy complète les clés muettes par les défauts', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/privacy' });

    expect(res.json().data.showOnlineStatus).toBe(true);
    expect(res.json().data.encryptionPreference).toBe('optional');
    await app.close();
  });

  it('GET / (toutes catégories) s\'accorde avec GET /privacy', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.privacy.showReadReceipts).toBe(false);
    await app.close();
  });

  it('un document courant fait foi : les lignes de janvier ne le contredisent pas', async () => {
    const prisma = makePrisma({
      privacyDocument: { showReadReceipts: true, showLastSeen: true },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/privacy' });

    expect(res.json().data.showReadReceipts).toBe(true);
    expect(prisma.userPreference.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('un document muet sur les portes n\'écarte pas les lignes de janvier', async () => {
    // `encryptionPreference` ne fait partie d'AUCUNE des huit clés que les
    // portes de diffusion consultent : un document qui ne porte que lui laisse
    // le serveur obéir à janvier. L'écran doit dire la même chose — et garder
    // le réglage de chiffrement, que le résolveur des portes ne modélise pas.
    const prisma = makePrisma({ privacyDocument: { encryptionPreference: 'always' } });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/privacy' });

    expect(res.json().data.showReadReceipts).toBe(false);
    expect(res.json().data.encryptionPreference).toBe('always');
    await app.close();
  });

  it('un document partiel est complété par les défauts, pas rendu tel quel', async () => {
    const prisma = makePrisma({ privacyDocument: { showReadReceipts: false } });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/privacy' });

    expect(res.json().data.showReadReceipts).toBe(false);
    expect(res.json().data.allowContactRequests).toBe(true);
    await app.close();
  });
});

// ─── Défaut B — le PATCH détruisait l'opt-out ─────────────────────────────────

describe('toucher un réglage sans rapport ne détruit pas l\'opt-out', () => {
  it('PATCH d\'une autre clé conserve les valeurs héritées', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: '/privacy',
      payload: { blockScreenshots: true },
    });

    expect(res.statusCode).toBe(200);

    const written = prisma.userPreferences.upsert.mock.calls[0][0].update.privacy;
    expect(written.showReadReceipts).toBe(false);
    expect(written.showLastSeen).toBe(false);
    expect(written.blockScreenshots).toBe(true);
    await app.close();
  });

  it('PATCH peut toujours RÉTABLIR explicitement une clé coupée', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({
      method: 'PATCH',
      url: '/privacy',
      payload: { showReadReceipts: true },
    });

    const written = prisma.userPreferences.upsert.mock.calls[0][0].update.privacy;
    expect(written.showReadReceipts).toBe(true);
    expect(written.showLastSeen).toBe(false);
    await app.close();
  });
});

// ─── Défaut C — la remise à zéro laissait un fantôme ──────────────────────────

describe('la remise à zéro efface les DEUX rangements', () => {
  it('DELETE /privacy retire les lignes héritées', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'DELETE', url: '/privacy' });

    expect(res.statusCode).toBe(200);
    expect(prisma.userPreference.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, key: { in: LEGACY_KEYS } },
    });
    await app.close();
  });

  it('DELETE / (toutes catégories) retire aussi les lignes héritées', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'DELETE', url: '/' });

    expect(res.statusCode).toBe(200);
    expect(prisma.userPreference.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, key: { in: LEGACY_KEYS } },
    });
    await app.close();
  });

  it('une écriture réussie converge vers un seul rangement', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({
      method: 'PUT',
      url: '/privacy',
      payload: { showReadReceipts: false },
    });

    expect(prisma.userPreference.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, key: { in: LEGACY_KEYS } },
    });
    await app.close();
  });
});

// ─── Gardes — le rangement hérité n'appartient qu'à la confidentialité ────────

describe('les autres catégories ignorent le rangement hérité', () => {
  it('GET /notification ne consulte pas les lignes héritées', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: '/notification' });

    expect(prisma.userPreference.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('DELETE /notification ne supprime aucune ligne héritée', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({ method: 'DELETE', url: '/notification' });

    expect(prisma.userPreference.deleteMany).not.toHaveBeenCalled();
    await app.close();
  });
});
