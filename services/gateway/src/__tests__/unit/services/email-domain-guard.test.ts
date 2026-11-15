/**
 * SEULES DE VRAIES ADRESSES OUVRENT UN COMPTE (#16491).
 *
 * Une adresse d'un domaine réservé (RFC 2606/6761/6762) ou d'une messagerie
 * jetable n'ouvre plus de compte — ni par l'inscription, ni par la connexion
 * d'une adresse inconnue, ni par le lien magique. Un compte EXISTANT sur un tel
 * domaine se connecte toujours : la règle garde la CRÉATION, jamais l'accès.
 *
 * L'échappatoire d'environnement est coupée ici (double du module qui la lit),
 * pour que la garde réelle s'exerce sous le setup de test qui l'ouvre.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockSendEmailVerification = jest.fn() as jest.Mock<any>;
const mockSendLoginCodeEmail = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/auth/email-domain-escape', () => ({ RESERVED_EMAIL_DOMAINS_ALLOWED: false }));

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

import crypto from 'crypto';

import { AuthService } from '../../../services/AuthService';
import { proveEmailClaim } from '../../../services/auth/email-claim';
import { emailClaimStore } from '../../helpers/email-claim-store';

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
  door: 'password-login' | 'email-only' | 'proven-password';
  existant?: Row | null;
  cache?: ReturnType<typeof memoire>;
  deviceLocale?: string;
  ip?: string;
  linkDeviceHash?: string;
}) => {
  const p = passerelle(options.existant ?? null);
  const cache = options.cache ?? memoire();
  const service = new AuthService(p.prisma as never, 'secret', { accountThrottle: cache });
  const issue = await service.startAccountFromEmail({
    email: options.email,
    door: options.door,
    requestContext: { ...CONTEXTE, ip: options.ip ?? CONTEXTE.ip },
    deviceLocale: options.deviceLocale,
    linkDeviceHash: options.linkDeviceHash,
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

const inscrire = async (email: string) => {
  const p = passerelle(null);
  const service = new AuthService(p.prisma as never, 'secret', { accountThrottle: memoire() });
  const resultat = await service.register({ email }, CONTEXTE).then(
    (valeur) => ({ valeur, erreur: null as unknown }),
    (erreur: unknown) => ({ valeur: null, erreur }),
  );
  return { ...resultat, ...p };
};

describe("l'inscription refuse une adresse qui ne désigne personne", () => {
  it.each(['testuser@example.com', 'A@SUB.EXAMPLE.ORG', 'a@foo.test', 'a@mailinator.com', 'a@x.mailinator.com'])(
    '%s : refus 400 EMAIL_DOMAIN_NOT_ALLOWED sur le champ email, aucune ligne écrite, aucun e-mail',
    async (email) => {
      const { erreur, create } = await inscrire(email);

      expect(erreur).toMatchObject({ code: 'EMAIL_DOMAIN_NOT_ALLOWED', status: 400, field: 'email' });
      expect((erreur as Error).message).toMatch(/adresse e-mail/);
      expect(create).not.toHaveBeenCalled();
      expect(mockSendEmailVerification).not.toHaveBeenCalled();
    },
  );

  it.each(['a@exampleshop.com', 'a@test.com', 'nouvelle@gmail.com'])('%s : compte créé', async (email) => {
    const { erreur, create } = await inscrire(email);

    expect(erreur).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("une adresse inconnue réservée ou jetable ne devient pas un compte", () => {
  it.each(['password-login', 'email-only'] as const)('porte %s : refus typé, aucune ligne, aucun e-mail', async (door) => {
    const { issue, create } = await demarrer({ email: 'testuser@example.com', door });

    expect(issue).toEqual({ kind: 'email-domain-not-allowed' });
    expect(create).not.toHaveBeenCalled();
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
    expect(mockSendLoginCodeEmail).not.toHaveBeenCalled();
  });

  it("le refus ne consomme pas le débit de la porte du mot de passe", async () => {
    const { cache } = await demarrer({ email: 'a@yopmail.com', door: 'password-login' });

    expect(cache.set).not.toHaveBeenCalled();
  });
});

describe('un compte EXISTANT sur un domaine réservé se connecte toujours', () => {
  const compteExampleVerifie = (): Row => ({
    id: 'user-ancien',
    email: 'ancien@example.com',
    username: 'ancien',
    displayName: 'Ancien',
    firstName: 'Ancien',
    lastName: '',
    isActive: true,
    password: '$2b$12$hash',
    emailVerifiedAt: new Date(0),
    systemLanguage: 'fr',
    regionalLanguage: null,
    customDestinationLanguage: null,
    deviceLocale: null,
  });

  it('porte « e-mail seul » : le code de CONNEXION part', async () => {
    const { issue } = await demarrer({ email: 'ancien@example.com', door: 'email-only', existant: compteExampleVerifie() });

    expect(issue).toEqual({ kind: 'verification-required', accountCreated: false, email: 'ancien@example.com' });
    expect(mockSendLoginCodeEmail).toHaveBeenCalledTimes(1);
  });

  it('porte du mot de passe : la connexion ordinaire décide (« compte existant »), jamais le refus de domaine', async () => {
    const { issue } = await demarrer({ email: 'ancien@example.com', door: 'password-login', existant: compteExampleVerifie() });

    expect(issue).toEqual({ kind: 'existing-account' });
  });
});

describe("une revendication en attente sur une adresse réservée n'est jamais activée", () => {
  const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
  const ADRESSE = 'marie@example.com';

  const store = () =>
    emailClaimStore([
      {
        id: 'detenteur',
        username: 'mariette',
        displayName: 'Mariette',
        email: ADRESSE,
        password: 'hash',
        phoneNumber: null,
        isActive: true,
        emailVerifiedAt: null,
      },
      {
        id: 'revendiquant',
        createdAt: new Date(0),
        username: 'marie_vraie',
        displayName: 'Marie',
        email: 'claim-1@claiming.meeshy.invalid',
        claimedEmail: ADRESSE,
        password: null,
        phoneNumber: null,
        isActive: false,
        emailVerifiedAt: null,
        emailVerificationToken: sha256('lien'),
        emailVerificationCode: sha256('123456'),
        emailVerificationExpiry: new Date(Date.now() + 3_600_000),
      },
    ]);

  it('le code juste ne transfère pas l’adresse : le revendiquant reste inactif, le détenteur la garde', async () => {
    const base = store();
    const issue = await proveEmailClaim(base.prisma as never, { email: ADRESSE, code: '123456' });

    expect(issue.kind).not.toBe('proven');
    expect(base.state.users.find((u) => u.id === 'revendiquant')).toMatchObject({ isActive: false, claimedEmail: ADRESSE });
    expect(base.state.users.find((u) => u.id === 'detenteur')).toMatchObject({ email: ADRESSE, isActive: true });
  });
});
