/**
 * `POST /me/account/deletion` — chaque refus dit ce que le client doit FAIRE (#4811).
 *
 * Le défaut : la route répondait **401** à un mot de passe refusé, sur une
 * session parfaitement valide. C'est l'image en miroir des trois lots #4760,
 * #4789 et #4792 (des 403 qui auraient dû être 401, « je ne sais pas qui tu
 * es ») — ici un 401 qui ne devrait pas l'être, « je sais très bien qui tu es,
 * c'est ton mot de passe qui est faux ».
 *
 * MESURÉ, et c'est ce qui rend le défaut cher : `APIClient.mapUnauthorized`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:307`) rend
 * `.sessionExpired` pour tout 401 dont l'adresse n'est pas de type
 * `credentials`, et `MeEndpoint.accountDeletion` prend le défaut `.bearer`.
 * Le 401 entrait donc dans la branche rafraîchir → rejouer → `handleUnauthorized()`
 * (`APIClient.swift:740-782`) : **saisir un mauvais mot de passe pour supprimer
 * son compte déconnectait l'utilisateur**. Android tient la même règle
 * (`TokenRefreshPolicy.mapUnauthorized`, `JwtExpiry.kt:155`).
 *
 * Ce témoin couvre les QUATRE branches de la route et assert le STATUT **et** le
 * CODE de chacune, sur le corps SÉRIALISÉ — jamais sur un double du gestionnaire,
 * puisque c'est exactement la couche `fast-json-stringify` qui décide de ce qui
 * atteint le client. Il assert de plus, mécaniquement et depuis la route
 * ASSEMBLÉE (`onRoute`), que chaque statut servi est DÉCLARÉ : un statut non
 * déclaré échappe entièrement au sérialiseur (Fastify 5 retombe sur
 * `JSON.stringify`), ce qui est l'asymétrie de #4689.
 *
 * Aucune assertion ne porte sur la VALEUR d'un mot de passe : le double de
 * `bcrypt.compare` rend un verdict, il ne reçoit aucun secret à comparer.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const mockCompare = jest.fn() as jest.Mock<any>;
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { compare: (...a: any[]) => mockCompare(...a) },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const mockEnvoiCourriel = jest.fn(async () => undefined);
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendAccountDeletionConfirmEmail: mockEnvoiCourriel,
  })),
}));

import { deleteAccountRoutes } from '../../../routes/me/delete-account';

const PREFIXE = '/api/v1/me';
const CHEMIN = '/account/deletion';
const USER_ID = '507f1f77bcf86cd799439011';
const PHRASE = 'SUPPRIMER MON COMPTE';

type Compte = { email: string | null; password: string } | null;

type Montage = {
  readonly app: FastifyInstance;
  /** Ce que le gestionnaire a ÉCRIT — une ouverture de demande se voit ici. */
  readonly creations: ReadonlyArray<Record<string, unknown>>;
  /** Les statuts que la route ASSEMBLÉE déclare, relevés par `onRoute`. */
  readonly statutsDeclares: ReadonlyArray<string>;
};

function prismaAvec(compte: Compte) {
  const creations: Array<Record<string, unknown>> = [];
  return {
    creations,
    prisma: {
      accountDeletionRequest: {
        findFirst: jest.fn(async () => null),
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          creations.push(data);
          return { id: 'req-1', ...data };
        }),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      user: {
        findUnique: jest.fn(async () => compte),
        update: jest.fn(async () => ({})),
      },
      $transaction: jest.fn(async () => []),
    },
  };
}

/**
 * Monte la VRAIE route avec sa VRAIE garde de session.
 *
 * `sessionResolue: false` fait passer `fastify.authenticate` SANS poser de
 * contexte : c'est la seule façon d'exercer la garde du gestionnaire
 * (`!authContext?.isAuthenticated`), qui est une défense en profondeur derrière
 * le middleware et ne peut donc pas être atteinte autrement.
 */
