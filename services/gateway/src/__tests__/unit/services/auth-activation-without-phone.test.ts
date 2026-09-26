/**
 * Sans numéro de téléphone, un compte n'est ACTIF qu'une fois son adresse
 * prouvée ; avec un numéro, il l'est tout de suite (#8055).
 *
 * Règle porteur 2026-09-26 : « Le code s'entre après la création de compte la
 * première fois pour continuer sur l'application ! Sans ce code on ne rejoint
 * aucun canal, le compte reste inactif ! Si un numéro est donné en plus de
 * l'email, le compte est activé directement. »
 *
 * Ces témoins portent sur `AuthService.authenticate` : le BON mot de passe
 * d'un compte non vérifié et sans numéro n'ouvre AUCUNE session — le refus
 * nomme l'adresse, pour que la route renvoie le code ; le même compte avec un
 * numéro garde sa session.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCompare = jest.fn() as jest.Mock<any>;
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  verifyPassword: (...a: any[]) => mockCompare(...a),
  hashPassword: jest.fn(async () => 'hashed'),
}));

const mockCreateSession = jest.fn(async () => ({ id: 'sess-1', isTrusted: false }));
jest.mock('../../../services/SessionService', () => ({
  generateSessionToken: () => 'session-token',
  createSession: (...a: unknown[]) => (mockCreateSession as jest.Mock<any>)(...a),
  initSessionService: jest.fn(),
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: jest.fn(async () => ({ success: true })),
  })),
}));

import { AuthService } from '../../../services/AuthService';
import { ActivationRequiresEmailProofError } from '../../../errors/custom-errors';

const compte = (overrides: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439011',
  username: 'lena',
  email: 'lena@example.com',
  password: 'hash-du-mot-de-passe',
  phoneNumber: null,
  firstName: 'Lena',
  lastName: 'Vogel',
  displayName: 'Lena Vogel',
  avatar: null,
  bio: '',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  role: 'USER',
  isActive: true,
  isOnline: false,
  lastActiveAt: new Date(),
  twoFactorEnabledAt: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastLoginDevice: null,
  timezone: null,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  pendingEmail: null,
  pendingPhoneNumber: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  failedLoginAttempts: 0,
  lockedUntil: null,
  ...overrides,
});

const service = (ligne: Record<string, unknown>) => {
  const update = jest.fn(async (_args: unknown) => ligne);
  const prisma = { user: { findFirst: jest.fn(async () => ligne), update, findUnique: jest.fn(async () => ligne) } };
  return { svc: new AuthService(prisma as never, 'secret-de-test'), update };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCompare.mockResolvedValue(true);
});

describe('compte NON vérifié et SANS numéro — le bon mot de passe', () => {
  it("n'ouvre aucune session : le refus nomme l'adresse à qui renvoyer le code", async () => {
    const { svc } = service(compte());

    const refus = await svc.authenticate({ username: 'lena', password: 'le-vrai' }).catch((e: unknown) => e);

    expect(refus).toBeInstanceOf(ActivationRequiresEmailProofError);
    expect((refus as ActivationRequiresEmailProofError).email).toBe('lena@example.com');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("ne marque pas la présence en ligne d'un compte inactif", async () => {
    const { svc, update } = service(compte());

    await svc.authenticate({ username: 'lena', password: 'le-vrai' }).catch(() => undefined);

    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isOnline: true }) }));
  });

  it('un mot de passe FAUX reste un échec ordinaire (null), jamais un renvoi de code', async () => {
    mockCompare.mockResolvedValue(false);
    const { svc } = service(compte());

    await expect(svc.authenticate({ username: 'lena', password: 'faux' })).resolves.toBeNull();
  });
});

describe('ce qui reste actif tout de suite', () => {
  it('compte non vérifié AVEC numéro : session ouverte', async () => {
    const { svc } = service(compte({ phoneNumber: '+33612345678' }));

    const res = await svc.authenticate({ username: 'lena', password: 'le-vrai' });

    expect(res?.sessionToken).toBe('session-token');
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('compte VÉRIFIÉ sans numéro : session ouverte', async () => {
    const { svc } = service(compte({ emailVerifiedAt: new Date() }));

    const res = await svc.authenticate({ username: 'lena', password: 'le-vrai' });

    expect(res?.sessionToken).toBe('session-token');
  });
});
