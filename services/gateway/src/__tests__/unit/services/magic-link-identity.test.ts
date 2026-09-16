/**
 * CE QUE L'E-MAIL DE LIEN MAGIQUE EMPORTE (#6424).
 *
 * Directive porteur 2026-09-14 : « à chaque e-mail de lien magique, si le mot
 * de passe n'est pas défini, indiquer les liens directs vers le profil pour
 * modifier le mot de passe ».
 *
 * ## Pourquoi un fichier à part
 *
 * `MagicLinkService.test.ts` est HORS BUDGET (1136 lignes, dette héritée
 * #4531) et le dépôt interdit d'agrandir un fichier hors budget : on extrait
 * d'abord, on ajoute ensuite. Ce qui part ici est une responsabilité entière —
 * la CHARGE remise au gabarit d'e-mail — et non une tranche.
 *
 * ## Le témoin qui compte le plus
 *
 * Le dernier : le HASH ne doit pas atteindre le gabarit. Savoir s'il faut
 * proposer « définir un mot de passe » demande de LIRE la colonne ; la valeur
 * est réduite à un booléen chez l'appelant et ne doit jamais voyager plus
 * loin. Une régression qui l'y laisserait passer ne lèverait rien,
 * n'échouerait nulle part, et enverrait un bcrypt dans un gabarit HTML.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockJwtSign = jest.fn() as jest.Mock<any>;
jest.mock('jsonwebtoken', () => ({
  sign: (payload: any, secret: string, options: any) => mockJwtSign(payload, secret, options),
}));

jest.mock('../../../services/SessionService', () => ({
  initSessionService: jest.fn(),
  createSession: jest.fn(async () => ({ id: 'sess-1' })),
  generateSessionToken: jest.fn(() => 'session-token'),
}));

import { MagicLinkService } from '../../../services/MagicLinkService';

const compte = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  displayName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  isActive: true,
  systemLanguage: 'en',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  password: null,
  ...overrides,
});

const geo = {
  ip: '192.168.1.1',
  location: 'New York, United States',
  latitude: 40.7128,
  longitude: -74.006,
};

const REQUETE = {
  email: 'test@example.com',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  deviceFingerprint: 'fp-1',
};

function harnais(ligne: Record<string, unknown>) {
  const prisma = {
    user: { findFirst: jest.fn<any>().mockResolvedValue(ligne), update: jest.fn<any>() },
    magicLinkToken: {
      findUnique: jest.fn<any>(),
      create: jest.fn<any>().mockResolvedValue({ id: 'tok-1' }),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    securityEvent: { create: jest.fn<any>().mockResolvedValue({}) },
  } as any;

  const redis = {
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    del: jest.fn<any>(),
    keys: jest.fn<any>(),
    isAvailable: jest.fn<any>().mockReturnValue(true),
  } as any;

  const emailService = { sendMagicLinkEmail: jest.fn<any>().mockResolvedValue({ success: true }) } as any;
  const geoIPService = { lookup: jest.fn<any>().mockResolvedValue(geo) } as any;

  const service = new MagicLinkService(prisma, redis, emailService, geoIPService);
  return { service, prisma, emailService };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJwtSign.mockReturnValue('jwt');
});

describe("la CHARGE de l'e-mail de lien magique", () => {
  it('porte le destinataire, son nom, le lien et sa provenance', async () => {
    const { service, emailService } = harnais(compte());

    await service.requestMagicLink(REQUETE);

    expect(emailService.sendMagicLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        name: 'Test',
        magicLink: expect.stringContaining('token=') as unknown as string,
        location: 'New York, United States',
        language: 'en',
      }),
    );
  });

  it("joint l'identité et ses DEUX liens d'édition (#6424)", async () => {
    const { service, emailService } = harnais(compte());

    await service.requestMagicLink(REQUETE);
    const charge = emailService.sendMagicLinkEmail.mock.calls[0]?.[0];

    expect(charge?.identity).toEqual({
      username: 'testuser',
      displayName: 'Test User',
      profileUrl: 'https://meeshy.me/settings#profile',
      passwordUrl: 'https://meeshy.me/settings#security',
      hasPassword: false,
    });
  });

  it('dit hasPassword=true dès qu’un hash existe', async () => {
    const { service, emailService } = harnais(compte({ password: 'hash-bcrypt' }));

    await service.requestMagicLink(REQUETE);

    expect(emailService.sendMagicLinkEmail.mock.calls[0]?.[0]?.identity?.hasPassword).toBe(true);
  });

  it('retombe sur le PSEUDO quand le nom affiché est absent — jamais une chaîne vide', async () => {
    const { service, emailService } = harnais(compte({ displayName: null }));

    await service.requestMagicLink(REQUETE);

    expect(emailService.sendMagicLinkEmail.mock.calls[0]?.[0]?.identity?.displayName).toBe('testuser');
  });

  it('DEMANDE la colonne password — sans elle, hasPassword mentirait pour tout le monde', async () => {
    const { service, prisma } = harnais(compte());

    await service.requestMagicLink(REQUETE);
    const appel = prisma.user.findFirst.mock.calls[0]?.[0];

    expect(appel?.select?.password).toBe(true);
    expect(appel?.select?.username).toBe(true);
    expect(appel?.select?.displayName).toBe(true);
  });

  it('le HASH ne voyage JAMAIS jusqu’au gabarit', async () => {
    const { service, emailService } = harnais(compte({ password: 'hash-bcrypt-secret' }));

    await service.requestMagicLink(REQUETE);
    const charge = emailService.sendMagicLinkEmail.mock.calls[0]?.[0];

    expect(JSON.stringify(charge)).not.toContain('hash-bcrypt-secret');
    expect(charge).not.toHaveProperty('password');
  });
});

/**
 * LE RETOUR APRÈS CONNEXION PAR E-MAIL (#6742).
 *
 * Le mot de passe, la double authentification et l'inscription honorent déjà
 * `next` — la connexion par lien magique ne le pouvait pas : l'e-mail vise
 * `/auth/magic-link?token=` SANS aucun retour, et la demande n'a pas de champ
 * de retour. `returnUrl` porte cette valeur, DEPUIS la demande, jusque dans le
 * lien envoyé — `magic-link.tsx` (web) le lit déjà en sortie
 * (`MagicLinkValidation`, `safeReturnPath`) ; ce lot manquait le SEUL bout
 * absent, l'entrée côté service.
 */
