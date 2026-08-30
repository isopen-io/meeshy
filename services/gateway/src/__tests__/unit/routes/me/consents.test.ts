/**
 * `GET /me/consents` et `PUT /me/consents/{purpose}` (#4348, fusion #4335,
 * suite de #4180) — comportement de l'adresse CANONIQUE, montage AUTONOME
 * (`onRequest: [fastify.authenticate]`, pas un `preHandler` de parent).
 *
 * Le témoin le plus important n'est pas l'octroi (trivial) mais la
 * RÉVOCATION de bout en bout (critère explicite du commentaire de fusion de
 * #4348/#4335) : `PUT` accorde, une lecture ultérieure le confirme, `PUT`
 * retire, et la lecture ultérieure ne doit JAMAIS rester bloquée sur l'état
 * précédent — c'est exactement le défaut que #4180 a fermé côté blob/colonne,
 * reproduit ici comme témoin de non-régression sur la NOUVELLE surface.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import {
  meConsentsRoutes,
  CONSENT_PURPOSES,
  CONSENT_POLICY_VERSION,
} from '../../../../routes/me/consents';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000001';

type ConsentColumns = {
  dataProcessingConsentAt: Date | null;
  voiceDataConsentAt: Date | null;
  voiceProfileConsentAt: Date | null;
  voiceCloningEnabledAt: Date | null;
};

const EMPTY_COLUMNS: ConsentColumns = {
  dataProcessingConsentAt: null,
  voiceDataConsentAt: null,
  voiceProfileConsentAt: null,
  voiceCloningEnabledAt: null,
};

/**
 * Double STATEFUL — pas un simple `mockResolvedValue` figé : la preuve de
 * révocation de bout en bout exige que `update()` change ce que `findUnique()`
 * rend à l'appel SUIVANT, dans la MÊME app, comme un vrai Prisma le ferait.
 */
function makePrisma(initial: Partial<Record<string, ConsentColumns>> = {}) {
  const store = new Map<string, ConsentColumns>(
    Object.entries(initial).map(([id, cols]) => [id, { ...EMPTY_COLUMNS, ...cols }])
  );

  return {
    user: {
      findUnique: jest.fn<any>().mockImplementation(async ({ where }: any) => {
        const row = store.get(where.id);
        return row ? { ...row } : null;
      }),
      update: jest.fn<any>().mockImplementation(async ({ where, data }: any) => {
        const row = store.get(where.id) ?? { ...EMPTY_COLUMNS };
        const next = { ...row, ...data };
        store.set(where.id, next);
        return { ...next };
      }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  } as any;
}

async function buildApp(prisma = makePrisma({ [USER_ID]: EMPTY_COLUMNS })): Promise<{
  app: FastifyInstance;
  prisma: ReturnType<typeof makePrisma>;
}> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });
  await app.register(meConsentsRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return { app, prisma };
}

function getConsents(app: FastifyInstance, userId?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/me/consents',
    headers: userId ? { 'x-test-user-id': userId } : {},
  });
}

