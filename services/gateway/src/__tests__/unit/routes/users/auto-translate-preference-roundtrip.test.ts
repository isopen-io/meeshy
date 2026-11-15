/**
 * **Une préférence écrite est une préférence RELUE** — l'aller-retour de
 * `autoTranslateEnabled` sur les deux chemins qui le servent au propriétaire
 * du compte (#3736).
 *
 * ## Pourquoi un fichier de témoins à part, nommé pour la LOI
 *
 * `unit/routes/users/profile.test.ts` couvre la ROUTE `PATCH /users/me` ;
 * `unit/routes/me/get-me.test.ts` et `me-unified-read.test.ts` couvrent la
 * ROUTE `GET /me`. La propriété gardée ici n'appartient à aucune des deux :
 * elle les TRAVERSE — ce qu'une route écrit, l'autre doit le rendre. Un témoin
 * par route ne peut pas la voir, chacun étant cohérent avec lui-même
 * (§ « Deux moitiés d'un protocole peuvent être cohérentes SÉPARÉMENT »,
 * `services/gateway/CLAUDE.md`). Les deux surfaces partagent donc ici UN SEUL
 * double de `UserPreferences`, et l'aller-retour se mesure dessus.
 *
 * ## Deux pièges que ce fichier prend au sérieux
 *
 * 1. **Le corps SÉRIALISÉ, jamais la valeur rendue par le gestionnaire.**
 *    `fast-json-stringify` supprime en silence toute clé qu'un schéma de
 *    réponse ne déclare pas — la classe de défaut qui a vidé six routes de ce
 *    dépôt. Les schémas partagés (`userSchema`, `updateUserRequestSchema`) et
 *    `formatUserResponse` sont donc les VRAIS, sans double, et chaque
 *    assertion porte sur `res.json()` d'une injection Fastify réelle.
 * 2. **`User` n'a AUCUNE colonne `autoTranslateEnabled`.** Le seul magasin est
 *    le document `UserPreferences.application`. Un double qui pose la clé sur
 *    la LIGNE `User` fabrique une colonne qui n'existe pas et rend vert un
 *    service qui ne lit rien — les fixtures ci-dessous ne la posent jamais là.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Doubles : PROLONGER, jamais remplacer (règle du cycle 93) ──────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn<any>().mockResolvedValue(undefined) })),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// La diffusion `user:preferences-updated` est le TROISIÈME devoir d'une
// écriture de préférences par utilisateur (persister, versionner, DIFFUSER —
// `services/gateway/CLAUDE.md`). Le double est posé au niveau du transport
// pour que le témoin assert sur le COUPLE (événement, charge), jamais sur la
// seule room (leçon du cycle 104).
const broadcastToUser = jest.fn<any>(() => true);
jest.mock('../../../../utils/socket-broadcast', () => ({
  ...(jest.requireActual('../../../../utils/socket-broadcast') as object),
  broadcastToUser: (...args: unknown[]) => broadcastToUser(...args),
}));

// ─── Imports après les doubles ──────────────────────────────────────────────

import { updateUserProfile } from '../../../../routes/users/profile-updates';
import { withMutationLog } from '../../../../utils/withMutationLog';
import { handleGetMe, meRouteSharedOptions } from '../../../../routes/me/get-me';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

/**
 * La ligne `User`, telle que la base la porte : **sans**
 * `autoTranslateEnabled`, qui n'y est pas une colonne.
 */
const LIGNE_USER = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Lovelace',
  displayName: 'Alice',
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
  deviceLocale: null,
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
 * Le magasin PARTAGÉ par les deux surfaces — c'est lui qui fait de ce fichier
 * un témoin d'aller-retour et non deux témoins juxtaposés.
 *
 * `document === ABSENT` désigne l'absence de LIGNE `UserPreferences` (un compte
 * qui n'a jamais réglé la moindre préférence), distincte d'un document présent
 * mais vide.
 */
const ABSENT = Symbol('aucune ligne UserPreferences');

type Magasin = { document: unknown };

