/**
 * La porte du MOT DE PASSE sous le délai de grâce de l'adresse (#8238), qui
 * REMPLACE le blocage immédiat de #8055.
 *
 * Un compte sans numéro dont l'adresse n'est pas prouvée s'utilise 7 jours
 * sans rien (`quiet`), reste ouvert de J7 à J28 (`invite`), puis est bloqué
 * (`blocked`) : le BON mot de passe n'ouvre alors aucune session — le refus
 * nomme l'adresse, pour que la route renvoie le code.
 *
 * Horloge INJECTÉE (`AuthServiceOptions.now`) : jamais l'horloge murale.
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
import { ACTIVATION_GRACE_EPOCH } from '../../../services/auth/account-activation';

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED = new Date(ACTIVATION_GRACE_EPOCH.getTime() + DAY_MS);
const jour = (n: number): Date => new Date(CREATED.getTime() + n * DAY_MS);

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
  createdAt: CREATED,
  updatedAt: CREATED,
  failedLoginAttempts: 0,
  lockedUntil: null,
  ...overrides,
});

const service = (ligne: Record<string, unknown>, maintenant: Date = jour(30)) => {
  const update = jest.fn(async (_args: unknown) => ligne);
  const prisma = { user: { findFirst: jest.fn(async () => ligne), update, findUnique: jest.fn(async () => ligne) } };
  return { svc: new AuthService(prisma as never, 'secret-de-test', { now: () => maintenant }), update };
};

const envoisDeVerification = (svc: AuthService): jest.Mock =>
  (svc as unknown as { emailService: { sendEmailVerification: jest.Mock } }).emailService.sendEmailVerification;

beforeEach(() => {
  jest.clearAllMocks();
  mockCompare.mockResolvedValue(true);
});

describe('compte NON vérifié et SANS numéro, J28 passé (`blocked`) — le bon mot de passe', () => {
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

describe('compte NON vérifié et SANS numéro, pendant le délai de grâce', () => {
  it.each([
    ['J0 (`quiet`)', 0],
    ['J6 (`quiet`)', 6],
    ['J7 (`invite`)', 7],
    ['J27 (`invite`)', 27],
  ] as const)('%s : session ouverte', async (_nom, j) => {
    const { svc } = service(compte(), jour(j));

    const res = await svc.authenticate({ username: 'lena', password: 'le-vrai' });

    expect(res?.sessionToken).toBe('session-token');
    expect(res?.user.activation?.phase).toBe(j < 7 ? 'quiet' : 'invite');
    expect(res?.user.activation?.deadline).toBe(jour(28).toISOString());
  });

  it("aucun e-mail n'est envoyé à la connexion : rien n'est demandé pendant le délai", async () => {
    const { svc } = service(compte(), jour(10));

    await svc.authenticate({ username: 'lena', password: 'le-vrai' });

    expect(envoisDeVerification(svc)).not.toHaveBeenCalled();
  });

  it('J28 : refusé', async () => {
    const { svc } = service(compte(), jour(28));
    await expect(svc.authenticate({ username: 'lena', password: 'le-vrai' })).rejects.toBeInstanceOf(ActivationRequiresEmailProofError);
  });
});

describe("l'horloge démarre au déploiement pour un compte qui existait déjà", () => {
  it("un compte vieux d'un an, non vérifié et sans numéro, se connecte le jour du déploiement", async () => {
    const { svc } = service(compte({ createdAt: new Date('2025-06-01T00:00:00.000Z') }), ACTIVATION_GRACE_EPOCH);

    const res = await svc.authenticate({ username: 'lena', password: 'le-vrai' });

    expect(res?.user.activation?.phase).toBe('quiet');
  });
});

describe('ce qui n’est jamais bloqué', () => {
  it('compte non vérifié AVEC numéro, même à J400 : session ouverte, invitation sans échéance', async () => {
    const { svc } = service(compte({ phoneNumber: '+33612345678' }), jour(400));

    const res = await svc.authenticate({ username: 'lena', password: 'le-vrai' });

    expect(res?.sessionToken).toBe('session-token');
    expect(res?.user.activation).toEqual({ phase: 'invite', deadline: null, missing: ['email'] });
    expect(envoisDeVerification(svc)).not.toHaveBeenCalled();
  });

  it('compte VÉRIFIÉ sans numéro : session ouverte, `done`', async () => {
    const { svc } = service(compte({ emailVerifiedAt: jour(1) }), jour(400));

    const res = await svc.authenticate({ username: 'lena', password: 'le-vrai' });

    expect(res?.sessionToken).toBe('session-token');
    expect(res?.user.activation).toEqual({ phase: 'done', deadline: null, missing: ['phone'] });
  });
});

describe('compte qui a CÉDÉ son adresse à une revendication prouvée (#8214)', () => {
  const cede = (extra: Record<string, unknown> = {}) =>
    compte({ email: 'released-507f1f77bcf86cd799439011@released.meeshy.invalid', emailReleasedAt: new Date(), ...extra });

  it('sans numéro, son mot de passe reste sa porte : la session s’ouvre par le pseudo', async () => {
    const { svc } = service(cede());

    const res = await svc.authenticate({ username: 'lena', password: 'le-vrai' });

    expect(res?.sessionToken).toBe('session-token');
  });

  it('aucun code n’est renvoyé à l’adresse non routable', async () => {
    const { svc } = service(cede());
    await svc.authenticate({ username: 'lena', password: 'le-vrai' });

    expect(envoisDeVerification(svc)).not.toHaveBeenCalled();
  });
});

