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
  generateSessionToken: jest.fn(),
  createSession: jest.fn(),
  initSessionService: jest.fn(),
  validateSession: jest.fn(),
  getUserSessions: jest.fn(),
  invalidateSession: jest.fn(),
  invalidateAllSessions: jest.fn(),
  logout: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { hash: jest.fn(async () => '$2b$12$hash-de-test') },
  hash: jest.fn(async () => '$2b$12$hash-de-test'),
}));

import { AuthService, type RegisterData } from '../../../services/AuthService';

/** Les colonnes de langue de la ligne `User` que l'inscription compose. */
type ColonnesDeLangue = {
  readonly systemLanguage: unknown;
  readonly regionalLanguage: unknown;
  readonly customDestinationLanguage: unknown;
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
      user: { findFirst: jest.fn(async () => null), create },
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
  };
};

/** La langue dans laquelle l'e-mail de vérification part au nouvel inscrit. */
const langueDeLEmail = async (langues: Partial<RegisterData>): Promise<string> => {
  const { prisma } = passerelle();
  const service = new AuthService(prisma as never, 'secret-de-test');

  await service.register(inscription(langues));

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
    });
  });

  it('le rang 3 demandé atteint SA colonne — il ne se perd pas en route', async () => {
    await expect(
      ligneEcrite({ systemLanguage: 'en', regionalLanguage: 'fr', customDestinationLanguage: 'pt' }),
    ).resolves.toEqual({
      systemLanguage: 'en',
      regionalLanguage: 'fr',
      customDestinationLanguage: 'pt',
    });
  });

  it("l'e-mail de vérification part dans la langue SERVIE, pas au rang 1 littéral", async () => {
    await expect(langueDeLEmail({ regionalLanguage: 'de' })).resolves.toBe('de');
  });

  it("AUCUNE préférence : le repli du site est écrit, et il n'est écrit QUE là", async () => {
    await expect(ligneEcrite({})).resolves.toEqual({
      systemLanguage: 'fr',
      regionalLanguage: null,
      customDestinationLanguage: null,
    });
  });
});
