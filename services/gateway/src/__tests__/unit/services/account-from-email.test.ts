/**
 * UNE ADRESSE INCONNUE DEVIENT UN COMPTE EN UN GESTE (#8033).
 *
 * Directive porteur 2026-09-26 : « Lorsqu'on essaye de se connecter avec un
 * email qui n'existe pas, il faut directement créer le compte et envoyer le
 * code et le lien pour valider son compte ! » — amendée le même jour : la porte
 * « e-mail seul » envoie code + lien à un compte EXISTANT aussi.
 *
 * Ces témoins passent par `AuthService.startAccountFromEmail`, jusqu'à la ligne
 * écrite et à l'e-mail remis : ce qui compte est ce qui part en base et dans la
 * boîte, pas l'appel d'une fonction.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';

const mockSendEmailVerification = jest.fn() as jest.Mock<any>;
const mockSendLoginCodeEmail = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: mockSendEmailVerification,
    sendLoginCodeEmail: mockSendLoginCodeEmail,
  })),
}));

const mockCreateSession = jest.fn(async () => ({ id: 'session-1' }));
jest.mock('../../../services/SessionService', () => ({
  generateSessionToken: jest.fn(() => 'session-token'),
  createSession: mockCreateSession,
  initSessionService: jest.fn(),
  validateSession: jest.fn(),
  getUserSessions: jest.fn(),
  invalidateSession: jest.fn(),
  invalidateAllSessions: jest.fn(),
  logout: jest.fn(),
}));

const mockHashPassword = jest.fn(async () => '$2b$12$hash-de-test');
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: mockHashPassword,
}));

import { AuthService } from '../../../services/AuthService';
import { ACCOUNT_EMAIL_SENDS_PER_HOUR, ACCOUNT_IP_SENDS_PER_HOUR } from '../../../services/auth/account-from-email';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

type Row = Record<string, unknown>;

const memoire = () => {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  };
};

const passerelle = (existant: Row | null = null) => {
  const lookup = jest.fn(async (args: { where?: { email?: unknown; OR?: unknown } }) => {
    if (existant && args.where && 'email' in args.where) return existant;
    return null;
  }) as jest.Mock<any>;
  const create = jest.fn(async (args: unknown) => ({ id: 'user-cree', ...((args as { data: Row }).data) }));
  const update = jest.fn(async (args: unknown) => ({ ...(existant ?? {}), ...((args as { data: Row }).data) }));
  return {
    lookup,
    create,
    update,
    prisma: {
      user: { findFirst: lookup, findMany: jest.fn(async () => []), create, update },
      conversation: { findFirst: jest.fn(async () => null) },
      participant: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'part-1' })),
        update: jest.fn(async () => ({ id: 'part-1' })),
      },
    },
  };
};

const CONTEXTE = { ip: '203.0.113.7', userAgent: 'test', geoData: null, deviceInfo: null };

const demarrer = async (options: {
  email: string;
  door: 'password-login' | 'email-only';
  existant?: Row | null;
  cache?: ReturnType<typeof memoire>;
  deviceLocale?: string;
  ip?: string;
}) => {
  const p = passerelle(options.existant ?? null);
  const cache = options.cache ?? memoire();
  const service = new AuthService(p.prisma as never, 'secret', { accountThrottle: cache });
  const issue = await service.startAccountFromEmail({
    email: options.email,
    door: options.door,
    requestContext: { ...CONTEXTE, ip: options.ip ?? CONTEXTE.ip },
    deviceLocale: options.deviceLocale,
  });
  const ligne = (p.create.mock.calls[0] as [{ data: Row }] | undefined)?.[0].data;
  const miseAJour = (p.update.mock.calls[0] as [{ data: Row }] | undefined)?.[0].data;
  return { issue, ligne, miseAJour, ...p, cache };
};

const compteEnAttente = (extra: Row = {}): Row => ({
  id: 'user-attente',
  email: 'attente@example.com',
  username: 'attente',
  displayName: 'Attente',
  firstName: 'Attente',
  lastName: '',
  isActive: true,
  password: null,
  emailVerifiedAt: null,
  systemLanguage: 'de',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSendEmailVerification.mockResolvedValue({ success: true });
  mockSendLoginCodeEmail.mockResolvedValue({ success: true });
});

describe('connexion par mot de passe, adresse INCONNUE', () => {
  it('crée le compte et rend « vérification requise », accountCreated', async () => {
    const { issue, create } = await demarrer({ email: 'Nouvelle@Example.com', door: 'password-login' });

    expect(issue).toEqual({ kind: 'verification-required', accountCreated: true, email: 'nouvelle@example.com' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("ne stocke AUCUN mot de passe — la saisie de connexion n'atteint jamais la ligne", async () => {
    const { ligne } = await demarrer({ email: 'nouvelle@example.com', door: 'password-login' });

    expect(ligne?.password).toBeNull();
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("n'ouvre aucune session", async () => {
    await demarrer({ email: 'nouvelle@example.com', door: 'password-login' });

    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("envoie code + lien, et ne stocke que l'EMPREINTE du code", async () => {
    const { ligne } = await demarrer({ email: 'nouvelle@example.com', door: 'password-login' });
    const courriel = mockSendEmailVerification.mock.calls[0]?.[0] as Record<string, string>;

    expect(courriel.verificationCode).toMatch(/^[0-9]{6}$/);
    expect(courriel.verificationLink).toMatch(/\/auth\/verify-email\?token=[0-9a-f]{64}&email=nouvelle%40example\.com$/);
    expect(ligne?.emailVerificationCode).toBe(sha256(courriel.verificationCode));
    expect(ligne?.emailVerificationCode).not.toBe(courriel.verificationCode);
  });

  it('écrit dans la langue du lecteur (rang 4 : la locale de la requête)', async () => {
    await demarrer({ email: 'nouvelle@example.com', door: 'password-login', deviceLocale: 'es-ES' });
    const courriel = mockSendEmailVerification.mock.calls[0]?.[0] as Record<string, string>;

    expect(courriel.language).toBe('es');
  });
});

describe('connexion par mot de passe, compte EXISTANT', () => {
  it('compte créé ainsi et jamais vérifié : renvoie un code NEUF, accountCreated false', async () => {
    const { issue, create, miseAJour } = await demarrer({
      email: 'attente@example.com',
      door: 'password-login',
      existant: compteEnAttente(),
    });
    const courriel = mockSendEmailVerification.mock.calls[0]?.[0] as Record<string, string>;

    expect(issue).toEqual({ kind: 'verification-required', accountCreated: false, email: 'attente@example.com' });
    expect(create).not.toHaveBeenCalled();
    expect(miseAJour?.emailVerificationCode).toBe(sha256(courriel.verificationCode));
    expect(courriel.language).toBe('de');
  });

  it('compte AVEC mot de passe : ne fait rien — la connexion normale décide', async () => {
    const { issue, update } = await demarrer({
      email: 'attente@example.com',
      door: 'password-login',
      existant: compteEnAttente({ password: '$2b$12$x' }),
    });

    expect(issue).toEqual({ kind: 'existing-account' });
    expect(update).not.toHaveBeenCalled();
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
  });

  it('compte sans mot de passe mais VÉRIFIÉ : ne fait rien', async () => {
    const { issue } = await demarrer({
      email: 'attente@example.com',
      door: 'password-login',
      existant: compteEnAttente({ emailVerifiedAt: new Date() }),
    });

    expect(issue).toEqual({ kind: 'existing-account' });
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
  });

  it('le renvoi est LIMITÉ : au-delà du quota, plus aucun e-mail, et le code en cours reste valide', async () => {
    const cache = memoire();
    for (let i = 0; i < ACCOUNT_EMAIL_SENDS_PER_HOUR; i += 1) {
      await demarrer({ email: 'attente@example.com', door: 'password-login', existant: compteEnAttente(), cache });
    }
    mockSendEmailVerification.mockClear();

    const { issue, update } = await demarrer({
      email: 'attente@example.com',
      door: 'password-login',
      existant: compteEnAttente(),
      cache,
    });

    expect(issue).toEqual({ kind: 'verification-required', accountCreated: false, email: 'attente@example.com' });
    expect(update).not.toHaveBeenCalled();
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
  });
});

describe('compte SUPPRIMÉ (isActive false) — adresse indisponible', () => {
  it.each(['password-login', 'email-only'] as const)('porte %s : ni création, ni e-mail, ni exception', async (door) => {
    const { issue, create, update } = await demarrer({
      email: 'attente@example.com',
      door,
      existant: compteEnAttente({ isActive: false }),
    });

    expect(issue).toEqual({ kind: 'unavailable' });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
    expect(mockSendLoginCodeEmail).not.toHaveBeenCalled();
  });
});

describe('porte « e-mail seul »', () => {
  it('adresse inconnue : crée le compte, code valable 15 minutes', async () => {
    const avant = Date.now();
    const { issue, ligne } = await demarrer({ email: 'seul@example.com', door: 'email-only' });

    expect(issue).toEqual({ kind: 'verification-required', accountCreated: true, email: 'seul@example.com' });
    const expiry = (ligne?.emailVerificationExpiry as Date).getTime();
    expect(expiry - avant).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
    expect(expiry - avant).toBeGreaterThan(14 * 60 * 1000);
    expect(ligne?.password).toBeNull();
  });

  it('compte VÉRIFIÉ : envoie un code de CONNEXION + lien, sans toucher à la vérification', async () => {
    const { issue, miseAJour } = await demarrer({
      email: 'attente@example.com',
      door: 'email-only',
      existant: compteEnAttente({ emailVerifiedAt: new Date('2026-01-01'), password: '$2b$12$x' }),
    });
    const courriel = mockSendLoginCodeEmail.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(issue).toEqual({ kind: 'verification-required', accountCreated: false, email: 'attente@example.com' });
    expect(courriel.code).toMatch(/^[0-9]{6}$/);
    expect(courriel.link).toMatch(/\/auth\/verify-email\?token=[0-9a-f]{64}&email=attente%40example\.com$/);
    expect(courriel.expiryMinutes).toBe(15);
    expect(miseAJour?.emailVerificationCode).toBe(sha256(courriel.code as string));
    expect(miseAJour).not.toHaveProperty('emailVerifiedAt');
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
  });

  it("au-delà du quota par adresse : refus de débit AVANT toute lecture du compte", async () => {
    const cache = memoire();
    for (let i = 0; i < ACCOUNT_EMAIL_SENDS_PER_HOUR; i += 1) {
      await demarrer({ email: 'seul@example.com', door: 'email-only', cache });
    }
    const { issue, lookup } = await demarrer({ email: 'seul@example.com', door: 'email-only', cache });

    expect(issue).toEqual({ kind: 'rate-limited' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("au-delà du quota par adresse IP : on n'arrose pas des adresses en tournant", async () => {
    const cache = memoire();
    for (let i = 0; i < ACCOUNT_IP_SENDS_PER_HOUR; i += 1) {
      await demarrer({ email: `a${i}@example.com`, door: 'email-only', cache });
    }
    mockSendEmailVerification.mockClear();
    const { issue } = await demarrer({ email: 'derniere@example.com', door: 'email-only', cache });

    expect(issue).toEqual({ kind: 'rate-limited' });
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
  });
});
