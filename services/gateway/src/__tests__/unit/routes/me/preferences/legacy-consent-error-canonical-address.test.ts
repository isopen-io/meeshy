/**
 * #6641 — `LEGACY_CONSENT_ERROR` nomme l'adresse CANONIQUE d'un consentement.
 *
 * `PATCH`/`PUT /me/preferences/application` refuse les cinq clés
 * `*ConsentAt` legacy (#4180, `z.never()` dans `ApplicationPreferenceSchema`)
 * et son message renvoie vers l'écrivain de consentement à appeler à la
 * place. Il nommait `POST /voice/profile/consent` — l'écrivain HISTORIQUE
 * que #4348 a vocation à retirer — alors que l'adresse canonique depuis #4348
 * est `PUT /me/consents/{purpose}` (`routes/me/consents.ts`).
 *
 * Un message qui nomme la bonne adresse ne suffit pas : il faut que cette
 * adresse soit RÉELLEMENT montée. Ce témoin monte donc les DEUX routeurs
 * (`createPreferenceRouter('application', …)` et `meConsentsRoutes`) dans la
 * MÊME app, lit l'adresse depuis le message servi, et la confronte à une
 * requête réelle — la preuve que #6601/#6624 demandaient : « le texte qu'un
 * refus sert désigne-t-il une route qui existe ? ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { CONSENT_PURPOSES } from '@meeshy/shared/types/consents';
import {
  ApplicationPreferenceSchema,
  APPLICATION_PREFERENCE_DEFAULTS,
  LEGACY_APPLICATION_CONSENT_KEYS,
} from '@meeshy/shared/types/preferences/application';

jest.mock('../../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn<any>().mockResolvedValue([]),
  })),
}));

jest.mock('../../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>(({ op }: { op: () => Promise<any> }) => op()),
}));

// ─── Import après les mocks ──────────────────────────────────────────────────

import { createPreferenceRouter } from '../../../../../routes/me/preferences/preference-router-factory';
import { meConsentsRoutes } from '../../../../../routes/me/consents';

const USER_ID = '68a000000000000000000001';

function makePrisma() {
  return {
    // `createPreferenceRouter('application', …)` — pas de `storage`, donc
    // seule cette table est lue/écrite par la route de préférence.
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      upsert: jest
        .fn<any>()
        .mockResolvedValue({ id: 'pref-1', application: APPLICATION_PREFERENCE_DEFAULTS }),
      update: jest.fn<any>().mockResolvedValue(undefined),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    // `meConsentsRoutes` — lit/écrit les colonnes `User.*ConsentAt`.
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        dataProcessingConsentAt: null,
        analyticsConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  } as any;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma());

  // La route de préférence lit `request.auth` (posé par un `preHandler`
  // amont dans la production) ; `meConsentsRoutes` lit `fastify.authenticate`
  // (montage AUTONOME, `onRequest: [fastify.authenticate]`) — les deux
  // mécanismes réels, reproduits fidèlement plutôt qu'unifiés à la main.
  app.addHook('preHandler', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true, isAnonymous: false };
  });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });

  await app.register(
    createPreferenceRouter('application', ApplicationPreferenceSchema, APPLICATION_PREFERENCE_DEFAULTS),
    { prefix: '/me/preferences/application' }
  );
  await app.register(meConsentsRoutes, { prefix: '/me' });

  await app.ready();
  return app;
}

describe('LEGACY_CONSENT_ERROR nomme une adresse RÉELLEMENT montée (#6641)', () => {
  it.each(LEGACY_APPLICATION_CONSENT_KEYS)(
    'le refus de "%s" nomme PUT /me/consents/{purpose}, jamais POST /voice/profile/consent',
    async (key) => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/me/preferences/application',
        payload: { [key]: new Date().toISOString() },
      });

      expect(res.statusCode).toBe(400);
      // `sendError` ÉTALE `details` à la racine (`services/gateway/CLAUDE.md`
      // § « Response Format ») : `issues` est donc une clé de PREMIER niveau,
      // jamais `details.issues`.
      const issues = res.json().issues as Array<{ message: string; path: string[] }>;
      const issue = issues.find((i) => i.path.includes(key));

      expect(issue?.message).toBe(
        'Ce champ ne se règle plus via PATCH/PUT /me/preferences/application (#4180) — ' +
          "le consentement est horodaté par le serveur via PUT /me/consents/{purpose}."
      );
      expect(issue?.message).not.toContain('POST /voice/profile/consent');

      await app.close();
    }
  );

  it("l'adresse que le refus nomme est celle que le gateway monte réellement", async () => {
    const app = await buildApp();

    const refusal = await app.inject({
      method: 'PUT',
      url: '/me/preferences/application',
      payload: { dataProcessingConsentAt: new Date().toISOString() },
    });
    const message = (refusal.json().issues[0] as { message: string }).message;

    const adresse = message.match(/PUT (\/me\/consents\/\{purpose\})/);
    expect(adresse).not.toBeNull();

    // L'adresse nommée porte un PARAMÈTRE (`{purpose}`) : la confronter à une
    // requête réelle exige de l'instancier avec une valeur du VRAI domaine
    // (`CONSENT_PURPOSES`), pas une chaîne arbitraire.
    const purpose = CONSENT_PURPOSES[0];
    const url = adresse![1].replace('{purpose}', purpose);

    const reponse = await app.inject({
      method: 'PUT',
      url,
      payload: { granted: true, policyVersion: 'quelconque' },
    });

    // La preuve n'est pas que la requête RÉUSSIT (elle peut échouer sur la
    // version de politique) — c'est que la route EXISTE : un 404 signerait
    // que le message pointe vers une adresse que le gateway ne sert pas.
    expect(reponse.statusCode).not.toBe(404);

    await app.close();
  });
});