describe("le retour après connexion par e-mail (#6742)", () => {
  it('embarque returnUrl, clampé, dans le lien envoyé par e-mail', async () => {
    const { service, emailService } = harnais(compte());

    await service.requestMagicLink({ ...REQUETE, returnUrl: '/chat/mshy_equipe_7f3a' });
    const charge = emailService.sendMagicLinkEmail.mock.calls[0]?.[0];

    expect(charge?.magicLink).toContain(`returnUrl=${encodeURIComponent('/chat/mshy_equipe_7f3a')}`);
  });

  it('ne pose PAS returnUrl dans le lien quand la demande n’en porte aucun', async () => {
    const { service, emailService } = harnais(compte());

    await service.requestMagicLink(REQUETE);
    const charge = emailService.sendMagicLinkEmail.mock.calls[0]?.[0];

    expect(charge?.magicLink).not.toContain('returnUrl=');
  });

  for (const hostile of ['https://evil.com/chat/x', '//evil.com', '/\\evil.com']) {
    it(`rejette un returnUrl hors même-origine (${hostile}) — absent du lien, jamais recopié`, async () => {
      const { service, emailService } = harnais(compte());

      await service.requestMagicLink({ ...REQUETE, returnUrl: hostile });
      const charge = emailService.sendMagicLinkEmail.mock.calls[0]?.[0];

      expect(charge?.magicLink).not.toContain('returnUrl=');
    });
  }
});