function makePrisma(magasin: Magasin) {
  const userPreferences = {
    findUnique: jest.fn<any>(async () =>
      magasin.document === ABSENT ? null : { application: magasin.document }
    ),
    upsert: jest.fn<any>(async (args: any) => {
      magasin.document =
        magasin.document === ABSENT ? args.create.application : args.update.application;
      return { application: magasin.document };
    }),
  };

  // Le vrai client HONORE `include` : sans cela le double rendrait la ligne
  // `User` nue quelle que soit la requête, et un site qui aurait cessé de
  // joindre la relation resterait vert (« un double ment aussi par ce qu'il
  // ACCEPTE », `services/gateway/CLAUDE.md`).
  const avecRelation = (args: any) =>
    args?.include?.userPreferences
      ? { userPreferences: magasin.document === ABSENT ? null : { application: magasin.document } }
      : {};

  return {
    user: {
      findUnique: jest.fn<any>(async (args: any) => ({ ...LIGNE_USER, ...avecRelation(args) })),
      update: jest.fn<any>(async (args: any) => ({
        ...LIGNE_USER,
        ...(args?.data ?? {}),
        ...avecRelation(args),
      })),
    },
    userVoiceModel: { updateMany: jest.fn<any>(async () => ({ count: 0 })) },
    userPreferences,
  };
}

async function monter(magasin: Magasin): Promise<{ app: FastifyInstance; prisma: any }> {
  const prisma = makePrisma(magasin);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false, keywords: ['example'] } } });

  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async () => {});
  app.decorate('notificationService', null as never);
  app.decorate('socketIOHandler', null as never);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      type: 'user',
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: LIGNE_USER,
    };
  });

  // Les DEUX surfaces du lot, sur la MÊME instance et le MÊME magasin.
  await updateUserProfile(app);
  app.get('/me', { schema: meRouteSharedOptions.schema }, handleGetMe);

  await app.ready();
  return { app, prisma };
}

let magasin: Magasin;
let app: FastifyInstance;
let prisma: any;

async function demarrer(document: unknown = ABSENT) {
  magasin = { document };
  ({ app, prisma } = await monter(magasin));
}

const patcher = (body: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url: '/users/me', payload: body });

const lireMoi = (query = '') => app.inject({ method: 'GET', url: `/me${query}` });

beforeEach(() => {
  broadcastToUser.mockClear();
  (withMutationLog as unknown as jest.Mock).mockClear();
});

