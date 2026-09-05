/**
 * Le défi d'étape 2 et la vérification de téléphone ne s'écrasent plus (#4542)
 *
 * Les deux secrets vivaient dans LA MÊME PAIRE de colonnes — `User.
 * phoneVerificationCode` / `phoneVerificationExpiry` —, le code le disant
 * lui-même (« Reusing this field temporarily »). Trois producteurs y
 * écrivaient : `AuthService.authenticate`, `MagicLinkService.
 * mintPendingTwoFactorToken` et `AuthService.sendPhoneVerificationCode`.
 *
 * Le défaut n'est PAS la présence de l'un ou de l'autre : c'est la COLLISION.
 * Un témoin qui n'exercerait qu'un seul chemin passerait aussi bien avec le
 * défaut — d'où les deux sens, exercés sur le MÊME compte, dans le même
 * scénario, avec un magasin qui garde vraiment ce qu'on lui écrit.
 *
 * Le double de Prisma est un MAGASIN, pas une suite de `mockResolvedValue` :
 * une collision est un effet de MÉMOIRE, et un double qui rend une valeur
 * préparée par chaque appel ne peut, par construction, jamais la montrer.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const mockCreateSession = jest.fn() as jest.Mock<any>;
const mockGenerateSessionToken = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/SessionService', () => ({
  ...(jest.requireActual('../../../services/SessionService') as Record<string, unknown>),
  initSessionService: jest.fn(),
  createSession: (input: unknown) => mockCreateSession(input),
  generateSessionToken: () => mockGenerateSessionToken()
}));

jest.mock('../../../services/EmailService', () => ({
  ...(jest.requireActual('../../../services/EmailService') as Record<string, unknown>),
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: jest.fn(() => Promise.resolve(undefined)),
    sendMagicLinkEmail: jest.fn(() => Promise.resolve(undefined))
  }))
}));

import { AuthService } from '../../../services/AuthService';
import { MagicLinkService } from '../../../services/MagicLinkService';
import { smsService } from '../../../services/SmsService';
import type { RequestContext } from '../../../services/GeoIPService';

const PHONE = '+33612345678';
const PASSWORD = 'motdepasse-1';
const BACKUP_CODE = 'ABCD1234';

type UserRow = Record<string, unknown>;

const matchesLeaf = (value: unknown, condition: unknown): boolean => {
  if (condition === null) return value === null || value === undefined;
  if (typeof condition !== 'object') return value === condition;

  const clause = condition as Record<string, unknown>;
  const insensitive = clause.mode === 'insensitive';
  const asText = (input: unknown) =>
    typeof input === 'string' && insensitive ? input.toLowerCase() : input;

  if ('equals' in clause) return asText(value) === asText(clause.equals);
  if ('gt' in clause) {
    if (!(value instanceof Date) || !(clause.gt instanceof Date)) return false;
    return value.getTime() > clause.gt.getTime();
  }
  if ('contains' in clause) {
    const needle = asText(clause.contains);
    return typeof value === 'string' && typeof needle === 'string' && asText(value)!.toString().includes(needle);
  }
  return false;
};

const matches = (row: UserRow, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Record<string, unknown>[]).some((clause) => matches(row, clause));
    if (key === 'AND') return (condition as Record<string, unknown>[]).every((clause) => matches(row, clause));
    return matchesLeaf(row[key], condition);
  });

/**
 * Un magasin utilisateur qui RETIENT — le seul double capable de montrer une
 * collision. `update` fusionne, `findFirst` filtre : rien de plus, mais rien
 * de moins non plus.
 */
const makeStore = (seed: UserRow) => {
  const rows: UserRow[] = [{ ...seed }];

  const find = (where: Record<string, unknown>) => rows.find((row) => matches(row, where)) ?? null;

  return {
    rows,
    client: {
      user: {
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => find(where)),
        findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => find(where)),
        update: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: UserRow }) => {
          const row = find(where);
          if (!row) throw new Error('Utilisateur introuvable');
          Object.assign(row, data);
          return { ...row };
        }),
        updateMany: jest.fn(async () => ({ count: 0 }))
      },
      magicLinkToken: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'mlt-1' })),
        update: jest.fn(async () => ({ id: 'mlt-1' })),
        updateMany: jest.fn(async () => ({ count: 0 }))
      },
      securityEvent: { create: jest.fn(async () => ({ id: 'sec-1' })) }
    } as any
  };
};

