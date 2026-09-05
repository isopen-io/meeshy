/**
 * Le témoin de COMPORTEMENT de #4682 — l'inscription n'INVENTE aucun rang du
 * Prisme, et ne rétrograde jamais celui que le lecteur a demandé.
 *
 * ## Pourquoi ce témoin n'est pas écrit sur le cas nominal
 *
 * `AuthService.register` écrivait `systemLanguage: data.systemLanguage || 'fr'`
 * et `regionalLanguage: data.regionalLanguage || 'fr'`. **Quand les deux rangs
 * sont fournis, le repli et la règle juste écrivent la MÊME ligne** : un témoin
 * posé là ne peut pas tomber, et décore au lieu de mesurer (leçon 261, et
 * § « un témoin de RANG s'écrit sur un rang AUTRE que le premier » du
 * `CLAUDE.md` de ce service). Le premier `it` MESURE cette indiscernabilité
 * plutôt que de l'affirmer ; tous les autres sont écrits sur des inscriptions
 * qui laissent le rang 1 VIDE — le seul cas où les deux règles divergent.
 *
 * ## Pourquoi le témoin assert sur la LIGNE ÉCRITE
 *
 * Un compte reparti avec le mauvais rang 1 rend un `RegisterResult` parfaitement
 * valide : le défaut ne se voit pas dans un code de retour, il se voit à
 * l'écriture. Ce qui est mesuré ici est donc l'argument remis à
 * `prisma.user.create`, colonne par colonne — c'est ce que la base gardera, et
 * ce que le Prisme relira à chaque message.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockSendEmailVerification = jest.fn(
  (_donnees: { readonly language: string }) =>
    Promise.resolve({ success: true, provider: 'test', messageId: 'msg-4682' }),
);

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: mockSendEmailVerification,
  })),
}));

jest.mock('../../../services/SessionService', () => ({
  // Le témoin HTTP plus bas traverse le handler ENTIER, qui crée une session et
  // en lit l'`id` : des doubles rendant `undefined` y produiraient un 500 sans
  // aucun rapport avec le rang mesuré.
  generateSessionToken: jest.fn(() => 'session-token-4682'),
  createSession: jest.fn(async () => ({ id: 'session-4682' })),
  initSessionService: jest.fn(),
  validateSession: jest.fn(),
  getUserSessions: jest.fn(),
  invalidateSession: jest.fn(),
  invalidateAllSessions: jest.fn(),
  logout: jest.fn(),
}));

// Le hachage vit dans `utils/password-hash` depuis #5216 — c'est lui qu'on
// double, `bcryptjs` n'étant que le repli du binaire natif.
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn(async () => '$2b$12$hash-de-test'),
}));

import { AuthService, type RegisterData } from '../../../services/AuthService';
import { executeurImmediat } from '../../helpers/after-response';

/** Les colonnes de langue de la ligne `User` que l'inscription compose. */
type ColonnesDeLangue = {
  readonly systemLanguage: unknown;
  readonly regionalLanguage: unknown;
  readonly customDestinationLanguage: unknown;
  readonly deviceLocale: unknown;
};

type CreateRecu = { readonly data: Record<string, unknown> };

const inscription = (langues: Partial<RegisterData>): RegisterData => ({
  username: 'lectrice',
  password: 'MotDePasseSolide123!',
  firstName: 'Lena',
  lastName: 'Vogel',
  email: 'lectrice@example.com',
  ...langues,
});

const passerelle = () => {
  const create = jest.fn(async (args: unknown) => ({
    id: 'user-4682',
    ...(args as CreateRecu).data,
  }));
  return {
    prisma: {
      user: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        create,
      },
      conversation: { findFirst: jest.fn(async () => null) },
      participant: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'part-4682' })),
        update: jest.fn(async () => ({ id: 'part-4682' })),
      },
    },
    create,
  };
};

/** Les trois colonnes de langue que l'inscription REMET à la base. */
const ligneEcrite = async (langues: Partial<RegisterData>): Promise<ColonnesDeLangue> => {
  const { prisma, create } = passerelle();
  const service = new AuthService(prisma as never, 'secret-de-test');

  const resultat = await service.register(inscription(langues));

  expect(resultat?.user).toBeDefined();
  expect(create).toHaveBeenCalledTimes(1);
  const donnees = (create.mock.calls[0] as [CreateRecu])[0].data;
  return {
    systemLanguage: donnees.systemLanguage,
    regionalLanguage: donnees.regionalLanguage,
    customDestinationLanguage: donnees.customDestinationLanguage,
    deviceLocale: donnees.deviceLocale,
  };
};

