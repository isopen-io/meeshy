/**
 * Cinq mots de passe faux ferment le compte, et le sixième ESSAI JUSTE est refusé (#4138).
 *
 * `AuthService.authenticate` faisait `findFirst` + `bcrypt.compare` et rendait
 * `null` — sans jamais rien compter. Les colonnes du verrou existaient déjà, le
 * handler global savait déjà rendre 423, le job nocturne savait déjà relâcher :
 * il ne manquait que la MAIN qui arme. Et l'étape du second facteur, elle,
 * n'avait ni limiteur ni compteur, ce qui rendait les CODES DE SECOURS —
 * qui ne tournent pas et n'expirent jamais — attaquables sans fin.
 *
 * Ces témoins portent sur le COMPORTEMENT observable de la connexion, pas sur
 * le module de comptage (testé à part) : ce sont deux affirmations distinctes,
 * et c'est le CÂBLAGE qui manquait.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCompare = jest.fn() as jest.Mock<any>;
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    compare: (...a: any[]) => mockCompare(...a),
    hash: jest.fn(async () => 'hashed'),
  },
}));

jest.mock('../../../services/SessionService', () => ({
  generateSessionToken: () => 'session-token',
  createSession: jest.fn(async () => ({ id: 'sess-1', isTrusted: false })),
  initSessionService: jest.fn(),
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: jest.fn(async () => undefined),
  })),
}));

import { AuthService } from '../../../services/AuthService';
import { UserLockedError } from '../../../errors/custom-errors';
import { MAX_FAILED_LOGIN_ATTEMPTS } from '../../../services/LoginAttemptService';

const USER_ID = '507f1f77bcf86cd799439011';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: 'cible',
    email: 'cible@example.com',
    password: 'hash-du-vrai-mot-de-passe',
    phoneNumber: null,
    firstName: 'C',
    lastName: 'Ible',
    displayName: 'Cible',
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
    twoFactorSecret: null,
    twoFactorBackupCodes: [],
    lastLoginIp: null,
    lastLoginLocation: null,
    lastLoginDevice: null,
    timezone: null,
    emailVerifiedAt: new Date(),
    phoneVerifiedAt: null,
    pendingEmail: null,
    pendingPhoneNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    lockedReason: null,
    ...overrides,
  };
}

/** Une base qui tient VRAIMENT l'état du compte entre deux tentatives. */
function makePrisma(etatInitial: Record<string, unknown> = {}) {
  let etat = makeUser(etatInitial);

  const update = jest.fn(async (args: { data: Record<string, any> }) => {
    for (const [champ, valeur] of Object.entries(args.data)) {
      if (valeur && typeof valeur === 'object' && 'increment' in valeur) {
        etat = { ...etat, [champ]: (etat as any)[champ] + valeur.increment };
      } else {
        etat = { ...etat, [champ]: valeur };
      }
    }
    return etat;
  });

  return {
    prisma: {
      user: {
        findFirst: jest.fn(async () => etat),
        update,
      },
    } as never,
    update,
    etat: () => etat,
  };
}

function makeService(prisma: never) {
  return new AuthService(prisma, 'secret-de-test');
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AuthService.authenticate — l’échec est compté', () => {
  it('incrémente le compteur à chaque mot de passe faux', async () => {
    const { prisma, etat } = makePrisma();
    mockCompare.mockResolvedValue(false);
    const svc = makeService(prisma);

    await svc.authenticate({ username: 'cible', password: 'faux' });
    expect(etat().failedLoginAttempts).toBe(1);

    await svc.authenticate({ username: 'cible', password: 'encore-faux' });
    expect(etat().failedLoginAttempts).toBe(2);
  });

  it('ferme le compte au seuil, en posant une date de fin', async () => {
    const { prisma, etat } = makePrisma();
    mockCompare.mockResolvedValue(false);
    const svc = makeService(prisma);

    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
      await svc.authenticate({ username: 'cible', password: 'faux' });
    }

    expect(etat().failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(etat().lockedUntil).toBeInstanceOf(Date);
    expect((etat().lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('refuse le BON mot de passe tant que le verrou tient', async () => {
    const { prisma } = makePrisma({
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
    });
    mockCompare.mockResolvedValue(true);
    const svc = makeService(prisma);

    // C'est l'affirmation centrale : le verrou tient contre un mot de passe
    // VALIDE. Un verrou qui ne retiendrait que les mauvais essais ne
    // retiendrait rien du tout.
    await expect(
      svc.authenticate({ username: 'cible', password: 'le-vrai' })
    ).rejects.toBeInstanceOf(UserLockedError);
  });

  it('se TAIT devant un mauvais mot de passe — le verrou n’est pas un oracle d’existence', async () => {
    const { prisma } = makePrisma({
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
    });
    mockCompare.mockResolvedValue(false);
    const svc = makeService(prisma);

    // Même réponse que pour un compte INEXISTANT : `null`. Distinguer les deux
    // suffirait à énumérer les comptes du service.
    await expect(
      svc.authenticate({ username: 'cible', password: 'faux' })
    ).resolves.toBeNull();
  });

  it('laisse passer une fois le verrou EXPIRÉ, sans attendre le job de déverrouillage', async () => {
    const { prisma } = makePrisma({
      lockedUntil: new Date(Date.now() - 1000),
      failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
    });
    mockCompare.mockResolvedValue(true);
    const svc = makeService(prisma);

    const res = await svc.authenticate({ username: 'cible', password: 'le-vrai' });

    expect(res).not.toBeNull();
  });

  it('efface l’ardoise après une connexion réussie', async () => {
    const { prisma, etat } = makePrisma({ failedLoginAttempts: 3 });
    mockCompare.mockResolvedValue(true);
    const svc = makeService(prisma);

    await svc.authenticate({ username: 'cible', password: 'le-vrai' });

    expect(etat().failedLoginAttempts).toBe(0);
    expect(etat().lockedUntil).toBeNull();
  });
});