function putConsent(
  app: FastifyInstance,
  purpose: string,
  payload: Record<string, unknown>,
  userId?: string
) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/me/consents/${purpose}`,
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-test-user-id': userId } : {}),
    },
    payload,
  });
}

describe('GET /me/consents', () => {
  it('401 sans authentification', async () => {
    const { app } = await buildApp();
    const res = await getConsents(app);
    expect(res.statusCode).toBe(401);
  });

  it('rend les quatre purpose, tous non accordés, avec policyVersion et source=server', async () => {
    const { app } = await buildApp();
    const res = await getConsents(app, USER_ID);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.consents).toHaveLength(4);
    expect(body.data.consents.map((c: any) => c.purpose).sort()).toEqual(
      [...CONSENT_PURPOSES].sort()
    );

    for (const entry of body.data.consents) {
      expect(entry.granted).toBe(false);
      expect(entry.revokedAt).toBeNull();
      expect(entry.grantedAt).toBeUndefined();
      expect(entry.policyVersion).toBe(CONSENT_POLICY_VERSION);
      expect(entry.source).toBe('server');
    }
  });

  it('un purpose accordé porte grantedAt et granted=true, sans revokedAt', async () => {
    const grantedAt = new Date('2026-01-01T00:00:00.000Z');
    const { app } = await buildApp(
      makePrisma({ [USER_ID]: { ...EMPTY_COLUMNS, dataProcessingConsentAt: grantedAt } })
    );

    const res = await getConsents(app, USER_ID);
    const body = JSON.parse(res.body);
    const entry = body.data.consents.find((c: any) => c.purpose === 'data-processing');

    expect(entry.granted).toBe(true);
    expect(entry.grantedAt).toBe(grantedAt.toISOString());
    expect(entry.revokedAt).toBeUndefined();
  });

  it('le bloc dérivé vient de ConsentValidationService — jamais recalculé sur place', async () => {
    // Toutes les colonnes accordées : `getConsentStatus` doit rendre
    // canTranscribeAudio/canTranslateAudio/canUseVoiceCloning cohérents avec
    // SA propre hiérarchie, preuve qu'aucun calcul parallèle n'a lieu dans
    // la route (un calcul parallèle divergerait au premier défaut de
    // synchronisation entre les deux implémentations).
    const now = new Date();
    const { app } = await buildApp(
      makePrisma({
        [USER_ID]: {
          dataProcessingConsentAt: now,
          voiceDataConsentAt: now,
          voiceProfileConsentAt: now,
          voiceCloningEnabledAt: now,
        },
      })
    );

    const res = await getConsents(app, USER_ID);
    const body = JSON.parse(res.body);

    expect(body.data.derived).toEqual({
      canTranscribeAudio: true,
      canTranslateAudio: true,
      canUseVoiceCloning: true,
    });
  });

  it('404 quand l’utilisateur authentifié n’existe plus en base', async () => {
    const { app } = await buildApp(makePrisma());
    const res = await getConsents(app, 'ghost-user');
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /me/consents/:purpose', () => {
  it('401 sans authentification', async () => {
    const { app } = await buildApp();
    const res = await putConsent(app, 'data-processing', {
      granted: true,
      policyVersion: CONSENT_POLICY_VERSION,
    });
    expect(res.statusCode).toBe(401);
  });

  it('400 sur un purpose inconnu', async () => {
    const { app } = await buildApp();
    const res = await putConsent(
      app,
      'analytics',
      { granted: true, policyVersion: CONSENT_POLICY_VERSION },
      USER_ID
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 — Zod strict rejette tout champ en plus (aucune date acceptée du client)', async () => {
    const { app } = await buildApp();
    const res = await putConsent(
      app,
      'data-processing',
      { granted: true, policyVersion: CONSENT_POLICY_VERSION, grantedAt: '2020-01-01T00:00:00Z' },
      USER_ID
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 — Zod strict rejette un policyVersion absent', async () => {
    const { app } = await buildApp();
    const res = await putConsent(app, 'data-processing', { granted: true }, USER_ID);
    expect(res.statusCode).toBe(400);
  });

  it('409 quand policyVersion ne cite pas la politique en vigueur', async () => {
    const { app } = await buildApp();
    const res = await putConsent(
      app,
      'data-processing',
      { granted: true, policyVersion: '1999-01-01' },
      USER_ID
    );
    expect(res.statusCode).toBe(409);
  });

  it('granted:true pose new Date() sur la colonne cible, jamais une date reçue du client', async () => {
    const { app, prisma } = await buildApp();
    const before = Date.now();

    const res = await putConsent(
      app,
      'data-processing',
      { granted: true, policyVersion: CONSENT_POLICY_VERSION },
      USER_ID
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.granted).toBe(true);
    expect(new Date(body.data.grantedAt).getTime()).toBeGreaterThanOrEqual(before);

    const updateCall = prisma.user.update.mock.calls[0][0];
    expect(updateCall.data.dataProcessingConsentAt).toBeInstanceOf(Date);
  });

  it('granted:false pose null sur la SEULE colonne ciblée', async () => {
    const now = new Date();
    const { app, prisma } = await buildApp(
      makePrisma({
        [USER_ID]: {
          dataProcessingConsentAt: now,
          voiceDataConsentAt: now,
          voiceProfileConsentAt: now,
          voiceCloningEnabledAt: now,
        },
      })
    );

    const res = await putConsent(
      app,
      'voice-profile',
      { granted: false, policyVersion: CONSENT_POLICY_VERSION },
      USER_ID
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.granted).toBe(false);
    expect(body.data.revokedAt).toBeNull();

    const updateCall = prisma.user.update.mock.calls[0][0];
    expect(updateCall.data).toEqual({ voiceProfileConsentAt: null });
  });

  it('accorder une feuille pose ses ANCÊTRES manquants (cascade de VoiceProfileService reproduite)', async () => {
    const { app, prisma } = await buildApp();

    const res = await putConsent(
      app,
      'voice-cloning',
      { granted: true, policyVersion: CONSENT_POLICY_VERSION },
      USER_ID
    );

    expect(res.statusCode).toBe(200);
    const updateCall = prisma.user.update.mock.calls[0][0];
    expect(updateCall.data.voiceCloningEnabledAt).toBeInstanceOf(Date);
    expect(updateCall.data.voiceDataConsentAt).toBeInstanceOf(Date);
    expect(updateCall.data.voiceProfileConsentAt).toBeInstanceOf(Date);
    expect(updateCall.data.dataProcessingConsentAt).toBeInstanceOf(Date);
  });

  it('un ancêtre DÉJÀ accordé garde sa date — la cascade ne l’écrase pas', async () => {
    const oldDate = new Date('2020-01-01T00:00:00.000Z');
    const { app, prisma } = await buildApp(
      makePrisma({ [USER_ID]: { ...EMPTY_COLUMNS, dataProcessingConsentAt: oldDate } })
    );

    await putConsent(
      app,
      'voice-data',
      { granted: true, policyVersion: CONSENT_POLICY_VERSION },
      USER_ID
    );

    const updateCall = prisma.user.update.mock.calls[0][0];
    // La colonne déjà accordée est absente de l'écriture — jamais réécrite.
    expect(updateCall.data.dataProcessingConsentAt).toBeUndefined();
    expect(updateCall.data.voiceDataConsentAt).toBeInstanceOf(Date);
  });

  it('404 quand l’utilisateur authentifié n’existe plus en base', async () => {
    const { app } = await buildApp(makePrisma());
    const res = await putConsent(
      app,
      'data-processing',
      { granted: true, policyVersion: CONSENT_POLICY_VERSION },
      'ghost-user'
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('Révocation de bout en bout — le défaut fermé par #4180, prouvé sur la nouvelle surface', () => {
  it('accorder puis GET confirme, retirer puis GET ne reste JAMAIS bloqué sur l’état précédent', async () => {
    const { app } = await buildApp();

    const grantRes = await putConsent(
      app,
      'voice-profile',
      { granted: true, policyVersion: CONSENT_POLICY_VERSION },
      USER_ID
    );
    expect(grantRes.statusCode).toBe(200);

    const afterGrant = JSON.parse((await getConsents(app, USER_ID)).body);
    const grantedEntry = afterGrant.data.consents.find((c: any) => c.purpose === 'voice-profile');
    expect(grantedEntry.granted).toBe(true);
    expect(grantedEntry.grantedAt).toBeDefined();

    const revokeRes = await putConsent(
      app,
      'voice-profile',
      { granted: false, policyVersion: CONSENT_POLICY_VERSION },
      USER_ID
    );
    expect(revokeRes.statusCode).toBe(200);
    expect(JSON.parse(revokeRes.body).data.granted).toBe(false);

    const afterRevoke = JSON.parse((await getConsents(app, USER_ID)).body);
    const revokedEntry = afterRevoke.data.consents.find((c: any) => c.purpose === 'voice-profile');
    expect(revokedEntry.granted).toBe(false);
    expect(revokedEntry.grantedAt).toBeUndefined();
    expect(revokedEntry.revokedAt).toBeNull();

    // Les DEUX sources s'accordent au moment du GRANT (la remarque la plus
    // fine du commentaire de fusion #4348/#4335) : la réponse de PUT et la
    // lecture GET qui suit ne divergent JAMAIS sur `granted`.
    const regrantRes = await putConsent(
      app,
      'voice-profile',
      { granted: true, policyVersion: CONSENT_POLICY_VERSION },
      USER_ID
    );
    const regrantBody = JSON.parse(regrantRes.body);
    const afterRegrant = JSON.parse((await getConsents(app, USER_ID)).body);
    const reGrantedEntry = afterRegrant.data.consents.find(
      (c: any) => c.purpose === 'voice-profile'
    );
    expect(regrantBody.data.granted).toBe(reGrantedEntry.granted);
    expect(regrantBody.data.grantedAt).toBe(reGrantedEntry.grantedAt);
  });
});