const seedUser = (): UserRow => ({
  id: '507f1f77bcf86cd799439011',
  username: 'alice',
  email: 'alice@example.com',
  phoneNumber: PHONE,
  password: bcrypt.hashSync(PASSWORD, 4),
  firstName: 'Alice',
  lastName: 'Martin',
  displayName: 'Alice Martin',
  avatar: null,
  bio: null,
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  isActive: true,
  isOnline: false,
  lastActiveAt: new Date('2026-08-30T00:00:00Z'),
  twoFactorEnabledAt: new Date('2026-01-01T00:00:00Z'),
  twoFactorSecret: null,
  twoFactorBackupCodes: [crypto.createHash('sha256').update(BACKUP_CODE).digest('hex')],
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastLoginDevice: null,
  timezone: null,
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  phoneVerifiedAt: null,
  pendingEmail: null,
  pendingPhoneNumber: null,
  phoneVerificationCode: null,
  phoneVerificationExpiry: null,
  twoFactorChallengeHash: null,
  twoFactorChallengeExpiresAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
});

const requestContext = {
  ip: '203.0.113.7',
  userAgent: 'TestAgent/1.0',
  geoData: null,
  deviceInfo: null
} as unknown as RequestContext;

let sentCode: string | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  sentCode = null;
  jest.spyOn(smsService, 'sendVerificationCode').mockImplementation(async (_phone: string, code: string) => {
    sentCode = code;
    return { success: true, provider: 'test', messageId: 'sms-1' };
  });
  mockGenerateSessionToken.mockReturnValue('session-token');
  mockCreateSession.mockResolvedValue({ id: 'session-1', userId: '507f1f77bcf86cd799439011' });
});