/** La langue dans laquelle l'e-mail de vérification part au nouvel inscrit. */
const langueDeLEmail = async (langues: Partial<RegisterData>): Promise<string> => {
  const { prisma } = passerelle();
  const service = new AuthService(prisma as never, 'secret-de-test');
  // L'e-mail de vérification part APRÈS la réponse (#5216) : sans exécuteur
  // immédiat, ce témoin mesurerait le vide.
  const differe = executeurImmediat();

  await service.register(inscription(langues), undefined, { afterResponse: differe.afterResponse });
  await differe.settle();

  expect(mockSendEmailVerification).toHaveBeenCalledTimes(1);
  return (mockSendEmailVerification.mock.calls[0] as [{ language: string }])[0].language;
};

describe("l'inscription n'invente aucun rang du Prisme (#4682)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cas NOMINAL : les deux rangs fournis — repli et règle juste sont INDISCERNABLES', async () => {
    const ligne = await ligneEcrite({ systemLanguage: 'de', regionalLanguage: 'en' });

    expect(ligne.systemLanguage).toBe('de');
    expect(ligne.regionalLanguage).toBe('en');
  });

  it('rang 2 SEUL : le rang 1 ne vaut pas le repli — la langue demandée gagne', async () => {
    const ligne = await ligneEcrite({ regionalLanguage: 'de' });

    expect(ligne.systemLanguage).not.toBe('fr');
    expect(ligne.systemLanguage).toBe('de');
  });

  it('rang 3 SEUL : la langue demandée gagne, et le rang 1 ne vaut pas le repli', async () => {
    const ligne = await ligneEcrite({ customDestinationLanguage: 'es' });

    expect(ligne.systemLanguage).not.toBe('fr');
    expect(ligne.systemLanguage).toBe('es');
  });

  it("un rang que le lecteur n'a pas rempli n'est pas MATÉRIALISÉ", async () => {
    await expect(ligneEcrite({ systemLanguage: 'de' })).resolves.toEqual({
      systemLanguage: 'de',
      regionalLanguage: null,
      customDestinationLanguage: null,
      deviceLocale: null,
    });
  });

  it('le rang 3 demandé atteint SA colonne — il ne se perd pas en route', async () => {
    await expect(
      ligneEcrite({ systemLanguage: 'en', regionalLanguage: 'fr', customDestinationLanguage: 'pt' }),
    ).resolves.toEqual({
      systemLanguage: 'en',
      regionalLanguage: 'fr',
      customDestinationLanguage: 'pt',
      deviceLocale: null,
    });
  });

  it("l'e-mail de vérification part dans la langue SERVIE, pas au rang 1 littéral", async () => {
    await expect(langueDeLEmail({ regionalLanguage: 'de' })).resolves.toBe('de');
  });

  it("AUCUNE préférence NI locale : le repli du site est écrit, et il n'est écrit QUE là", async () => {
    await expect(ligneEcrite({})).resolves.toEqual({
      systemLanguage: 'fr',
      regionalLanguage: null,
      customDestinationLanguage: null,
      deviceLocale: null,
    });
  });
});

/**
 * Le RANG 4 — la locale appareil (#5216).
 *
 * Ces témoins sont écrits sur un rang AUTRE que le premier, et c'est la seule
 * façon de les faire tomber : au rang 1, le littéral `'fr'` et la descente juste
 * rendent le MÊME verdict (leçon 261, § « un témoin de RANG s'écrit sur un rang
 * autre que le premier »).
 */
