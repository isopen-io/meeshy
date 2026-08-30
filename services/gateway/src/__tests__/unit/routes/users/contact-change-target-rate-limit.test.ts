/**
 * Le plafond par VALEUR CIBLE n'est PAS le plafond par compte (#4341, point 2).
 *
 * Le second est déjà posé (3/h par compte, `createContactChangeRateLimitConfig`) ;
 * ce fichier garde le PREMIER — 5 demandes par JOUR vers la MÊME adresse email,
 * tous comptes appelants confondus. Ils ne protègent pas la même chose : l'un
 * borne un compte bavard, l'autre le harcèlement d'un même numéro/adresse
 * depuis PLUSIEURS comptes.
 *
 * ## Pourquoi le témoin s'écrit sur DEUX comptes
 *
 * À un seul compte, « le plafond compte par valeur » et « le plafond compte
 * par compte » rendent le MÊME verdict — le témoin ne pourrait pas distinguer
 * les deux, et ne pourrait donc pas tomber si quelqu'un remplaçait la clé par
 * `userId` par erreur. Ici, DEUX comptes distincts (A et B) visent la MÊME
 * adresse ; chacun reste individuellement sous n'importe quel plafond par
 * compte plausible (2-3 appels chacun), et pourtant le 6e appel COMBINÉ est
 * refusé — la seule explication possible est une clé par VALEUR.
 *
 * ## Pourquoi le témoin couvre les DEUX portes d'entrée
 *
 * `POST /users/me/change-email` (l'ancienne adresse, #4184) reste montée en
 * alias vivant, et Android l'appelle encore. Un plafond posé UNIQUEMENT sur
 * la nouvelle `POST /users/me/contact-changes` se contournerait d'un simple
 * appel à l'ancienne — exactement le défaut que la directive de réservation
 * nomme : « livrer l'un en croyant avoir l'autre ». Les deux routes partagent
 * la MÊME fonction exportée (`verifierPlafondValeurCible`,
 * `routes/users/contact-change.ts`) : ce témoin mélange les deux portes dans
 * la même séquence pour le prouver.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/normalize', () => ({
  normalizeEmail: (e: string) => e.toLowerCase(),
  normalizePhoneNumber: (p: string) => `+33${p.replace(/\D/g, '').slice(-9)}`,
}));
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({ sendEmailChangeVerification: jest.fn<any>().mockResolvedValue(undefined) })),
}));
jest.mock('../../../../services/SmsService', () => ({
  smsService: { sendVerificationCode: jest.fn<any>().mockResolvedValue({ success: true, provider: 'test' }) },
}));
jest.mock('bcryptjs', () => ({
  default: { compare: jest.fn<any>().mockResolvedValue(true) },
  compare: jest.fn<any>().mockResolvedValue(true),
}));

/** Un cache STATEFUL, partagé par les DEUX routes — comme en production. */
const memoire = new Map<string, string>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async (k: string) => memoire.get(k) ?? null,
    set: async (k: string, v: string) => { memoire.set(k, v); },
    del: async (k: string) => { memoire.delete(k); },
  }),
}));

import { initiateEmailChange } from '../../../../routes/users/contact-change';
import { initiateContactChange } from '../../../../routes/users/contact-changes';

const USER_A = '507f1f77bcf86cd799439aaa';
const USER_B = '507f1f77bcf86cd799439bbb';
const CIBLE = 'harcelee@test.com';

function utilisateur(id: string, email: string) {
  return {
    id, email, phoneNumber: null, password: 'hashed-password',
    firstName: 'Test', lastName: 'User', displayName: 'Test User',
    systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
  };
}

function makePrisma() {
  const users: Record<string, any> = {
    [USER_A]: utilisateur(USER_A, 'a@current.com'),
    [USER_B]: utilisateur(USER_B, 'b@current.com'),
  };
  return {
    user: {
      findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null),
      findFirst: jest.fn(async () => null), // la cible n'est jamais déjà prise
      update: jest.fn(async () => ({})),
    },
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  // La clé de COMPTE vient d'un en-tête de test — deux comptes RÉELS et
  // DISTINCTS, jamais une simulation via un seul `userId` réutilisé.
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const compte = req.headers['x-test-account'] === 'B' ? USER_B : USER_A;
    (req as any).authContext = { isAuthenticated: true, userId: compte, registeredUser: { id: compte } };
  });
  await initiateEmailChange(app);   // l'ANCIENNE porte (#4184), alias vivant
  await initiateContactChange(app); // la NOUVELLE porte (#4341)
  await app.ready();
  return app;
}

const initierAncienneAdresse = (app: FastifyInstance, compte: 'A' | 'B', email: string) =>
  app.inject({
    method: 'POST',
    url: '/users/me/change-email',
    headers: { 'x-test-account': compte },
    payload: { newEmail: email },
  });

const initierNouvelleAdresse = (app: FastifyInstance, compte: 'A' | 'B', email: string) =>
  app.inject({
    method: 'POST',
    url: '/users/me/contact-changes',
    headers: { 'x-test-account': compte },
    payload: { channel: 'email', value: email, currentPassword: 'peu importe' },
  });

beforeEach(() => { memoire.clear(); });

describe('#4341 — le plafond par valeur cible compte ENSEMBLE deux comptes distincts, sur les DEUX portes', () => {
  it('refuse le 6e appel combiné vers la même adresse, alors que CHAQUE compte reste sous 3 appels', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    // Compte A : 2 appels sur l'ANCIENNE porte.
    const a1 = await initierAncienneAdresse(app, 'A', CIBLE);
    const a2 = await initierAncienneAdresse(app, 'A', CIBLE);
    expect(a1.statusCode).toBe(200);
    expect(a2.statusCode).toBe(200);

    // Compte B : 2 appels sur l'ANCIENNE porte. Total combiné = 4.
    const b1 = await initierAncienneAdresse(app, 'B', CIBLE);
    const b2 = await initierAncienneAdresse(app, 'B', CIBLE);
    expect(b1.statusCode).toBe(200);
    expect(b2.statusCode).toBe(200);

    // Compte A : 1 appel sur la NOUVELLE porte. Total combiné = 5 (AU plafond).
    const a3 = await initierNouvelleAdresse(app, 'A', CIBLE);
    expect(a3.statusCode).toBe(200);

    // Compte B, 3e appel — SOUS tout plafond par compte plausible (3/h) — sur
    // l'ANCIENNE porte. Total combiné = 6 : REFUSÉ, et seulement par la clé
    // de VALEUR — B n'a fait que 3 appels, A que 3 non plus.
    const b3 = await initierAncienneAdresse(app, 'B', CIBLE);
    expect(b3.statusCode).toBe(429);

    // Et le 6e sur la NOUVELLE porte est REFUSÉ de la même façon : la même
    // clé, le même compteur, la même barrière.
    const a4 = await initierNouvelleAdresse(app, 'A', CIBLE);
    expect(a4.statusCode).toBe(429);

    await app.close();
  });

  it("n'affecte pas une valeur CIBLE différente — la clé est la valeur, jamais le compte", async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    for (let i = 0; i < 5; i += 1) {
      const res = await initierAncienneAdresse(app, i % 2 === 0 ? 'A' : 'B', CIBLE);
      expect(res.statusCode).toBe(200);
    }
    // La cible est épuisée...
    expect((await initierAncienneAdresse(app, 'A', CIBLE)).statusCode).toBe(429);
    // ...mais une AUTRE cible, depuis le MÊME compte déjà bien sollicité, passe.
    expect((await initierNouvelleAdresse(app, 'A', 'autre-cible@test.com')).statusCode).toBe(200);

    await app.close();
  });
});
