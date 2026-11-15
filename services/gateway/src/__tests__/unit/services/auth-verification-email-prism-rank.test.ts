/**
 * Le témoin de COMPORTEMENT de #4642 — l'e-mail de vérification part dans la
 * langue du lecteur, au RANG où cette langue vit.
 *
 * ## Pourquoi ce témoin est écrit sur un rang AUTRE que le premier
 *
 * `AuthService.resendVerificationEmail` chargeait `systemLanguage` SEUL et
 * appelait `recipientLanguage(user, 'fr')`. **Au rang 1, la projection étroite
 * et la projection complète rendent le même verdict** : un témoin posé sur
 * `systemLanguage` ne peut pas tomber, et décore au lieu de mesurer (leçon 261,
 * et § « un témoin de RANG s'écrit sur un rang AUTRE que le premier » du
 * `CLAUDE.md` de ce service). Les deux comptes exercés ici portent donc leur
 * langue au rang 2 (`regionalLanguage`) et au rang 4 (`deviceLocale`) — les
 * deux rangs qu'une projection étroite fait disparaître.
 *
 * Le premier `it` MESURE cette indiscernabilité plutôt que de l'affirmer : sur
 * un compte de rang 1, les deux projections rendent la même langue.
 *
 * ## Pourquoi le double Prisma PROJETTE
 *
 * C'est la condition sans laquelle ce témoin ne peut pas tomber. Un double qui
 * rend ce qu'on lui dit, quel que soit le `select`, sert les quatre rangs à un
 * appelant qui n'en charge qu'un : le témoin passe au vert sur une descente
 * MORTE en production. Le `select` est la seule des deux moitiés de la descente
 * qu'aucun témoin de rang ne peut voir — sauf si le double la respecte.
 *
 * `projeter` applique donc le `select` reçu à une ligne `User` complète,
 * exactement comme la base : une colonne non demandée arrive `undefined`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/** La charge que l'envoi reçoit — seule sa `language` est en cause ici. */
type MockEnvoiDeVerification = { readonly language: string };

const mockSendEmailVerification = jest.fn(
  (_donnees: MockEnvoiDeVerification) => Promise.resolve(undefined),
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

import { AuthService } from '../../../services/AuthService';
import { recipientLanguage } from '../../../utils/recipient-language';

/** Une ligne `User`, telle que la base la porte — tous les rangs du Prisme. */
type LigneUser = {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly systemLanguage: string | null;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
  readonly deviceLocale: string | null;
  readonly emailVerifiedAt: Date | null;
};

const ligne = (prisme: Partial<LigneUser>): LigneUser => ({
  id: 'user-4642',
  email: 'lecteur@example.com',
  firstName: 'Lena',
  lastName: 'Vogel',
  displayName: 'Lena Vogel',
  systemLanguage: null,
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  emailVerifiedAt: null,
  ...prisme,
});

/** Ce que la base rend : les colonnes DEMANDÉES, et elles seules. */
const projeter = (
  row: LigneUser,
  select: Readonly<Record<string, unknown>>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(select)
      .filter(([, demande]) => demande === true)
      .map(([colonne]) => [colonne, (row as unknown as Record<string, unknown>)[colonne]]),
  );

const PROJECTION_ETROITE = { systemLanguage: true } as const;
const PROJECTION_COMPLETE = {
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
  deviceLocale: true,
} as const;

type SelectRecu = { readonly select: Readonly<Record<string, unknown>> };

const passerelleServant = (row: LigneUser) => {
  const findFirst = jest.fn(async (args: unknown) =>
    projeter(row, (args as SelectRecu).select),
  );
  return {
    prisma: { user: { findFirst, update: jest.fn(async () => ({})) } },
    findFirst,
  };
};

const langueServie = async (row: LigneUser): Promise<string> => {
  const { prisma } = passerelleServant(row);
  const service = new AuthService(prisma as never, 'secret-de-test');

  const resultat = await service.resendVerificationEmail(row.email);

  expect(resultat.success).toBe(true);
  expect(mockSendEmailVerification).toHaveBeenCalledTimes(1);
  return (mockSendEmailVerification.mock.calls[0] as [MockEnvoiDeVerification])[0].language;
};

describe("l'e-mail de vérification descend le Prisme du lecteur (#4642)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rang 1 : les deux projections sont INDISCERNABLES — un témoin posé là ne peut pas tomber', () => {
    const rang1 = ligne({ systemLanguage: 'de' });

    expect(recipientLanguage(projeter(rang1, PROJECTION_ETROITE), 'fr')).toBe('de');
    expect(recipientLanguage(projeter(rang1, PROJECTION_COMPLETE), 'fr')).toBe('de');
  });

  it('rang 2 : la projection étroite RETIRE la langue, la complète la sert', () => {
    const rang2 = ligne({ regionalLanguage: 'de' });

    expect(recipientLanguage(projeter(rang2, PROJECTION_ETROITE), 'fr')).toBe('fr');
    expect(recipientLanguage(projeter(rang2, PROJECTION_COMPLETE), 'fr')).toBe('de');
  });

  it("sert l'allemand à un compte dont la langue vit dans `regionalLanguage` SEUL", async () => {
    await expect(langueServie(ligne({ regionalLanguage: 'de' }))).resolves.toBe('de');
  });

  it("sert l'espagnol à un compte dont seule la LOCALE APPAREIL est connue (rang 4)", async () => {
    await expect(langueServie(ligne({ deviceLocale: 'es-ES' }))).resolves.toBe('es');
  });

  it('laisse la langue applicative gagner sur la locale appareil', async () => {
    await expect(
      langueServie(ligne({ regionalLanguage: 'de', deviceLocale: 'en-US' })),
    ).resolves.toBe('de');
  });

  it("retombe sur le repli du SITE quand le compte n'a AUCUNE préférence", async () => {
    await expect(langueServie(ligne({}))).resolves.toBe('fr');
  });

  it('DEMANDE les quatre colonnes du Prisme à la base', async () => {
    // Le couple que le cliquet de balayage garde statiquement, mesuré ici sur
    // la requête RÉELLE : c'est la moitié de la descente qu'un témoin de rang
    // ne verrait pas si le double ne projetait pas.
    const { prisma, findFirst } = passerelleServant(ligne({ regionalLanguage: 'de' }));
    const service = new AuthService(prisma as never, 'secret-de-test');

    await service.resendVerificationEmail('lecteur@example.com');

    const select = (findFirst.mock.calls[0]?.[0] as SelectRecu).select;
    expect(select).toMatchObject(PROJECTION_COMPLETE);
  });
});
