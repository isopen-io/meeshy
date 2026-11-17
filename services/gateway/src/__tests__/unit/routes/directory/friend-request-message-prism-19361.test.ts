/**
 * #19361 — le mot d'une demande de connexion est servi au DESTINATAIRE dans sa
 * langue, avec sa langue d'origine (planche Etat-Demande, « Traduit de
 * l'arabe »). La descente est celle du Prisme (`resolvePrismTranslation`), et
 * rien ne part vers l'émetteur ni la carte brute des traductions.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationVerdict: jest.fn(async (args: any) => ({ result: await args.op(), replayed: false })),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));
jest.mock('../../../../services/relations/relationRequestGate', () => ({
  hasStandingRequest: jest.fn(async () => false),
  judgeRelationRequest: jest.fn(async () => ({ allowed: true })),
}));
const declencher = jest.fn<any>(async () => undefined);
jest.mock('../../../../services/friend-requests/FriendRequestMessageTranslationService', () => ({
  FriendRequestMessageTranslationService: { maybeShared: () => ({ trigger: declencher }) },
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const TIERS = '507f1f77bcf86cd799439033';

const partie = (id: string) => ({ id, username: id, firstName: null, lastName: null, displayName: id, avatar: null, isOnline: false, lastActiveAt: null });
const traductions = {
  en: { text: 'We met at the festival!', translationModel: 'nllb', confidenceScore: 1, createdAt: '2026-11-17T00:00:00.000Z' },
  es: { text: '¡Nos cruzamos en el festival!', translationModel: 'nllb', confidenceScore: 1, createdAt: '2026-11-17T00:00:00.000Z' },
};
const ligne = (id: string, senderId: string, receiverId: string) => ({
  id, senderId, receiverId, status: 'pending', targetLevel: null,
  message: 'التقينا في المهرجان', messageOriginalLanguage: 'ar', messageTranslations: traductions,
  respondedAt: null, createdAt: new Date('2026-11-17T10:00:00.000Z'), updatedAt: new Date('2026-11-17T10:00:00.000Z'),
  sender: partie(senderId), receiver: partie(receiverId),
});

const RECUE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ENVOYEE = 'aaaaaaaaaaaaaaaaaaaaaaa2';

async function monter(lecteur: Record<string, unknown>) {
  const prisma = {
    user: {
      findMany: jest.fn<any>(async () => []),
      findFirst: jest.fn<any>(async () => null),
      findUnique: jest.fn<any>(async (args: any) => {
        if (args?.where?.id === MOI) return { blockedUserIds: [], ...lecteur };
        return { id: AUTRE, deactivatedAt: null, blockedUserIds: [] };
      }),
    },
    friendRequest: {
      findMany: jest.fn<any>(async () => [ligne(RECUE, AUTRE, MOI), ligne(ENVOYEE, MOI, TIERS)]),
      create: jest.fn<any>(async (args: any) => ({ ...ligne(RECUE, MOI, AUTRE), ...args.data, messageTranslations: null })),
    },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('notificationService', null);
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: MOI };
    req.authContext = { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  await app.register(directoryFriendRequestsRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, prisma };
}

const lister = async (lecteur: Record<string, unknown>) => {
  const { app } = await monter(lecteur);
  const res = await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests?direction=any` });
  await app.close();
  const corps = res.json() as { data: Array<Record<string, unknown>> };
  return { status: res.statusCode, recue: corps.data.find((d) => d.id === RECUE)!, envoyee: corps.data.find((d) => d.id === ENVOYEE)! };
};

describe('#19361 — le mot d’une demande, servi au destinataire dans sa langue', () => {
  it('descend le Prisme du destinataire jusqu’au rang 2 quand le rang 1 n’a pas de traduction', async () => {
    const { status, recue } = await lister({ systemLanguage: 'fr', regionalLanguage: 'es', customDestinationLanguage: null, deviceLocale: 'en' });

    expect(status).toBe(200);
    expect(recue.messageTranslation).toEqual({ language: 'es', text: '¡Nos cruzamos en el festival!' });
    expect(recue.messageOriginalLanguage).toBe('ar');
    expect(recue.message).toBe('التقينا في المهرجان');
  });

  it('sert null quand la langue d’origine passe avant toute traduction dans le Prisme', async () => {
    const { recue } = await lister({ systemLanguage: 'ar', regionalLanguage: 'en', customDestinationLanguage: null, deviceLocale: null });

    expect(recue.messageTranslation).toBeNull();
    expect(recue.messageOriginalLanguage).toBe('ar');
  });

  it('ne sert à l’ÉMETTEUR ni la langue ni la traduction de son propre mot', async () => {
    const { envoyee } = await lister({ systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null });

    expect(envoyee.message).toBe('التقينا في المهرجان');
    expect(envoyee).not.toHaveProperty('messageTranslation');
    expect(envoyee).not.toHaveProperty('messageOriginalLanguage');
  });

  it('ne sert jamais la carte brute des traductions, ni à côté du champ servi', async () => {
    const { recue, envoyee } = await lister({ systemLanguage: 'es', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null });

    expect(recue).not.toHaveProperty('messageTranslations');
    expect(envoyee).not.toHaveProperty('messageTranslations');
    expect(JSON.stringify(envoyee)).not.toContain('We met at the festival');
    expect(JSON.stringify(recue)).not.toContain('We met at the festival');
  });
});

describe('#19361 — l’envoi détecte la langue du mot et le remet au translator', () => {
  it('écrit la langue détectée sur la ligne et déclenche la traduction vers le destinataire', async () => {
    declencher.mockClear();
    const { app, prisma } = await monter({});
    const res = await app.inject({
      method: 'POST', url: `${PREFIXE}/friend-requests`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: AUTRE, message: 'On s’est croisées au festival ! Tu te souviens de moi ?' }),
    });
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(prisma.friendRequest.create.mock.calls[0][0].data.messageOriginalLanguage).toBe('fr');
    expect(declencher).toHaveBeenCalledWith(expect.objectContaining({ receiverId: AUTRE, sourceLanguage: 'fr' }));
    const servie = (res.json() as { data: Record<string, unknown> }).data;
    expect(servie).not.toHaveProperty('messageOriginalLanguage');
  });

  it('ne déclenche rien sans mot', async () => {
    declencher.mockClear();
    const { app, prisma } = await monter({});
    await app.inject({
      method: 'POST', url: `${PREFIXE}/friend-requests`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: AUTRE }),
    });
    await app.close();

    expect(declencher).not.toHaveBeenCalled();
    expect(prisma.friendRequest.create.mock.calls[0][0].data.messageOriginalLanguage).toBeUndefined();
  });
});
