/**
 * #4180 — Un consentement se prouve par UNE SEULE colonne, horodatée par le
 * serveur. `PATCH`/`PUT /me/preferences/application` doivent rejeter (400)
 * toute tentative d'écrire l'une des cinq clés `*ConsentAt` legacy — c'est
 * le SEUL client qui pouvait auparavant affirmer un consentement à la place
 * du serveur.
 *
 * Ce témoin monte le ROUTEUR RÉEL (`createPreferenceRouter`) avec le SCHÉMA
 * RÉEL (`ApplicationPreferenceSchema`) — pas un double qui déclarerait
 * `additionalProperties: true` ou reconstruirait le shape à la main. Un
 * témoin qui mocke le schéma consacrerait le contraire de ce qu'il croit
 * garder (`services/gateway/CLAUDE.md`, § schémas d'erreur / réponse) :
 * l'assertion porterait sur le harnais, jamais sur le contrat livré.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks (hoisted) — mêmes doubles que preference-router-factory.test.ts ───

jest.mock('../../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn<any>().mockResolvedValue([]),
  })),
}));

jest.mock('../../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>(({ op }: { op: () => Promise<any> }) => op()),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

// ─── Import après les mocks — le ROUTEUR et le SCHÉMA réels du dépôt ─────────

import { createPreferenceRouter } from '../../../../../routes/me/preferences/preference-router-factory';
import {
  ApplicationPreferenceSchema,
  APPLICATION_PREFERENCE_DEFAULTS,
  LEGACY_APPLICATION_CONSENT_KEYS,
} from '@meeshy/shared/types/preferences/application';

const USER_ID = 'usr-00000000000001';

function makePrisma() {
  return {
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue({ application: {}, id: 'pref-1' }),
      upsert: jest.fn<any>().mockResolvedValue({ application: {}, id: 'pref-1' }),
      update: jest.fn<any>().mockResolvedValue(undefined),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma() as any);
  app.addHook('preHandler', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true, isAnonymous: false };
  });
  await app.register(
    createPreferenceRouter('application', ApplicationPreferenceSchema, APPLICATION_PREFERENCE_DEFAULTS)
  );
  await app.ready();
  return app;
}

describe('PATCH/PUT /me/preferences/application — clés de consentement legacy rejetées (#4180)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(LEGACY_APPLICATION_CONSENT_KEYS)(
    'PATCH avec "%s" rend 400 (ZodError, jamais un 200 qui masquerait le rejet)',
    async (key) => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/',
        headers: { 'content-type': 'application/json' },
        payload: { [key]: '2026-07-08T10:00:00Z' },
      });

      expect(res.statusCode).toBe(400);
      // Le corps ne doit jamais porter `success: true` — un 200 déguisé
      // laisserait le client croire que son "consentement" a été enregistré.
      expect(res.json().success).toBe(false);
    }
  );

  it.each(LEGACY_APPLICATION_CONSENT_KEYS)(
    'PUT avec "%s" rend 400 (ZodError)',
    async (key) => {
      const res = await app.inject({
        method: 'PUT',
        url: '/',
        headers: { 'content-type': 'application/json' },
        payload: { theme: 'dark', [key]: '2026-07-08T10:00:00Z' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    }
  );

  it('PATCH sans aucune clé legacy passe (200) — la garde ne blesse pas le chemin nominal', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { theme: 'dark', telemetryEnabled: false },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('une clé legacy posée à null rend 400 aussi — un retrait explicite reste une AFFIRMATION du client', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { voiceCloningEnabledAt: null },
    });

    expect(res.statusCode).toBe(400);
  });
});
