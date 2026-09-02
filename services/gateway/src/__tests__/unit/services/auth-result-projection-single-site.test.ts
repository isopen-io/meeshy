/**
 * Une réponse d'authentification ne LIT jamais un champ que son `select` n'a
 * pas demandé — et les portes de connexion projettent depuis UN SEUL site (#4554).
 *
 * ## Le défaut
 *
 * `AuthService.authenticate` demandait `isOnline` / `lastActiveAt` ;
 * `completeAuthWith2FA` ne les demandait pas. Les deux passent pourtant le même
 * `user` à `userToSocketIOUser`, qui LIT ces deux colonnes. Une connexion à
 * second facteur rendait donc un `AuthResult` dont la présence valait
 * `undefined` — deux clés qui DISPARAISSENT de la charge JSON servie par
 * `POST /auth/login/2fa`, là où `POST /auth/login` les porte.
 *
 * ## Pourquoi aucun témoin ne tombait
 *
 * Parce que les doubles de Prisma du dépôt IGNORENT le `select` : ils rendent
 * la ligne entière préparée par le test. Un champ absent du `select` reste donc
 * présent dans le double, et le lecteur le trouve — la seule chose que le
 * défaut supprime en production. **Un double qui ignore le `select` ne peut, par
 * construction, jamais montrer un champ manquant.** Celui de ce fichier
 * PROJETTE, exactement comme la vraie requête.
 *
 * ## La loi, et pourquoi elle n'est pas « les deux objets sont égaux »
 *
 * Comparer les deux `AuthResult` entre eux passerait au vert le jour où les
 * DEUX sont amputés du même champ. Le témoin ancre donc la projection sur ce
 * que le lecteur LIT réellement : la ligne servie est un Proxy qui enregistre
 * chaque accès, et la loi confronte ces accès au `select` que le MÊME appel a
 * posé. Un champ ajouté au lecteur sans être ajouté au `select` fait rougir,
 * quel que soit le nombre de chemins également amputés.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
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
    sendEmailVerification: jest.fn(() => Promise.resolve(undefined))
  }))
}));

import { AuthService } from '../../../services/AuthService';
import { AUTH_USER_SELECT } from '../../../services/auth/auth-user-projection';

const PASSWORD = 'motdepasse-1';
const BACKUP_CODE = 'ABCD1234';

/**
 * `await` sur la valeur rendue par le double interroge `then` sur elle : c'est
 * une sonde du runtime, jamais une colonne de `User`. Aucune autre n'est
 * tolérée — la liste est volontairement close.
 */
const RUNTIME_PROBES = new Set(['then']);

type Row = Record<string, unknown>;
type Select = Record<string, unknown>;

/** Ce qu'un appel a DEMANDÉ, et ce que le code a LU sur la ligne servie. */
type Observation = { readonly select: Select; readonly reads: Set<string> };

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
  return false;
};

const matches = (row: Row, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Record<string, unknown>[]).some((clause) => matches(row, clause));
    return matchesLeaf(row[key], condition);
  });

/**
 * Un magasin qui PROJETTE ce qu'on lui demande et qui OBSERVE ce qu'on lit.
 *
 * `project` est le seul comportement qui compte ici : une clé absente du
 * `select` est absente de la ligne servie, comme en production. Le Proxy
 * transforme « la valeur est `undefined` » — indiscernable d'une colonne
 * légitimement nulle — en « le code a demandé cette clé », qui est le fait.
 */