async function monter(compte: Compte, sessionResolue = true): Promise<Montage> {
  const { prisma, creations } = prismaAvec(compte);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const statutsDeclares: string[] = [];
  app.addHook('onRoute', (route) => {
    if (route.method !== 'POST' || route.url !== `${PREFIXE}${CHEMIN}`) return;
    const reponses = (route.schema as { response?: Record<string, unknown> } | undefined)?.response;
    statutsDeclares.push(...Object.keys(reponses ?? {}));
  });

  app.decorate('authenticate', async (req: any) => {
    if (!sessionResolue) return;
    req.authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', undefined as never);
  await app.register(async (i) => { await deleteAccountRoutes(i); }, { prefix: PREFIXE });
  await app.ready();

  return { app, creations, statutsDeclares };
}

const ouvrir = (app: FastifyInstance) =>
  app.inject({
    method: 'POST',
    url: `${PREFIXE}${CHEMIN}`,
    payload: { confirmationPhrase: PHRASE, currentPassword: 'peu-importe' },
  });

const COMPTE = { email: 'a@b.c', password: 'hash' };

beforeEach(() => {
  mockCompare.mockReset();
  mockEnvoiCourriel.mockClear();
});

describe('POST /me/account/deletion — un refus dit ce que le client doit FAIRE', () => {
  it('mot de passe refusé ⇒ 400 INVALID_PASSWORD, jamais 401', async () => {
    mockCompare.mockResolvedValue(false);
    const { app, creations } = await monter(COMPTE);

    const res = await ouvrir(app);
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(400);
    expect(corps.code).toBe('INVALID_PASSWORD');
    // La phrase lisible SURVIT au sérialiseur — c'est elle que le web lit en
    // premier (`api.service.ts`, `data.message || data.error`).
    expect(corps.message).toBe('Mot de passe incorrect');
    expect(corps.success).toBe(false);
    // Un refus n'ouvre rien.
    expect(creations).toHaveLength(0);

    await app.close();
  });

  it('compte introuvable ⇒ 404 ACCOUNT_NOT_FOUND, jamais 401', async () => {
    // Le seul chemin qui y mène : une session résolue par le cache d'auth pour
    // une ligne purgée entre-temps, ou une lecture servie par un secondaire en
    // retard. Ce second cas ne PROUVE pas la disparition du compte — un 401 y
    // déconnecterait quelqu'un sur une lecture qui ne conclut pas.
    const { app, creations } = await monter(null);

    const res = await ouvrir(app);
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(404);
    expect(corps.code).toBe('ACCOUNT_NOT_FOUND');
    expect(corps.message).toBe('Compte introuvable');
    expect(creations).toHaveLength(0);
    // La comparaison n'a même pas eu lieu : rien n'est passé à bcrypt.
    expect(mockCompare).not.toHaveBeenCalled();

    await app.close();
  });

  it('session absente ⇒ 401 UNAUTHORIZED — le SEUL 401 que la route sert encore', async () => {
    const { app, creations } = await monter(COMPTE, false);

    const res = await ouvrir(app);
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(401);
    expect(corps.code).toBe('UNAUTHORIZED');
    expect(corps.message).toBe('Authentication required');
    expect(creations).toHaveLength(0);

    await app.close();
  });

  it('tout prouvé ⇒ 200, la demande est ouverte et le courriel part', async () => {
    mockCompare.mockResolvedValue(true);
    const { app, creations } = await monter(COMPTE);

    const res = await ouvrir(app);
    const corps = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(corps.success).toBe(true);
    expect(corps.data.tokenExpiresAt).toEqual(expect.any(String));
    expect(creations).toHaveLength(1);
    expect(mockEnvoiCourriel).toHaveBeenCalledTimes(1);

    await app.close();
  });
});

describe('POST /me/account/deletion — aucun 401 sur une session VALIDE', () => {
  /**
   * La forme NÉGATIVE du défaut, et c'est elle qui aurait rougi.
   *
   * Une assertion de statut par branche dit ce que chaque branche rend ; celle-ci
   * dit ce qu'aucune branche n'a le droit de rendre — un 401 alors que la session
   * a été résolue. C'est la phrase exacte que les clients traduisent en
   * « session expirée » (iOS `mapUnauthorized`, Android `TokenRefreshPolicy`), et
   * la seule qu'un futur refus ajouté à cette route ne doit pas réintroduire.
   */
  it.each([
    ['mot de passe refusé', false, COMPTE as Compte],
    ['compte introuvable', true, null as Compte],
  ])('%s ne rend pas 401', async (_nom, verdictBcrypt, compte) => {
    mockCompare.mockResolvedValue(verdictBcrypt);
    const { app } = await monter(compte);

    const res = await ouvrir(app);

    expect(res.statusCode).not.toBe(401);

    await app.close();
  });
});

describe('POST /me/account/deletion — chaque statut servi est DÉCLARÉ', () => {
  /**
   * Relevé depuis la route ASSEMBLÉE (`onRoute`), jamais depuis une seconde liste
   * écrite ici — une liste recopiée dériverait sans rougir.
   *
   * MESURÉ : un statut NON déclaré échappe entièrement à `fast-json-stringify`
   * (Fastify 5 retombe sur `JSON.stringify`, qui ne retire rien), donc le corps
   * d'un refus 404 non déclaré ne serait gouverné par aucun contrat — l'asymétrie
   * de #4689, où « déclarer son schéma » était le geste qui faisait perdre des
   * champs.
   */
  it('les quatre statuts des quatre branches figurent au schéma de réponse', async () => {
    const { app, statutsDeclares } = await monter(COMPTE);

    expect(statutsDeclares).toEqual(expect.arrayContaining(['200', '400', '401', '404']));

    await app.close();
  });
});
