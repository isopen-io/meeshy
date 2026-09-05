/**
 * `?fields=` / `?expand=` — la grammaire partagée, CÂBLÉE sur ses trois sites (#4356).
 *
 * Deux familles de témoins, et la seconde est celle qui manquait au dépôt.
 *
 * **1. Sans paramètre, la réponse est INCHANGÉE, clé à clé.** C'est la ligne
 * rouge du lot : consolider quatre analyseurs ne doit rien changer au chemin
 * nominal. Les listes gelées ci-dessous ont été relevées MÉCANIQUEMENT — le
 * littéral `select` plus les surcharges du gestionnaire — puis passées au VRAI
 * sérialiseur (`app.inject`), jamais lues dans un schéma : un champ que le
 * schéma déclare et que la requête ne charge pas sort absent, et un champ
 * chargé mais non déclaré est supprimé par fast-json-stringify. Aucune des deux
 * dérives ne lève d'erreur.
 *
 * **2. Avec `fields`, la REQUÊTE est réduite.** L'assertion porte sur
 * l'ARGUMENT Prisma, pas sur le corps de la réponse : un double Prisma rend ce
 * qu'on lui dit quel que soit le `select`, donc un témoin qui n'inspecterait
 * que la réponse resterait VERT si l'on remettait un chargement complet. C'est
 * exactement ce que le titre de #4356 reproche aux quatre analyseurs — « et
 * aucun ne réduit la requête ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Doubles : PROLONGER, jamais remplacer (règle du cycle 93) ──────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

// Seul `getOptionalAuth` est substitué : il construit un VRAI middleware qui,
// sans en-tête `Authorization`, écrase l'identité que le témoin vient de poser.
// `gateProfilePresence` reste le vrai — c'est la loi de présence du 2026-08-25
// que ces charges traversent.
jest.mock('../../../routes/users/presence-gate', () => ({
  ...(jest.requireActual('../../../routes/users/presence-gate') as object),
  getOptionalAuth: () => async () => undefined,
}));

const middlewareAuthLiens = jest.fn<any>();

jest.mock('../../../middleware/auth', () => ({
  ...(jest.requireActual('../../../middleware/auth') as object),
  createUnifiedAuthMiddleware: () => middlewareAuthLiens,
}));

import { directoryPersonRoutes } from '../../../routes/directory/person';
import { registerUserRoutes } from '../../../routes/links/user';
import { handleGetMe, meRouteSharedOptions } from '../../../routes/me/get-me';
import { publicUserSelect } from '../../../routes/users/public-profile';

const PREFIXE = '/api/v1';
const CIBLE = '507f1f77bcf86cd799439011';
const TIERS = '507f1f77bcf86cd799439022';

// ═══════════════════════════════════════════════════════════════════════════
// 1. GET /directory/people/:handle
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Les treize clés servies SANS paramètre, relevées mécaniquement :
 * `publicUserSelect` (14 colonnes) moins `deactivatedAt` (chargé, jamais
 * déclaré) et moins `voiceModel` (relation dépouillée par `withVoiceFields`),
 * moins `isOnline`/`lastActiveAt` (retirés hors `?expand=presence`), plus les
 * trois clés FABRIQUÉES par la composition — `voicePublic`, `isAnonymous`,
 * `isMeeshyer`.
 */
const CLES_PROFIL_NU = [
  'avatar',
  'banner',
  'bio',
  'createdAt',
  'displayName',
  'firstName',
  'id',
  'isAnonymous',
  'isMeeshyer',
  'lastName',
  'role',
  'username',
  'voicePublic',
] as const;

function prismaProfil() {
  return {
    user: {
      findFirst: jest.fn<any>(async () => ({
        id: CIBLE,
        username: 'cible',
        firstName: 'Ada',
        lastName: 'Lovelace',
        displayName: 'Ada',
        avatar: null,
        banner: null,
        bio: null,
        role: 'USER',
        isOnline: true,
        lastActiveAt: new Date('2026-08-01T10:00:00Z'),
        deactivatedAt: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        voiceModel: null,
      })),
    },
    friendRequest: { findFirst: jest.fn<any>(async () => null) },
  };
}

async function monterProfil(viewerId: string | null): Promise<{ app: FastifyInstance; prisma: any }> {
  const prisma = prismaProfil();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  app.addHook('onRequest', async (req: any) => {
    req.authContext = viewerId
      ? { isAuthenticated: true, type: 'user', userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } }
      : { isAuthenticated: false, isAnonymous: true, type: 'anonymous', userId: 'anonymous' };
  });
  await app.register(directoryPersonRoutes, { prefix: `${PREFIXE}/directory` });
  await app.ready();
  return { app, prisma };
}