const makeStore = (seed: Row) => {
  const rows: Row[] = [{ ...seed }];
  const observations: Observation[] = [];

  const find = (where: Record<string, unknown>) => rows.find((row) => matches(row, where)) ?? null;

  const project = (row: Row, select: Select | undefined): Row =>
    select === undefined
      ? { ...row }
      : Object.fromEntries(
          Object.entries(select)
            .filter(([, asked]) => Boolean(asked))
            .map(([key]) => [key, row[key]])
        );

  const observe = (row: Row | null, select: Select | undefined): Row | null => {
    if (row === null) return null;
    const reads = new Set<string>();
    observations.push({ select: select ?? {}, reads });
    return new Proxy(project(row, select), {
      get(target, property, receiver) {
        if (typeof property === 'string') reads.add(property);
        return Reflect.get(target, property, receiver);
      }
    });
  };

  return {
    observations,
    client: {
      user: {
        findFirst: jest.fn(async ({ where, select }: { where: Record<string, unknown>; select?: Select }) =>
          observe(find(where), select)),
        findUnique: jest.fn(async ({ where, select }: { where: Record<string, unknown>; select?: Select }) =>
          observe(find(where), select)),
        update: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
          const row = find(where);
          if (!row) throw new Error('Utilisateur introuvable');
          Object.assign(row, data);
          return { ...row };
        }),
        updateMany: jest.fn(async () => ({ count: 0 }))
      },
      securityEvent: { create: jest.fn(async () => ({ id: 'sec-1' })) }
    } as any
  };
};

/**
 * La ligne EN BASE — toutes les colonnes que le compte porte réellement. Ce
 * que le service en reçoit dépend de son `select`, jamais de ce tableau : c'est
 * précisément ce que le témoin mesure.
 */
const seedUser = (overrides: Row = {}): Row => ({
  id: '507f1f77bcf86cd799439011',
  username: 'alice',
  email: 'alice@example.com',
  phoneNumber: '+33612345678',
  password: bcrypt.hashSync(PASSWORD, 4),
  firstName: 'Alice',
  lastName: 'Martin',
  displayName: 'Alice Martin',
  avatar: null,
  banner: null,
  bio: null,
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  isActive: true,
  deactivatedAt: null,
  isOnline: true,
  lastActiveAt: new Date('2026-08-30T10:00:00Z'),
  twoFactorEnabledAt: null,
  twoFactorSecret: null,
  twoFactorBackupCodes: [crypto.createHash('sha256').update(BACKUP_CODE).digest('hex')],
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastPasswordChange: new Date('2026-01-01T00:00:00Z'),
  lastLoginIp: null,
  lastLoginLocation: null,
  lastLoginDevice: null,
  timezone: null,
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  phoneVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  pendingEmail: null,
  pendingPhoneNumber: null,
  profileCompletionRate: 80,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-08-30T10:00:00Z'),
  userPreferences: { application: { autoTranslateEnabled: true } },
  ...overrides
});

const requestContext = {
  ip: '10.0.0.1',
  userAgent: 'TestAgent/1.0',
  geoData: null,
  deviceInfo: null
} as any;

const newService = (client: any) => {
  mockGenerateSessionToken.mockReturnValue('session-token');
  mockCreateSession.mockResolvedValue({
    id: 'session-1',
    userId: '507f1f77bcf86cd799439011',
    deviceType: 'desktop',
    browserName: null,
    osName: null,
    location: null,
    isMobile: false,
    createdAt: new Date(),
    lastActivityAt: new Date()
  });
  return new AuthService(client, 'jwt-secret');
};

/** Les champs LUS sur la ligne servie que le `select` du même appel n'a pas demandés. */
const unaskedReads = (observation: Observation): string[] =>
  [...observation.reads].filter((key) => !RUNTIME_PROBES.has(key) && !(key in observation.select));

