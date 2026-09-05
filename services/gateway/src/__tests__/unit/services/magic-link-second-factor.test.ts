/**
 * Le lien magique ne contourne plus le second facteur (#4534)
 *
 * `validateMagicLink` rendait `token` ET `sessionToken` INCONDITIONNELLEMENT :
 * un compte dont le propriétaire a explicitement posé un second facteur était
 * entièrement joignable par un lien reçu par e-mail, sans que ce facteur soit
 * jamais demandé. Le chemin le plus court vers le compte contournait la
 * protection — et le lien arrive PAR LA BOÎTE MAIL, c'est-à-dire exactement le
 * scénario contre lequel un second facteur existe.
 *
 * Le témoin s'écrit sur les DEUX rangs. Sur un compte SANS second facteur, la
 * garde juste et la garde absente rendent le même verdict : ce rang-là ne peut
 * pas tomber, il ne prouve donc rien seul. C'est la PAIRE qui discrimine.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';

const mockJwtSign = jest.fn() as jest.Mock<any>;
jest.mock('jsonwebtoken', () => ({
  sign: (payload: any, secret: string, options: any) => mockJwtSign(payload, secret, options)
}));

const mockCreateSession = jest.fn() as jest.Mock<any>;
const mockGenerateSessionToken = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/SessionService', () => ({
  initSessionService: jest.fn(),
  createSession: (input: any) => mockCreateSession(input),
  generateSessionToken: () => mockGenerateSessionToken()
}));

import { MagicLinkService, MagicLinkValidation } from '../../../services/MagicLinkService';
import type { RequestContext } from '../../../services/GeoIPService';

const mockPrisma = {
  user: {
    findFirst: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>
  },
  magicLinkToken: {
    findUnique: jest.fn() as jest.Mock<any>,
    create: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
    updateMany: jest.fn() as jest.Mock<any>
  },
  securityEvent: {
    create: jest.fn() as jest.Mock<any>
  }
} as any;

const mockCache = {
  get: jest.fn() as jest.Mock<any>,
  set: jest.fn() as jest.Mock<any>,
  del: jest.fn() as jest.Mock<any>
} as any;

const mockEmailService = { sendMagicLinkEmail: jest.fn() as jest.Mock<any> } as any;
const mockGeoIPService = { lookup: jest.fn() as jest.Mock<any> } as any;

const requestContext: RequestContext = {
  ip: '203.0.113.7',
  userAgent: 'TestAgent/1.0',
  geoData: null,
  deviceInfo: null
} as unknown as RequestContext;

/**
 * La forme que Prisma rend RÉELLEMENT pour la projection de
 * `validateMagicLink` : `twoFactorEnabledAt` y est sélectionné, donc présent —
 * `null` quand le compte n'a pas de second facteur, jamais absent.
 */
const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-123',
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@example.com',
  phoneNumber: '+33612345678',
  displayName: 'Alice Martin',
  bio: 'Une bio privée',
  avatar: 'avatar.png',
  role: 'ADMIN',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  userPreferences: null,
  ...overrides
});

const makeToken = (userOverrides: Record<string, unknown> = {}, tokenOverrides: Record<string, unknown> = {}) => ({
  id: 'mlt-1',
  userId: 'user-123',
  tokenHash: 'hash',
  usedAt: null,
  isRevoked: false,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  rememberDevice: false,
  user: makeUser(userOverrides),
  ...tokenOverrides
});

const validation: MagicLinkValidation = { token: 'raw-token', requestContext };

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