const lireProfil = (app: FastifyInstance, qs = '') =>
  app.inject({ method: 'GET', url: `${PREFIXE}/directory/people/${CIBLE}${qs}` });

describe('GET /directory/people/:handle — sans paramètre, rien ne bouge', () => {
  it('sert exactement les treize clés, ni une de plus ni une de moins', async () => {
    const { app } = await monterProfil(null);

    const data = (await lireProfil(app)).json().data as Record<string, unknown>;

    expect(Object.keys(data).sort()).toEqual([...CLES_PROFIL_NU]);
    await app.close();
  });

  it('charge le `select` public COMPLET — par identité, pas par ressemblance', async () => {
    const { app, prisma } = await monterProfil(null);

    await lireProfil(app);

    expect(prisma.user.findFirst.mock.calls[0][0].select).toBe(publicUserSelect);
    await app.close();
  });
});

describe('GET /directory/people/:handle — `fields` réduit la REQUÊTE', () => {
  it('ne charge que les colonnes demandées, plus les épinglées', async () => {
    const { app, prisma } = await monterProfil(null);

    await lireProfil(app, '?fields=username');

    // `id` (l'identité de la ligne) et les trois colonnes de PRÉSENCE restent :
    // `gateProfilePresence` les lit, et une garde de confidentialité ne peut
    // pas dépendre d'un paramètre que l'appelant choisit.
    expect(prisma.user.findFirst.mock.calls[0][0].select).toEqual({
      id: true,
      username: true,
      isOnline: true,
      lastActiveAt: true,
      deactivatedAt: true,
    });
    await app.close();
  });

  it("n'ouvre pas la jointure `voiceModel` quand aucun champ de voix n'est demandé", async () => {
    const { app, prisma } = await monterProfil(null);

    await lireProfil(app, '?fields=username,bio');

    expect('voiceModel' in prisma.user.findFirst.mock.calls[0][0].select).toBe(false);
    await app.close();
  });

  it('ouvre la jointure `voiceModel` dès qu’un champ de voix est demandé', async () => {
    const { app, prisma } = await monterProfil(null);

    await lireProfil(app, '?fields=voiceSampleUrl');

    expect(prisma.user.findFirst.mock.calls[0][0].select.voiceModel).toEqual(
      publicUserSelect.voiceModel,
    );
    await app.close();
  });

  it('un champ INCONNU ne charge aucune colonne de plus — `fields` ne peut que RESTREINDRE', async () => {
    const { app, prisma } = await monterProfil(null);

    const res = await lireProfil(app, '?fields=email,password');

    const select = prisma.user.findFirst.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['deactivatedAt', 'id', 'isOnline', 'lastActiveAt']);
    // Et la charge servie ne fabrique rien : `id` seul survit.
    expect(Object.keys(res.json().data)).toEqual(['id']);
    await app.close();
  });

  it('`?fields=` VIDE vaut absent — le `select` complet, par identité', async () => {
    const { app, prisma } = await monterProfil(null);

    await lireProfil(app, '?fields=');

    expect(prisma.user.findFirst.mock.calls[0][0].select).toBe(publicUserSelect);
    await app.close();
  });

  it('la présence reste chargée même sous un `fields` qui ne la nomme pas', async () => {
    // Le témoin de RANG du lot : sans les trois colonnes de présence, le gate
    // ne peut plus MASQUER — il masquerait par ignorance, ce qui a l'air du
    // même verdict jusqu'au jour où la loi doit dire « oui ».
    const { app, prisma } = await monterProfil(CIBLE);

    const data = (await lireProfil(app, '?fields=isOnline,lastActiveAt&expand=presence')).json()
      .data as Record<string, unknown>;

    expect(prisma.user.findFirst.mock.calls[0][0].select.isOnline).toBe(true);
    // Le propriétaire voit sa propre présence : la valeur SERVIE le prouve,
    // pas seulement la colonne chargée.
    expect(data.isOnline).toBe(true);
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. GET /links
// ═══════════════════════════════════════════════════════════════════════════

const USER_ID = '507f1f77bcf86cd799439011';

/** Le socle, relevé sur `mapBaseLinkItem` — onze clés depuis #3740 (`inactiveReason`). */
const CLES_LIEN_NU = [
  'conversationTitle',
  'createdAt',
  'currentUses',
  'expiresAt',
  'id',
  'identifier',
  'inactiveReason',
  'isActive',
  'linkId',
  'maxUses',
  'name',
] as const;

const ligneLien = {
  id: '507f1f77bcf86cd799439099',
  linkId: 'mshy_link_abc123',
  identifier: 'my-link',
  name: 'Test Link',
  isActive: true,
  currentUses: 5,
  maxUses: 100,
  expiresAt: null,
  createdAt: new Date('2025-01-01'),
  conversation: { id: 'conv-1', title: 'Test Chat', type: 'group', description: 'Desc' },
  creator: {
    id: TIERS,
    username: 'creator1',
    firstName: 'C',
    lastName: 'R',
    displayName: null,
    avatar: null,
  },
  description: 'Un lien de test',
  maxConcurrentUsers: 10,
  currentConcurrentUsers: 2,
  maxUniqueSessions: 50,
  currentUniqueSessions: 5,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  allowViewHistory: true,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowedCountries: ['FR'],
  allowedLanguages: ['fr', 'en'],
  allowedIpRanges: [],
};

async function monterLiens(): Promise<{ app: FastifyInstance; prisma: any }> {
  middlewareAuthLiens.mockImplementation(async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      type: 'user',
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
      hasFullAccess: true,
    };
  });

  const prisma = {
    conversationShareLink: {
      findMany: jest.fn<any>(async () => [ligneLien]),
      findFirst: jest.fn<any>(async () => null),
      count: jest.fn<any>(async () => 1),
      aggregate: jest.fn<any>(async () => ({ _sum: { currentUses: 5 } })),
    },
    participant: { findFirst: jest.fn<any>(async () => null) },
  };

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  await registerUserRoutes(app);
  await app.ready();
  return { app, prisma };
}

const argumentFindMany = (prisma: any) => prisma.conversationShareLink.findMany.mock.calls.at(-1)[0];

/** Les colonnes que la requête DEMANDE, quelle que soit la forme (`select` ou `include`). */
const colonnesChargees = (prisma: any): string[] => {
  const arg = argumentFindMany(prisma);
  return Object.keys(arg.select ?? arg.include ?? {});
};

describe('GET /links — sans paramètre, rien ne bouge', () => {
  it('sert exactement les dix clés du socle', async () => {
    const { app } = await monterLiens();

    const item = (await app.inject({ method: 'GET', url: '/links' })).json().data[0];

    expect(Object.keys(item).sort()).toEqual([...CLES_LIEN_NU]);
    await app.close();
  });

  it('sert les mêmes VALEURS qu’avant — le socle est décodé par iOS et Android', async () => {
    const { app } = await monterLiens();

    const item = (await app.inject({ method: 'GET', url: '/links' })).json().data[0];

    expect(item).toEqual({
      id: ligneLien.id,
      linkId: ligneLien.linkId,
      identifier: ligneLien.identifier,
      name: ligneLien.name,
      isActive: true,
      currentUses: 5,
      maxUses: 100,
      expiresAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      conversationTitle: 'Test Chat',
      inactiveReason: null,
    });
    await app.close();
  });
});

describe('GET /links — la REQUÊTE ne charge plus ce que personne ne sert', () => {
  it('sans `expand=creator`, la jointure `creator` n’est pas ouverte', async () => {
    // Elle l'était pour CENT POUR CENT des appelants, et recopiée pour ceux
    // qui la nomment — c'est-à-dire presque personne.
    const { app, prisma } = await monterLiens();

    await app.inject({ method: 'GET', url: '/links' });

    expect(colonnesChargees(prisma)).not.toContain('creator');
    await app.close();
  });

  it('avec `expand=creator`, elle l’est — et le bloc est servi', async () => {
    const { app, prisma } = await monterLiens();

    const res = await app.inject({ method: 'GET', url: '/links?expand=creator' });

    expect(colonnesChargees(prisma)).toContain('creator');
    expect(res.json().data[0].creator).toEqual(
      expect.objectContaining({ id: TIERS, username: 'creator1' }),
    );
    await app.close();
  });

  it('sans `expand=policy`, les seize colonnes de police ne sont pas chargées', async () => {
    const { app, prisma } = await monterLiens();

    await app.inject({ method: 'GET', url: '/links' });

    // Un `include` charge TOUS les scalaires de la table, implicitement : la
    // seule forme de requête qui peut en exclure seize est un `select`. Le
    // témoin le dit, sans quoi il resterait VERT sur une requête qui les
    // charge — `Object.keys(include)` ne les nomme simplement pas.
    const arg = argumentFindMany(prisma);
    expect(arg.include).toBeUndefined();
    expect(arg.select).toBeDefined();
    for (const colonne of ['allowedIpRanges', 'requireBirthday', 'maxConcurrentUsers']) {
      expect(colonne in arg.select).toBe(false);
    }
    await app.close();
  });

  it('avec `expand=policy`, elles le sont — et sont servies', async () => {
    const { app, prisma } = await monterLiens();

    const res = await app.inject({ method: 'GET', url: '/links?expand=policy' });

    expect(colonnesChargees(prisma)).toContain('allowedIpRanges');
    expect(res.json().data[0].allowedLanguages).toEqual(['fr', 'en']);
    await app.close();
  });

  it('`fields=id,linkId` ne charge que ces colonnes, plus les épinglées', async () => {
    const { app, prisma } = await monterLiens();

    const res = await app.inject({ method: 'GET', url: '/links?fields=id,linkId' });

    // `createdAt` est ÉPINGLÉ : le tri et le curseur en dépendent, et
    // `mapBaseLinkItem` l'appelle sans condition (`.toISOString()`).
    expect(colonnesChargees(prisma).sort()).toEqual(['createdAt', 'id', 'linkId']);
    // La charge SERVIE, elle, ne porte que ce qui est demandé — inchangé.
    expect(Object.keys(res.json().data[0]).sort()).toEqual(['id', 'linkId']);
    await app.close();
  });

  it('`fields=conversationTitle` ouvre la jointure `conversation`, et elle seule', async () => {
    const { app, prisma } = await monterLiens();

    const res = await app.inject({ method: 'GET', url: '/links?fields=conversationTitle' });

    expect(colonnesChargees(prisma)).toContain('conversation');
    expect(res.json().data[0]).toEqual({ conversationTitle: 'Test Chat' });
    await app.close();
  });

  it('`fields` qui ne nomme AUCUNE clé connue ne charge que les épinglées', async () => {
    const { app, prisma } = await monterLiens();

    const res = await app.inject({ method: 'GET', url: '/links?fields=email' });

    expect(colonnesChargees(prisma).sort()).toEqual(['createdAt', 'id']);
    expect(res.json().data[0]).toEqual({});
    await app.close();
  });

  it('`expand=creator` mais `fields` qui ne le garde pas : la jointure reste fermée', async () => {
    // `fields` s'applique APRÈS `expand` sur cette route (contrat #4170) : un
    // bloc qui ne survivra pas au filtre n'a aucune raison d'être chargé.
    const { app, prisma } = await monterLiens();

    const res = await app.inject({ method: 'GET', url: '/links?expand=creator&fields=id' });

    expect(colonnesChargees(prisma)).not.toContain('creator');
    expect(res.json().data[0]).toEqual({ id: ligneLien.id });
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. GET /me — le site où il n'y a RIEN à réduire, et c'est mesuré
// ═══════════════════════════════════════════════════════════════════════════

const COMPTE = {
  id: CIBLE,
  username: 'ada',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: 'Ada',
  bio: 'Analyste',
  avatar: null,
  banner: null,
  phoneNumber: null,
  role: 'USER',
  isActive: true,
  deactivatedAt: null,
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  // PAS de `autoTranslateEnabled` : `User` n'a aucune colonne de ce nom, et le
  // `select` du cache d'auth ne peut donc pas la poser sur `registeredUser`.
  // La poser ici FABRIQUAIT une colonne inexistante, et rendait vert un
  // service qui ne lisait rien (#3736). Son unique magasin est le document
  // `UserPreferences.application`, servi par le double ci-dessous.
  isOnline: true,
  lastActiveAt: new Date('2026-08-01T10:00:00Z'),
  emailVerifiedAt: new Date('2025-01-01T00:00:00Z'),
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  lastPasswordChange: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastLoginDevice: null,
  profileCompletionRate: 80,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

/**
 * Trente clés — exactement ce que `formatUserResponse` compose depuis que
 * `pendingEmail` et `pendingPhone` en ont été retirés (#4653) : aucun client ne
 * les lisait sur une réponse de connexion, mesuré sur les trois plateformes.
 *
 * `phoneCountryCode` est déclaré et jamais produit : `SocketIOUser` ne le porte
 * pas, donc le projecteur ne peut pas le servir sans élargir le type partagé.
 *
 * `timezone` A un producteur depuis #4641 — la phrase « jamais produit » qui
 * valait pour lui est devenue fausse ce jour-là. Il reste absent ICI pour une
 * raison DIFFÉRENTE, et c'est elle qu'il faut retenir : le `select` du cache
 * d'auth ne charge pas la colonne, donc `user.timezone` vaut `undefined` et le
 * projecteur ne pose pas la clé. `formatUserResponse` sert délibérément
 * `user.timezone` SANS `?? null` : `undefined` (colonne non chargée) laisse la
 * clé absente, `null` (colonne chargée et vide) sert `null`. Une route ne peut
 * donc pas DÉCLARER un fuseau qu'elle n'a pas lu — et ce gel de trente clés
 * tient toujours.
 */
const CLES_ME_NU = [
  'autoTranslateEnabled',
  'avatar',
  'banner',
  'bio',
  'createdAt',
  'customDestinationLanguage',
  'deactivatedAt',
  'displayName',
  'email',
  'emailVerifiedAt',
  'firstName',
  'id',
  'isActive',
  'isOnline',
  'lastActiveAt',
  'lastLoginDevice',
  'lastLoginIp',
  'lastLoginLocation',
  'lastName',
  'lastPasswordChange',
  'permissions',
  'phoneNumber',
  'phoneVerifiedAt',
  'profileCompletionRate',
  'regionalLanguage',
  'role',
  'systemLanguage',
  'twoFactorEnabledAt',
  'updatedAt',
  'username',
] as const;

async function monterMoi(): Promise<{ app: FastifyInstance; prisma: any }> {
  const prisma = {
    user: { findUnique: jest.fn<any>(async () => COMPTE), findFirst: jest.fn<any>(async () => COMPTE) },
    // Le magasin RÉEL de `autoTranslateEnabled` (#3736) : `GET /me` le relit,
    // et seulement quand `?fields=` laisse passer la clé.
    userPreferences: { findUnique: jest.fn<any>(async () => ({ application: { autoTranslateEnabled: true } })) },
    signalPreKeyBundle: {
      findUnique: jest.fn<any>(async () => ({
        registrationId: 42,
        isActive: true,
        lastRotatedAt: new Date('2026-07-01T00:00:00Z'),
      })),
    },
  };

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      type: 'user',
      userId: CIBLE,
      registeredUser: COMPTE,
    };
  });
  app.get('/me', { schema: meRouteSharedOptions.schema }, handleGetMe);
  await app.ready();
  return { app, prisma };
}

describe('GET /me — sans paramètre, rien ne bouge', () => {
  it('sert exactement les trente clés', async () => {
    const { app } = await monterMoi();

    const user = (await app.inject({ method: 'GET', url: '/me' })).json().data.user;

    expect(Object.keys(user).sort()).toEqual([...CLES_ME_NU]);
    await app.close();
  });

  it("n'ouvre AUCUNE requête pour composer le compte — il n'y a donc rien à réduire", async () => {
    // La forme enregistrée se compose depuis `authContext.registeredUser`,
    // déjà en mémoire (cache d'auth) : `?fields=` ne peut pas alléger une
    // requête qui n'existe pas. C'est la raison, MESURÉE, pour laquelle ce
    // site ne reçoit que la moitié « projection » du lot #4356.
    const { app, prisma } = await monterMoi();

    await app.inject({ method: 'GET', url: '/me?fields=id,username' });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /me — la projection, inchangée', () => {
  it('`fields` restreint les clés de premier niveau', async () => {
    const { app } = await monterMoi();

    const user = (await app.inject({ method: 'GET', url: '/me?fields=id,username' })).json().data.user;

    expect(Object.keys(user).sort()).toEqual(['id', 'username']);
    await app.close();
  });

  it('`expand=security` survit à `fields` — il a été demandé explicitement', async () => {
    const { app } = await monterMoi();

    const user = (
      await app.inject({ method: 'GET', url: '/me?fields=id&expand=security' })
    ).json().data.user;

    expect(Object.keys(user).sort()).toEqual(['id', 'security']);
    expect(user.security.hasSignalKeys).toBe(true);
    await app.close();
  });

  it('un jeton `expand` inconnu est ignoré, jamais refusé', async () => {
    const { app } = await monterMoi();

    const res = await app.inject({ method: 'GET', url: '/me?expand=security,futur' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.security).toBeDefined();
    await app.close();
  });
});