describe('collision entre le défi d\'étape 2 et la vérification de téléphone (#4542)', () => {
  it('une vérification de téléphone EN COURS survit à un défi 2FA posé par /login', async () => {
    const store = makeStore(seedUser());
    const auth = new AuthService(store.client, 'secret-de-test');

    const envoi = await auth.sendPhoneVerificationCode(PHONE);
    expect(envoi.success).toBe(true);
    expect(sentCode).not.toBeNull();

    const etape1 = await auth.authenticate({ username: 'alice', password: PASSWORD }, requestContext);
    expect(etape1?.requires2FA).toBe(true);

    const verification = await auth.verifyPhone(PHONE, sentCode as unknown as string);

    expect(verification).toEqual({ success: true });
  });

  it('un défi 2FA EN COURS survit à une demande de vérification de téléphone', async () => {
    const store = makeStore(seedUser());
    const auth = new AuthService(store.client, 'secret-de-test');

    const etape1 = await auth.authenticate({ username: 'alice', password: PASSWORD }, requestContext);
    const twoFactorToken = etape1?.twoFactorToken as string;
    expect(twoFactorToken).toBeTruthy();

    await auth.sendPhoneVerificationCode(PHONE);

    const etape2 = await auth.completeAuthWith2FA(twoFactorToken, BACKUP_CODE, requestContext);

    expect('error' in etape2 ? etape2.error : null).toBeNull();
  });

  it('une vérification de téléphone EN COURS survit à un défi 2FA posé par le lien magique', async () => {
    const store = makeStore(seedUser());
    const auth = new AuthService(store.client, 'secret-de-test');
    const magic = new MagicLinkService(
      store.client,
      { get: jest.fn(async () => null), set: jest.fn(async () => undefined), del: jest.fn(async () => undefined) } as any,
      { sendMagicLinkEmail: jest.fn(async () => undefined) } as any,
      { lookup: jest.fn(async () => null) } as any
    );

    const envoi = await auth.sendPhoneVerificationCode(PHONE);
    expect(envoi.success).toBe(true);

    const brut = await magic.issueLoginTokenForUser('507f1f77bcf86cd799439011');
    expect(typeof brut).toBe('string');

    store.client.magicLinkToken.findUnique.mockResolvedValue({
      id: 'mlt-1',
      userId: '507f1f77bcf86cd799439011',
      tokenHash: crypto.createHash('sha256').update(brut as string).digest('hex'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
      rememberDevice: false,
      user: store.rows[0]
    });

    const validation = await magic.validateMagicLink({ token: brut as string, requestContext });
    expect(validation.requires2FA).toBe(true);

    const verification = await auth.verifyPhone(PHONE, sentCode as unknown as string);

    expect(verification).toEqual({ success: true });
  });

  it('le code SMS à 6 chiffres n\'est JAMAIS accepté comme jeton d\'étape 2', async () => {
    const store = makeStore(seedUser());
    const auth = new AuthService(store.client, 'secret-de-test');

    await auth.sendPhoneVerificationCode(PHONE);

    const usurpation = await auth.completeAuthWith2FA(sentCode as unknown as string, BACKUP_CODE, requestContext);

    expect('error' in usurpation).toBe(true);
  });

  /**
   * MongoDB : une colonne AJOUTÉE est simplement ABSENTE des documents
   * antérieurs — il n'y a pas de migration à écrire, mais il y a un cas à
   * traiter. Le sens sûr est « aucun défi en cours », jamais une exception et
   * surtout jamais un défi accepté.
   */
  describe('un compte dont le document est ANTÉRIEUR aux colonnes du défi', () => {
    const antérieur = () => {
      const row = seedUser();
      // ABSENTES du document, pas à `null` : c'est ce que MongoDB rend d'un
      // compte créé avant ce lot, et les deux cas ne se lisent pas pareil.
      delete row.twoFactorChallengeHash;
      delete row.twoFactorChallengeExpiresAt;
      expect('twoFactorChallengeHash' in row).toBe(false);
      return row;
    };

    it('ne se connecte pas sur un jeton quelconque — il se comporte comme sans défi', async () => {
      const store = makeStore(antérieur());
      const auth = new AuthService(store.client, 'secret-de-test');

      const refus = await auth.completeAuthWith2FA('a'.repeat(64), BACKUP_CODE, requestContext);

      expect('error' in refus).toBe(true);
    });

    it('reçoit un défi neuf et le consomme normalement', async () => {
      const store = makeStore(antérieur());
      const auth = new AuthService(store.client, 'secret-de-test');

      const etape1 = await auth.authenticate({ username: 'alice', password: PASSWORD }, requestContext);
      const etape2 = await auth.completeAuthWith2FA(etape1?.twoFactorToken as string, BACKUP_CODE, requestContext);

      expect('error' in etape2 ? etape2.error : null).toBeNull();
    });
  });

  it('un jeton VIDE n\'atteint jamais la base — le refus est décidé avant la lecture', async () => {
    const store = makeStore(seedUser());
    const auth = new AuthService(store.client, 'secret-de-test');
    store.client.user.findFirst.mockClear();

    const refus = await auth.completeAuthWith2FA('   ', BACKUP_CODE, requestContext);

    expect('error' in refus).toBe(true);
    expect(store.client.user.findFirst).not.toHaveBeenCalled();
  });

  it('le jeton d\'étape 2 n\'est JAMAIS accepté comme code de vérification de téléphone', async () => {
    const store = makeStore(seedUser());
    const auth = new AuthService(store.client, 'secret-de-test');

    const etape1 = await auth.authenticate({ username: 'alice', password: PASSWORD }, requestContext);
    const twoFactorToken = etape1?.twoFactorToken as string;

    const usurpation = await auth.verifyPhone(PHONE, twoFactorToken);

    expect(usurpation.success).toBe(false);
    expect(store.rows[0].phoneVerifiedAt).toBeFalsy();
  });
});