afterEach(async () => {
  if (app) await app.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. L'ÉCRITURE — `PATCH /users/me` acceptait la clé et la JETAIT
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH /users/me — la préférence est ÉCRITE', () => {
  it('persiste `autoTranslateEnabled` dans le document UserPreferences.application', async () => {
    await demarrer(ABSENT);

    const res = await patcher({ autoTranslateEnabled: false });

    expect(res.statusCode).toBe(200);
    expect(prisma.userPreferences.upsert).toHaveBeenCalledTimes(1);
    expect(magasin.document).toMatchObject({ autoTranslateEnabled: false });
  });

  it('PRÉSERVE les clés VOISINES du document — une préférence n\'en écrase pas une autre', async () => {
    // Le document `application` porte vingt clés (thème, police, animations…).
    // Écrire la nôtre par un `upsert` NU les effacerait toutes — un défaut
    // silencieux dont le seul symptôme est un thème qui se remet à « auto ».
    await demarrer({ theme: 'dark', fontSize: 'large', autoTranslateEnabled: true });

    await patcher({ autoTranslateEnabled: false });

    expect(magasin.document).toEqual({
      theme: 'dark',
      fontSize: 'large',
      autoTranslateEnabled: false,
    });
  });

  it('le CORPS SÉRIALISÉ porte la valeur qui vient d\'être écrite', async () => {
    await demarrer(ABSENT);

    const res = await patcher({ autoTranslateEnabled: false });

    // `res.json()` — jamais la valeur rendue par le gestionnaire : c'est la
    // sérialisation qui décide de ce que le client voit.
    expect(res.json().data.user.autoTranslateEnabled).toBe(false);
  });

  it('diffuse `user:preferences-updated` sur la room personnelle — les autres appareils apprennent le changement', async () => {
    await demarrer(ABSENT);

    await patcher({ autoTranslateEnabled: false });

    expect(broadcastToUser).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      SERVER_EVENTS.USER_PREFERENCES_UPDATED,
      { userId: USER_ID, category: 'application' }
    );
  });

  it('sans la clé dans le corps, n\'écrit RIEN — et sert quand même la valeur STOCKÉE', async () => {
    // Le contrat de la route est un objet `user` COMPLET : un client qui
    // remplace son cache par cette réponse ne doit pas y perdre la préférence
    // qu'il n'a pas touchée.
    await demarrer({ autoTranslateEnabled: false });

    const res = await patcher({ displayName: 'Ada' });

    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    expect(res.json().data.user.autoTranslateEnabled).toBe(false);
  });

  it('sert le DÉFAUT partagé quand aucune ligne de préférences n\'existe', async () => {
    await demarrer(ABSENT);

    const res = await patcher({ displayName: 'Ada' });

    expect(res.json().data.user.autoTranslateEnabled).toBe(true);
  });

  it('joint la relation sur la relecture de REJEU aussi, pas seulement sur l\'écriture', async () => {
    // Le chemin dont personne ne regarde la sortie : `onDuplicate` relit la
    // ligne quand le journal de mutation reconnaît un rejeu. Une relecture qui
    // omettrait la relation servirait le DÉFAUT à la place de la valeur
    // stockée — et aucun témoin de comportement ne peut le voir, le rejeu
    // n'ayant pas de client qui s'en plaigne.
    await demarrer({ autoTranslateEnabled: false });
    await patcher({ displayName: 'Ada' });

    const appels = (withMutationLog as unknown as jest.Mock).mock.calls;
    const args = appels[appels.length - 1][0] as {
      onDuplicate: (id: string) => Promise<unknown>;
    };
    await args.onDuplicate(USER_ID);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ include: { userPreferences: { select: { application: true } } } })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE SERVICE — `GET /me` inscrit ne portait pas le document
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /me (inscrit) — la préférence est SERVIE', () => {
  it('sert la valeur STOCKÉE, pas le défaut', async () => {
    await demarrer({ autoTranslateEnabled: false });

    const res = await lireMoi();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.autoTranslateEnabled).toBe(false);
  });

  it('sert le DÉFAUT partagé quand aucune ligne de préférences n\'existe', async () => {
    await demarrer(ABSENT);

    expect((await lireMoi()).json().data.user.autoTranslateEnabled).toBe(true);
  });

  it('n\'ouvre AUCUNE lecture de préférence quand `?fields=` ne demande pas la clé', async () => {
    // Le corollaire de performance : la lecture de soi ne paie une requête
    // que pour un champ qu'elle va SERVIR.
    await demarrer({ autoTranslateEnabled: false });

    const res = await lireMoi('?fields=id,username');

    expect(Object.keys(res.json().data.user).sort()).toEqual(['id', 'username']);
    expect(prisma.userPreferences.findUnique).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. L'ALLER-RETOUR — la propriété qu'aucun témoin de route ne peut voir
// ═══════════════════════════════════════════════════════════════════════════

describe('aller-retour — ce que PATCH écrit, GET le rend', () => {
  it('PATCH false ⇒ GET false', async () => {
    await demarrer(ABSENT);

    await patcher({ autoTranslateEnabled: false });

    expect((await lireMoi()).json().data.user.autoTranslateEnabled).toBe(false);
  });

  it('PATCH false puis PATCH true ⇒ GET true (la seconde écriture gagne)', async () => {
    await demarrer(ABSENT);

    await patcher({ autoTranslateEnabled: false });
    await patcher({ autoTranslateEnabled: true });

    expect((await lireMoi()).json().data.user.autoTranslateEnabled).toBe(true);
  });
});
