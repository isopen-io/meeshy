/**
 * `PUT /me/consents/{purpose}` — un refus DIT ce qu'il attendait (#4487,
 * suite de #4348).
 *
 * Les trois refus de cette route étaient justes et muets. Le détail existait
 * à chaque fois — les `issues` de Zod nomment le champ fautif, la route
 * connaît la version en vigueur et la liste des `purpose` — et il était
 * calculé, passé à `sendError`, sérialisé... puis RETIRÉ au dernier mètre :
 * `sendError` étale `details` à la racine, `errorResponseSchema` ne déclare
 * aucune de ces clés, et fast-json-stringify supprime en silence toute
 * propriété non déclarée. Le serveur savait exactement quel champ manquait et
 * n'avait aucun moyen de le dire.
 *
 * Ce fichier mesure donc le corps SÉRIALISÉ (`res.body`), jamais la valeur
 * rendue par le handler : c'est la sérialisation qui est l'accusée, et un
 * témoin qui inspecterait l'objet avant elle passerait au vert sur le défaut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import {
  meConsentsRoutes,
  CONSENT_PURPOSES,
  CONSENT_POLICY_VERSION,
} from '../../../../routes/me/consents';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000001';

const EMPTY_COLUMNS = {
  dataProcessingConsentAt: null,
  voiceDataConsentAt: null,
  voiceProfileConsentAt: null,
  voiceCloningEnabledAt: null,
};

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ ...EMPTY_COLUMNS }),
      update: jest.fn<any>().mockResolvedValue({ ...EMPTY_COLUMNS }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  } as any;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma());
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });
  await app.register(meConsentsRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app;
}

function putConsent(app: FastifyInstance, purpose: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/me/consents/${purpose}`,
    headers: { 'content-type': 'application/json', 'x-test-user-id': USER_ID },
    payload,
  });
}

/** L'enveloppe standard reste intacte — les champs d'appoint s'ajoutent, ils ne remplacent rien. */
function expectStandardEnvelope(body: Record<string, unknown>, error: string) {
  expect(body.success).toBe(false);
  expect(body.error).toBe(error);
  expect(typeof body.message).toBe('string');
}

describe('Un 400 de validation dit QUEL CHAMP manquait', () => {
  it('policyVersion absent — les issues Zod survivent à la sérialisation et nomment le champ', async () => {
    const app = await buildApp();

    const res = await putConsent(app, 'data-processing', { granted: true });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expectStandardEnvelope(body, 'VALIDATION_ERROR');

    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].path).toEqual(['policyVersion']);
    expect(body.issues[0].code).toBe('invalid_type');
    expect(typeof body.issues[0].message).toBe('string');
  });

  it('clé en trop — l’issue unrecognized_keys nomme la clé refusée, que `path` laisse vide', async () => {
    const app = await buildApp();

    const res = await putConsent(app, 'data-processing', {
      granted: true,
      policyVersion: CONSENT_POLICY_VERSION,
      grantedAt: '2020-01-01T00:00:00Z',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.issues[0].code).toBe('unrecognized_keys');
    expect(body.issues[0].keys).toEqual(['grantedAt']);
  });

  it('deux champs fautifs — les DEUX issues arrivent, aucune n’est tronquée en route', async () => {
    const app = await buildApp();

    const res = await putConsent(app, 'data-processing', { granted: 'oui', policyVersion: '' });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.issues.map((issue: { path: string[] }) => issue.path)).toEqual([
      ['granted'],
      ['policyVersion'],
    ]);
  });
});

describe('Un 409 de politique dit QUELLE VERSION il attendait', () => {
  it('expectedPolicyVersion est servi, lisible par une machine — pas seulement en prose', async () => {
    const app = await buildApp();

    const res = await putConsent(app, 'data-processing', {
      granted: true,
      policyVersion: '2020-01-01',
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expectStandardEnvelope(body, 'CONSENT_POLICY_VERSION_MISMATCH');
    expect(body.expectedPolicyVersion).toBe(CONSENT_POLICY_VERSION);
  });
});

describe('Un 400 de purpose inconnu dit QUELS purpose existent', () => {
  it('allowedPurposes est servi, dans l’ordre de la hiérarchie', async () => {
    const app = await buildApp();

    const res = await putConsent(app, 'analytics', {
      granted: true,
      policyVersion: CONSENT_POLICY_VERSION,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expectStandardEnvelope(body, 'UNKNOWN_CONSENT_PURPOSE');
    expect(body.allowedPurposes).toEqual([...CONSENT_PURPOSES]);
  });
});