describe('la locale appareil remplit le rang 1 — mais seulement quand rien ne le remplit (#5216)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("écrit la locale plutôt que le littéral quand l'inscription n'exprime AUCUNE langue", async () => {
    const ligne = await ligneEcrite({ deviceLocale: 'es-ES' });

    expect(ligne.systemLanguage).not.toBe('fr');
    expect(ligne.systemLanguage).toBe('es');
  });

  it("n'écrase JAMAIS une préférence exprimée, fût-elle d'un rang inférieur", async () => {
    const ligne = await ligneEcrite({ regionalLanguage: 'de', deviceLocale: 'es-ES' });

    expect(ligne.systemLanguage).toBe('de');
  });

  it('PERSISTE la colonne du rang 4 dès la création, normalisée', async () => {
    await expect(ligneEcrite({ systemLanguage: 'en', deviceLocale: 'pt-BR' })).resolves.toEqual({
      systemLanguage: 'en',
      regionalLanguage: null,
      customDestinationLanguage: null,
      deviceLocale: 'pt',
    });
  });

  it("laisse la colonne à null quand la locale n'est pas un code servable", async () => {
    const ligne = await ligneEcrite({ deviceLocale: '@@@' });

    expect(ligne.deviceLocale).toBeNull();
    expect(ligne.systemLanguage).toBe('fr');
  });

  it("l'e-mail de vérification part dans la langue de la locale, faute de mieux", async () => {
    await expect(langueDeLEmail({ deviceLocale: 'de-AT' })).resolves.toBe('de');
  });
});

/**
 * Le rang 4 SERVI PAR HTTP — le témoin qui ne pouvait pas exister avant #5216.
 *
 * `registerRequestSchema` posait `default: 'fr'` sur `systemLanguage` et
 * `regionalLanguage`, et **Ajv APPLIQUE les défauts** : il écrivait la clé dans
 * le corps avant que le handler ne le voie. Une inscription qui n'exprime aucune
 * langue arrivait donc au service en DEMANDANT du français, si bien que la
 * descente ne pouvait jamais atteindre son dernier rang.
 *
 * Ce témoin traverse donc la VRAIE couche Ajv, montée dans Fastify avec les
 * options du serveur : un `default` réintroduit dans le schéma partagé le fait
 * tomber, ce qu'aucune assertion sur `registrationLanguages` ne peut faire.
 */
describe('rang 4 servi par HTTP — le corps ne porte AUCUNE langue', () => {
  const inscrireParHTTP = async (headers: Record<string, string>) => {
    const Fastify = (await import('fastify')).default;
    const { registerRegistrationRoutes } = await import('../../../routes/auth/register');

    const { prisma, create } = passerelle();
    const app = Fastify({
      logger: false,
      // Mêmes options Ajv que `server.ts` : sans elles, Ajv refuse de compiler
      // les schémas OpenAPI du dépôt et `ready()` lève pour une raison sans
      // rapport avec le contrat mesuré.
      ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
    });
    app.decorate('prisma', prisma as never);

    const authService = new AuthService(prisma as never, 'secret-de-test');

    registerRegistrationRoutes({
      fastify: app,
      authService,
      phoneTransferService: { getTransferDataByToken: jest.fn(), executeRegistrationTransfer: jest.fn() },
      smsService: {},
      cacheStore: {},
      redis: null,
      prisma,
      afterResponse: executeurImmediat().afterResponse,
    } as never);

    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      headers,
      payload: {
        displayName: 'Lectrice Sans Langue',
        email: 'sans.langue@example.com',
        password: 'motdepasse',
      },
    });

    await app.close();

    return {
      statusCode: res.statusCode,
      ligne: create.mock.calls[0]
        ? ((create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data)
        : undefined,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sert la locale de l'en-tête X-Device-Locale au rang 1, pas le littéral 'fr'", async () => {
    const { statusCode, ligne } = await inscrireParHTTP({ 'x-device-locale': 'es-ES' });

    expect(statusCode).toBe(200);
    expect(ligne?.systemLanguage).toBe('es');
    expect(ligne?.deviceLocale).toBe('es');
  });

  it("retombe sur Accept-Language, en respectant les POIDS et non l'ordre d'écriture", async () => {
    const { statusCode, ligne } = await inscrireParHTTP({ 'accept-language': 'en;q=0.5, de;q=0.9' });

    expect(statusCode).toBe(200);
    expect(ligne?.systemLanguage).toBe('de');
  });

  it("préfère X-Device-Locale à Accept-Language — l'en-tête explicite gagne", async () => {
    const { ligne } = await inscrireParHTTP({
      'x-device-locale': 'pt-BR',
      'accept-language': 'de',
    });

    expect(ligne?.systemLanguage).toBe('pt');
  });

  it("écrit le repli terminal quand la requête ne porte AUCUNE locale", async () => {
    const { ligne } = await inscrireParHTTP({});

    expect(ligne?.systemLanguage).toBe('fr');
    expect(ligne?.deviceLocale).toBeNull();
  });
});