describe('validateMagicLink — le second facteur (#4534)', () => {
  let service: MagicLinkService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateSessionToken.mockReturnValue('session-token-xyz');
    mockCreateSession.mockResolvedValue({ id: 'session-1', userId: 'user-123' });
    mockJwtSign.mockReturnValue('jwt-token-abc');
    mockPrisma.magicLinkToken.update.mockResolvedValue({ id: 'mlt-1' });
    mockPrisma.user.update.mockResolvedValue({ id: 'user-123' });
    mockPrisma.securityEvent.create.mockResolvedValue({ id: 'ev-1' });

    service = new MagicLinkService(mockPrisma, mockCache, mockEmailService, mockGeoIPService);
  });

  // ── Le rang QUI DISCRIMINE ────────────────────────────────────────────────

  describe('un compte AVEC second facteur', () => {
    beforeEach(() => {
      mockPrisma.magicLinkToken.findUnique.mockResolvedValue(
        makeToken({ twoFactorEnabledAt: new Date('2026-02-01T00:00:00Z') })
      );
    });

    it("n'obtient NI token NI sessionToken", async () => {
      const result = await service.validateMagicLink(validation);

      expect(result.token).toBeUndefined();
      expect(result.sessionToken).toBeUndefined();
    });

    it("ne fait naître AUCUNE session et ne signe AUCUN jeton", async () => {
      const result = await service.validateMagicLink(validation);

      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockJwtSign).not.toHaveBeenCalled();
      expect(result.session).toBeUndefined();
    });

    it('annonce requires2FA et rend un twoFactorToken', async () => {
      const result = await service.validateMagicLink(validation);

      expect(result.success).toBe(true);
      expect(result.requires2FA).toBe(true);
      expect(typeof result.twoFactorToken).toBe('string');
      expect((result.twoFactorToken ?? '').length).toBeGreaterThan(0);
    });

    it("rend un twoFactorToken que POST /auth/login/2fa sait déjà consommer", async () => {
      // `completeAuthWith2FA` retrouve l'utilisateur par
      // `twoFactorChallengeHash = sha256(twoFactorToken)` encore valide.
      //
      // Les colonnes s'appelaient `phoneVerificationCode` /
      // `phoneVerificationExpiry` jusqu'à #4542 : le défi partageait alors sa
      // mémoire avec la vérification de téléphone, et le mint était écrit DEUX
      // FOIS — ici et dans `AuthService.authenticate`. Le site unique est
      // désormais `services/auth/pending-two-factor.ts` ; le témoin porte sur
      // ce qui est ÉCRIT, pas sur qui l'écrit.
      const result = await service.validateMagicLink(validation);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          twoFactorChallengeHash: sha256(result.twoFactorToken ?? ''),
          twoFactorChallengeExpiresAt: expect.any(Date)
        }
      });
    });

    it("ne fait PAS passer le compte pour connecté — aucune trace de connexion", async () => {
      // Ce qui part À CÔTÉ : écrire `lastLoginIp` / `lastActiveAt` ferait
      // mentir le journal de sécurité sur une connexion qui n'a pas eu lieu.
      await service.validateMagicLink(validation);

      expect(mockPrisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lastLoginIp: expect.anything() }) })
      );
      expect(mockPrisma.securityEvent.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'MAGIC_LINK_LOGIN_SUCCESS' }) })
      );
    });

    it('consomme quand même le lien — il a servi, il ne se rejoue pas', async () => {
      await service.validateMagicLink(validation);

      expect(mockPrisma.magicLinkToken.update).toHaveBeenCalledWith({
        where: { id: 'mlt-1' },
        data: { usedAt: expect.any(Date) }
      });
    });

    it("ne sert du compte que ce que l'étape 1 a besoin de nommer", async () => {
      // La réponse PARTIELLE ne doit pas déverser le profil complet avant que
      // le second facteur soit vérifié : le porteur du lien n'a encore prouvé
      // que la possession de la boîte.
      const result = await service.validateMagicLink(validation);

      expect(result.user).toMatchObject({ id: 'user-123', username: 'alice' });
      expect(result.user).not.toHaveProperty('role');
      expect(result.user).not.toHaveProperty('phoneNumber');
      expect(result.user).not.toHaveProperty('bio');
    });
  });

  // ── Le rang MIROIR : sans lui, la garde pourrait tout refuser ─────────────

  describe('un compte SANS second facteur', () => {
    beforeEach(() => {
      mockPrisma.magicLinkToken.findUnique.mockResolvedValue(makeToken({ twoFactorEnabledAt: null }));
    });

    it('obtient bien token ET sessionToken', async () => {
      const result = await service.validateMagicLink(validation);

      expect(result.success).toBe(true);
      expect(result.token).toBe('jwt-token-abc');
      expect(result.sessionToken).toBe('session-token-xyz');
      expect(result.session).toEqual({ id: 'session-1', userId: 'user-123' });
    });

    it("n'annonce aucun second facteur et ne mint aucun jeton d'étape 2", async () => {
      const result = await service.validateMagicLink(validation);

      expect(result.requires2FA).toBeUndefined();
      expect(result.twoFactorToken).toBeUndefined();
      // Le témoin suit la COLONNE, pas son ancien nom : depuis #4542 le défi
      // vit dans `twoFactorChallengeHash`, et laisser cette négation pointer
      // `phoneVerificationCode` la rendrait vraie sans plus rien garder.
      expect(mockPrisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ twoFactorChallengeHash: expect.anything() })
        })
      );
    });
  });

  // ── Fail-closed ───────────────────────────────────────────────────────────

  describe("quand l'état du second facteur est INDÉTERMINÉ", () => {
    it('refuse la session complète plutôt que de l\'accorder', async () => {
      // `twoFactorEnabledAt` ABSENT (et non `null`) = la projection ne l'a pas
      // rendu. On ne SAIT pas si le compte est protégé : le sens sûr est le
      // refus. Une garde qui dégrade vers « pas de 2FA » rouvre le trou dès
      // que quelqu'un retire un champ du `select`.
      mockPrisma.magicLinkToken.findUnique.mockResolvedValue(
        makeToken({ twoFactorEnabledAt: undefined })
      );

      const result = await service.validateMagicLink(validation);

      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
      expect(result.sessionToken).toBeUndefined();
      expect(result.requires2FA).toBeUndefined();
      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockJwtSign).not.toHaveBeenCalled();
    });

    it("refuse aussi quand le champ porte une valeur qui n'est pas une date", async () => {
      mockPrisma.magicLinkToken.findUnique.mockResolvedValue(
        makeToken({ twoFactorEnabledAt: '' })
      );

      const result = await service.validateMagicLink(validation);

      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
      expect(result.sessionToken).toBeUndefined();
    });
  });
});
