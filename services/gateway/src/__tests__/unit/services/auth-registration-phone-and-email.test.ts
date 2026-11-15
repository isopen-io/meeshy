/**
 * Ce que l'inscription fait du NUMÉRO et de l'E-MAIL de vérification.
 *
 * ## Pourquoi ces témoins vivent ici
 *
 * Ils vivaient dans `AuthService.test.ts` (2472 lignes pour un plafond de
 * 1000). Le lot #5216 devait y ajouter — l'e-mail part désormais APRÈS la
 * réponse, et un numéro illisible est un refus TYPÉ — et **le dépôt interdit
 * d'ajouter à un fichier hors budget : on extrait d'abord**. Ce qui part est la
 * responsabilité entière, pas une tranche.
 *
 * ## Ce que ce harnais fait de MOINS que celui d'origine, exprès
 *
 * `AuthService.test.ts` double `utils/normalize` — donc `normalizePhoneWithCountry`,
 * c'est-à-dire la fonction dont dépend TOUT ce que ce fichier mesure. Un double
 * y décide du verdict à la place de la production. Ici la normalisation est
 * RÉELLE : « pas-un-numero » est refusé parce que c'en est un mauvais, et
 * `+33698765432` passe parce que c'en est un bon.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockSendEmailVerification = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: mockSendEmailVerification,
  })),
}));

jest.mock('../../../services/SessionService', () => ({
  generateSessionToken: jest.fn(() => 'session-token'),
  createSession: jest.fn(async () => ({ id: 'session-1' })),
  initSessionService: jest.fn(),
  validateSession: jest.fn(),
  getUserSessions: jest.fn(),
  invalidateSession: jest.fn(),
  invalidateAllSessions: jest.fn(),
  logout: jest.fn(),
}));

// Le hachage réel coûte des centaines de millisecondes par témoin (coût 12) ;
// sa propriété est gardée chez lui (`utils/password-hash`).
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn(async () => '$2b$12$hash-de-test'),
}));

import { AuthService, type RegisterData } from '../../../services/AuthService';
import { executeurImmediat } from '../../helpers/after-response';

const INSCRIPTION: RegisterData = {
  username: 'newuser',
  password: 'SecurePass123!',
  firstName: 'New',
  lastName: 'User',
  email: 'newuser@example.com',
  phoneNumber: '+33698765432',
};

const passerelle = () => {
  const findFirst = jest.fn() as jest.Mock<any>;
  const create = jest.fn(async (args: unknown) => ({
    id: 'user-cree',
    ...((args as { data: Record<string, unknown> }).data),
  }));
  findFirst.mockResolvedValue(null);

  return {
    findFirst,
    create,
    prisma: {
      user: { findFirst, findMany: jest.fn(async () => []), create, update: jest.fn() },
      conversation: { findFirst: jest.fn(async () => null) },
      participant: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'part-1' })),
        update: jest.fn(async () => ({ id: 'part-1' })),
      },
    },
  };
};

describe('inscription — le NUMÉRO', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEmailVerification.mockResolvedValue({ success: true, provider: 'test', messageId: 'm' });
  });

  it("rend un CHOIX quand le numéro appartient à un autre compte vérifié — pas un refus", async () => {
    const { prisma, findFirst, create } = passerelle();
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'owner-id',
        displayName: 'Phone Owner',
        username: 'phoneowner',
        email: 'owner@example.com',
        avatar: null,
      });

    const result = await new AuthService(prisma as never, 'secret').register(INSCRIPTION);

    expect(result?.phoneOwnershipConflict).toBe(true);
    expect(result?.phoneOwnerInfo?.phoneNumber).toBe('+33698765432');
    expect(result?.user).toBeUndefined();
    // AUCUN compte n'est créé : c'est la moitié qui compte, la personne doit
    // choisir (se connecter, continuer sans le numéro, transférer).
    expect(create).not.toHaveBeenCalled();
  });

  it('saute la vérification de conflit quand un transfert a été prouvé', async () => {
    const { prisma, create } = passerelle();

    const result = await new AuthService(prisma as never, 'secret').register({
      ...INSCRIPTION,
      skipPhoneConflictCheck: true,
    });

    expect(result?.user).toBeDefined();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("marque le numéro VÉRIFIÉ à la création — il ouvre la réinitialisation par SMS", async () => {
    const { prisma, create } = passerelle();

    await new AuthService(prisma as never, 'secret').register(INSCRIPTION);

    const donnees = (create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(donnees.phoneNumber).toBe('+33698765432');
    expect(donnees.phoneVerifiedAt).toBeInstanceOf(Date);
  });

  it("laisse la colonne VIDE quand l'inscription ne donne pas de numéro", async () => {
    const { prisma, create } = passerelle();

    await new AuthService(prisma as never, 'secret').register({ ...INSCRIPTION, phoneNumber: undefined });

    const donnees = (create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(donnees.phoneNumber).toBeNull();
    expect(donnees.phoneVerifiedAt).toBeNull();
  });

  it('REFUSE un numéro illisible en le NOMMANT, et n’écrit rien', async () => {
    const { prisma, create } = passerelle();

    await expect(
      new AuthService(prisma as never, 'secret').register({ ...INSCRIPTION, phoneNumber: 'pas-un-numero' }),
    ).rejects.toMatchObject({ code: 'PHONE_INVALID', field: 'phoneNumber', status: 400 });

    expect(create).not.toHaveBeenCalled();
  });
});

describe("inscription — l'E-MAIL de vérification part APRÈS la réponse (#5216)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEmailVerification.mockResolvedValue({ success: true, provider: 'resend', messageId: 'msg' });
  });

  it("ne part PAS pendant l'appel — il ne conditionne aucun champ du résultat", async () => {
    const { prisma } = passerelle();
    const differe = executeurImmediat();

    const result = await new AuthService(prisma as never, 'secret').register(
      { ...INSCRIPTION, phoneNumber: undefined },
      undefined,
      { afterResponse: differe.afterResponse },
    );

    expect(result?.user).toBeDefined();
    expect(differe.labels).toContain('registration-verification-email');
    await differe.settle();
    expect(mockSendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it("ne fait JAMAIS échouer l'inscription quand l'envoi tombe", async () => {
    const { prisma } = passerelle();
    const differe = executeurImmediat();
    mockSendEmailVerification.mockRejectedValue(new Error('SMTP down'));

    const result = await new AuthService(prisma as never, 'secret').register(
      { ...INSCRIPTION, phoneNumber: undefined },
      undefined,
      { afterResponse: differe.afterResponse },
    );
    await differe.settle();

    expect(result?.user).toBeDefined();
  });
});