describe('Une réponse d’authentification ne lit que ce que son select a demandé (#4554)', () => {
  it('mot de passe seul : aucun champ lu hors du select', async () => {
    const store = makeStore(seedUser());
    const service = newService(store.client);

    const result = await service.authenticate({ username: 'alice', password: PASSWORD }, requestContext);

    expect(result).not.toBeNull();
    expect(store.observations).toHaveLength(1);
    expect(unaskedReads(store.observations[0])).toEqual([]);
  });

  it('second facteur : aucun champ lu hors du select', async () => {
    const store = makeStore(seedUser({ twoFactorEnabledAt: new Date('2026-01-01T00:00:00Z') }));
    const service = newService(store.client);

    const etape1 = await service.authenticate({ username: 'alice', password: PASSWORD }, requestContext);
    const etape2 = await service.completeAuthWith2FA(
      (etape1 as { twoFactorToken: string }).twoFactorToken,
      BACKUP_CODE,
      requestContext
    );

    expect('success' in etape2 && etape2.success === false).toBe(false);
    expect(store.observations).toHaveLength(2);
    expect(unaskedReads(store.observations[1])).toEqual([]);
  });

  it('lien magique (getUserById) : aucun champ lu hors du select', async () => {
    const store = makeStore(seedUser());
    const service = newService(store.client);

    const user = await service.getUserById('507f1f77bcf86cd799439011');

    expect(user).not.toBeNull();
    expect(store.observations).toHaveLength(1);
    expect(unaskedReads(store.observations[0])).toEqual([]);
  });

  it('la présence servie est la MÊME sur les deux portes de connexion', async () => {
    const parMotDePasse = makeStore(seedUser());
    const parSecondFacteur = makeStore(seedUser({ twoFactorEnabledAt: new Date('2026-01-01T00:00:00Z') }));

    const sansDeuxiemeFacteur = await newService(parMotDePasse.client)
      .authenticate({ username: 'alice', password: PASSWORD }, requestContext);

    const service = newService(parSecondFacteur.client);
    const etape1 = await service.authenticate({ username: 'alice', password: PASSWORD }, requestContext);
    const etape2 = await service.completeAuthWith2FA(
      (etape1 as { twoFactorToken: string }).twoFactorToken,
      BACKUP_CODE,
      requestContext
    );

    const servi = (etape2 as { user: { isOnline: unknown; lastActiveAt: unknown } }).user;
    expect(servi.isOnline).toBe(sansDeuxiemeFacteur!.user.isOnline);
    expect(servi.lastActiveAt).toEqual(sansDeuxiemeFacteur!.user.lastActiveAt);
  });

  it('les trois chemins consomment le site unique, et n’y ajoutent que leur secret', async () => {
    const parMotDePasse = makeStore(seedUser());
    const parSecondFacteur = makeStore(seedUser({ twoFactorEnabledAt: new Date('2026-01-01T00:00:00Z') }));
    const parLienMagique = makeStore(seedUser());

    await newService(parMotDePasse.client).authenticate({ username: 'alice', password: PASSWORD }, requestContext);

    const service = newService(parSecondFacteur.client);
    const etape1 = await service.authenticate({ username: 'alice', password: PASSWORD }, requestContext);
    await service.completeAuthWith2FA(
      (etape1 as { twoFactorToken: string }).twoFactorToken,
      BACKUP_CODE,
      requestContext
    );

    await newService(parLienMagique.client).getUserById('507f1f77bcf86cd799439011');

    const motDePasse = parMotDePasse.observations[0].select;
    const secondFacteur = parSecondFacteur.observations[1].select;
    const lienMagique = parLienMagique.observations[0].select;

    expect(motDePasse).toEqual(expect.objectContaining(AUTH_USER_SELECT));
    expect(secondFacteur).toEqual(expect.objectContaining(AUTH_USER_SELECT));
    expect(lienMagique).toEqual(expect.objectContaining(AUTH_USER_SELECT));

    // Un secret ne voyage QUE vers le chemin qui le confronte : le site unique
    // n'en porte aucun, sans quoi le lien magique chargerait le secret TOTP et
    // la connexion par mot de passe les codes de secours.
    expect('password' in AUTH_USER_SELECT).toBe(false);
    expect('twoFactorSecret' in AUTH_USER_SELECT).toBe(false);
    expect('twoFactorBackupCodes' in AUTH_USER_SELECT).toBe(false);
    expect(motDePasse.password).toBe(true);
    expect(motDePasse.twoFactorSecret).toBeUndefined();
    expect(secondFacteur.twoFactorSecret).toBe(true);
    expect(secondFacteur.password).toBeUndefined();
    expect(lienMagique.password).toBeUndefined();
    expect(lienMagique.twoFactorSecret).toBeUndefined();
  });
});
