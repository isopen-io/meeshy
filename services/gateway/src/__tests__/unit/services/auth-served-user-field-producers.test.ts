/**
 * Tout champ que `userSchema` PROMET a un producteur jusqu'au fil (#4641).
 *
 * ## Le défaut
 *
 * `AuthService.userToSocketIOUser` projetait 25 champs et n'en projetait ni
 * `banner` ni `timezone`. En aval, `formatUserResponse` écrivait
 * `banner: user.banner || null` : `user.banner` étant `undefined` PAR
 * CONSTRUCTION, l'expression rendait **`null`, toujours**. Tout compte portant
 * une bannière recevait donc `banner: null` à chaque connexion — mot de passe,
 * second facteur et jeton rafraîchi, les trois portes passant par le même
 * projecteur. `timezone` était le même défaut d'un cran plus bas :
 * `AUTH_USER_SELECT` le CHARGEAIT déjà (l'horloge détectée de `authenticate`
 * le lit), le projecteur ne le portait pas, et `formatUserResponse` ne le
 * servait pas du tout — la clé était simplement absente de la réponse.
 *
 * ## Pourquoi la garde de #4554 ne peut pas l'attraper — et pourquoi les deux
 * ## ne sont PAS redondantes
 *
 * `auth-result-projection-single-site.test.ts` ancre la loi INVERSE : « aucune
 * réponse d'authentification ne LIT un champ que son `select` n'a pas
 * demandé ». Elle est portée par un `Proxy` qui enregistre les ACCÈS à la
 * ligne servie, et confronte ces accès au `select` du même appel. Sa prémisse
 * est donc qu'il y a un accès à observer.
 *
 * Ici il n'y en a aucun : le projecteur ne lit pas `banner` DU TOUT. Le Proxy
 * n'enregistre rien, l'écart est nul, la garde reste verte — et le champ
 * disparaît quand même. Les deux lois bornent la même chaîne par ses deux
 * bouts, et aucune ne subsume l'autre :
 *
 * | garde | la question | ce qu'elle voit | son angle mort |
 * |---|---|---|---|
 * | #4554 (`…-single-site`) | le lecteur lit-il PLUS que le `select` ? | un accès non demandé | un champ que personne ne lit |
 * | #4641 (ce fichier) | le SCHÉMA obtient-il ce qu'il promet ? | une clé promise sans producteur | un champ hors du schéma |
 *
 * **Ne pas en supprimer une comme doublon de l'autre.** Le défaut de #4554
 * (une clé LUE hors `select`) laisse ce fichier vert dès que le contrat ne la
 * déclare pas ; le défaut de #4641 (une clé PROMISE sans producteur) laisse
 * `…-single-site` vert par construction.
 *
 * ## La forme des témoins
 *
 * 1. Le compte de référence porte une bannière **NON NULLE**. Un témoin qui
 *    assère `null` sur un compte sans bannière passe déjà avant le correctif
 *    et ne prouve rien : `null || null` rend `null` des deux côtés.
 * 2. L'assertion porte sur le corps **SÉRIALISÉ** d'une injection Fastify
 *    (`response.json()`), jamais sur la valeur du gestionnaire —
 *    fast-json-stringify est la couche qui rend cette classe de défauts
 *    invisible, et `userSchema` est le schéma de réponse RÉEL des deux portes.
 * 3. Le double Prisma **PROJETTE** : une clé absente du `select` est absente
 *    de la ligne servie, comme en production. Un double qui rend la ligne
 *    entière ne peut, par construction, jamais montrer un champ manquant.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ─── Doubles ────────────────────────────────────────────────────────────────
// Aucun ne touche au contrat : ni `@meeshy/shared/types` (qui porte
// `userSchema`, donc la sérialisation mesurée ici), ni la validation Zod du
// corps, ni `formatUserResponse`. Seules les dépendances d'INFRASTRUCTURE sont
// remplacées — Redis, GeoIP, sessions, journal.

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })
  }
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createLoginRateLimiter: () => ({ middleware: () => async () => {} }),
  createAuthGlobalRateLimiter: () => ({ middleware: () => async () => {} }),
  createTwoFactorLoginRateLimiter: () => ({ middleware: () => async () => {} })
}));

const CONTEXTE_REQUETE = {
  ip: '10.0.0.1',
  userAgent: 'TestAgent/1.0',
  deviceInfo: { type: 'desktop', browser: 'Chrome', os: 'Linux' },
  geoData: { location: 'Paris, France', timezone: 'Europe/Paris' }
};

jest.mock('../../../services/GeoIPService', () => ({
  getRequestContext: async () => CONTEXTE_REQUETE
}));

jest.mock('../../../services/SessionService', () => ({
  ...(jest.requireActual('../../../services/SessionService') as Record<string, unknown>),
  initSessionService: jest.fn(),
  generateSessionToken: () => 'session-token',
  createSession: async () => ({
    id: 'session-1',
    userId: '507f1f77bcf86cd799439011',
    deviceType: 'desktop',
    browserName: 'Chrome',
    osName: 'Linux',
    location: 'Paris, France',
    isMobile: false,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    lastActivityAt: new Date('2026-09-01T00:00:00Z')
  }),
  markSessionTrusted: async () => true
}));

// ─── Après les doubles ──────────────────────────────────────────────────────

import { userSchema } from '@meeshy/shared/types';
import { AuthService } from '../../../services/AuthService';
import { registerLoginRoutes } from '../../../routes/auth/login';

// ─── La ligne EN BASE ───────────────────────────────────────────────────────

const ID = '507f1f77bcf86cd799439011';
const MOT_DE_PASSE = 'motdepasse-1';
const CODE_DE_SECOURS = 'ABCD1234';
const BANNIERE = 'https://cdn.meeshy.me/banners/alice.jpg';
const FUSEAU = 'Europe/Paris';

const LE = (iso: string) => new Date(iso);

type Ligne = Record<string, unknown>;

/**
 * Toutes les colonnes du compte, avec une valeur DISTINCTIVE et NON NULLE
 * partout où le chemin de connexion l'autorise. C'est la condition du témoin :
 * un champ dont la valeur en base est `null` ne distingue pas « servi » de
 * « rendu null par un `|| null` sur un `undefined` ».
 *
 * Deux exceptions, nommées : `deactivatedAt` (un compte actif ne l'a pas) et
 * `twoFactorEnabledAt` (la porte MOT DE PASSE exige son absence, sans quoi
 * `authenticate` bifurque vers l'étape 2). Sur ces deux-là, le témoin ne
 * garde que la PRÉSENCE de la clé — et le second est repris non nul par la
 * porte SECOND FACTEUR, où il vaut sa vraie valeur.
 */
const compteEnBase = (surcharges: Ligne = {}): Ligne => ({
  id: ID,
  username: 'alice',
  email: 'alice@example.com',
  password: bcrypt.hashSync(MOT_DE_PASSE, 4),
  firstName: 'Alice',
  lastName: 'Martin',
  displayName: 'Alice Martin',
  bio: 'Analyste',
  avatar: 'https://cdn.meeshy.me/avatars/alice.jpg',
  banner: BANNIERE,
  phoneNumber: '+33612345678',
  phoneCountryCode: 'FR',
  role: 'USER',
  isActive: true,
  deactivatedAt: null,
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: 'es',
  isOnline: true,
  lastActiveAt: LE('2026-08-30T10:00:00.000Z'),
  emailVerifiedAt: LE('2026-01-01T00:00:00.000Z'),
  phoneVerifiedAt: LE('2026-01-02T00:00:00.000Z'),
  twoFactorEnabledAt: null,
  twoFactorSecret: null,
  twoFactorBackupCodes: [crypto.createHash('sha256').update(CODE_DE_SECOURS).digest('hex')],
  twoFactorChallengeHash: null,
  twoFactorChallengeExpiresAt: null,
  lastPasswordChange: LE('2026-01-03T00:00:00.000Z'),
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastLoginIp: '10.0.0.1',
  lastLoginLocation: 'Paris, France',
  lastLoginDevice: 'TestAgent/1.0',
  timezone: FUSEAU,
  pendingEmail: null,
  pendingPhoneNumber: null,
  profileCompletionRate: 80,
  createdAt: LE('2025-01-01T00:00:00.000Z'),
  updatedAt: LE('2026-08-30T10:00:00.000Z'),
  userPreferences: { application: { autoTranslateEnabled: false } },
  ...surcharges
});

// ─── Un magasin qui PROJETTE ────────────────────────────────────────────────

type Clause = Record<string, unknown>;

const correspondFeuille = (valeur: unknown, condition: unknown): boolean => {
  if (condition === null) return valeur === null || valeur === undefined;
  if (condition instanceof Date) return valeur instanceof Date && valeur.getTime() === condition.getTime();
  if (typeof condition !== 'object') return valeur === condition;

  const clause = condition as Clause;
  const insensible = clause.mode === 'insensitive';
  const texte = (v: unknown) => (typeof v === 'string' && insensible ? v.toLowerCase() : v);

  if ('equals' in clause) return texte(valeur) === texte(clause.equals);
  if ('gt' in clause) {
    if (!(valeur instanceof Date) || !(clause.gt instanceof Date)) return false;
    return valeur.getTime() > clause.gt.getTime();
  }
  return false;
};

const correspond = (ligne: Ligne, where: Clause): boolean =>
  Object.entries(where).every(([cle, condition]) => {
    if (cle === 'OR') return (condition as Clause[]).some((c) => correspond(ligne, c));
    return correspondFeuille(ligne[cle], condition);
  });

/**
 * `project` est le seul comportement qui compte : une clé absente du `select`
 * est absente de la ligne servie. Un double qui rend la ligne entière rendrait
 * ce fichier trivialement vert — c'est exactement le défaut de harnais que
 * #4554 a mesuré.
 */
const magasin = (graine: Ligne) => {
  const lignes: Ligne[] = [{ ...graine }];

  const trouver = (where: Clause) => lignes.find((l) => correspond(l, where)) ?? null;

  const projeter = (ligne: Ligne, select: Clause | undefined): Ligne =>
    select === undefined
      ? { ...ligne }
      : Object.fromEntries(
          Object.entries(select)
            .filter(([, demande]) => Boolean(demande))
            .map(([cle]) => [cle, ligne[cle]])
        );

  const lire = ({ where, select }: { where: Clause; select?: Clause }) => {
    const ligne = trouver(where);
    return ligne === null ? null : projeter(ligne, select);
  };

  return {
    user: {
      findFirst: jest.fn(async (args: { where: Clause; select?: Clause }) => lire(args)),
      findUnique: jest.fn(async (args: { where: Clause; select?: Clause }) => lire(args)),
      update: jest.fn(async ({ where, data }: { where: Clause; data: Ligne }) => {
        const ligne = trouver(where);
        if (!ligne) throw new Error('Utilisateur introuvable');
        Object.assign(ligne, data);
        return { ...ligne };
      }),
      updateMany: jest.fn(async () => ({ count: 0 }))
    },
    securityEvent: { create: jest.fn(async () => ({ id: 'sec-1' })) },
    userSession: { findFirst: jest.fn(async () => null), update: jest.fn(async () => ({})) }
  } as never;
};

// ─── L'application, avec les VRAIES routes de connexion ─────────────────────

const memoireCache = () => {
  const carte = new Map<string, string>();
  return {
    get: async (cle: string) => carte.get(cle) ?? null,
    set: async (cle: string, valeur: string) => void carte.set(cle, valeur),
    del: async (cle: string) => void carte.delete(cle)
  };
};

async function monterConnexion(graine: Ligne): Promise<{ app: FastifyInstance; authService: AuthService }> {
  const prisma = magasin(graine);
  const authService = new AuthService(prisma, 'jwt-secret');

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  // `POST /logout`, enregistrée par le même module, exige ce décorateur ; les
  // deux portes mesurées ici ne le franchissent jamais.
  app.decorate('authenticate', async () => {});

  registerLoginRoutes({
    fastify: app,
    authService,
    phoneTransferService: {} as never,
    smsService: {} as never,
    cacheStore: memoireCache() as never,
    redis: {} as never,
    prisma
  });

  await app.ready();
  return { app, authService };
}

const parMotDePasse = async (app: FastifyInstance) =>
  app.inject({
    method: 'POST',
    url: '/login',
    payload: { username: 'alice', password: MOT_DE_PASSE }
  });

const parSecondFacteur = async (app: FastifyInstance) => {
  const etape1 = await parMotDePasse(app);
  const twoFactorToken = etape1.json().data.twoFactorToken as string;
  return app.inject({
    method: 'POST',
    url: '/login/2fa',
    payload: { twoFactorToken, code: CODE_DE_SECOURS }
  });
};

// ─── Ce que le contrat PROMET ───────────────────────────────────────────────

/**
 * Les champs de `userSchema` dont on ASSUME qu'aucun producteur ne les sert,
 * avec la raison écrite. Une entrée de plus doit être un acte délibéré ; une
 * entrée de moins fait partie du correctif qui la comble.
 */
const SANS_PRODUCTEUR_ASSUME: Readonly<Record<string, string>> = {
  phoneCountryCode:
    "`SocketIOUser` (packages/shared) ne DÉCLARE pas ce champ : le projecteur ne " +
    'peut pas le porter sans élargir le type partagé, hors du territoire de #4641. Suivi à ouvrir.'
};

/** La valeur ATTENDUE sur le fil, colonne par colonne — dates en ISO. */
const SERVI_ATTENDU: Readonly<Record<string, unknown>> = {
  id: ID,
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Martin',
  displayName: 'Alice Martin',
  bio: 'Analyste',
  avatar: 'https://cdn.meeshy.me/avatars/alice.jpg',
  banner: BANNIERE,
  phoneNumber: '+33612345678',
  role: 'USER',
  isActive: true,
  deactivatedAt: null,
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: 'es',
  autoTranslateEnabled: false,
  isOnline: true,
  lastActiveAt: '2026-08-30T10:00:00.000Z',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  phoneVerifiedAt: '2026-01-02T00:00:00.000Z',
  twoFactorEnabledAt: null,
  lastPasswordChange: '2026-01-03T00:00:00.000Z',
  lastLoginIp: '10.0.0.1',
  lastLoginLocation: 'Paris, France',
  lastLoginDevice: 'TestAgent/1.0',
  timezone: FUSEAU,
  profileCompletionRate: 80,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2026-08-30T10:00:00.000Z'
};

const CHAMPS_PROMIS = Object.keys(userSchema.properties);

// ─── Les témoins ────────────────────────────────────────────────────────────

describe('la bannière d’un compte qui EN A une atteint le fil (#4641)', () => {
  it('porte MOT DE PASSE : le corps sérialisé porte la bannière, pas `null`', async () => {
    const { app } = await monterConnexion(compteEnBase());

    const reponse = await parMotDePasse(app);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().data.user.banner).toBe(BANNIERE);
    await app.close();
  });

  it('porte SECOND FACTEUR : la même bannière, par le même projecteur', async () => {
    const { app } = await monterConnexion(
      compteEnBase({ twoFactorEnabledAt: LE('2026-02-01T00:00:00.000Z') })
    );

    const reponse = await parSecondFacteur(app);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().data.user.banner).toBe(BANNIERE);
    await app.close();
  });

  it('porte JETON RAFRAÎCHI (`getUserById`) : le projecteur la porte aussi', async () => {
    // La troisième porte (`POST /auth/refresh`, `routes/auth/magic-link.ts`)
    // sert `formatUserResponse(await authService.getUserById(id), …)`. Son
    // module monte l'intergiciel d'authentification unifié et six schémas de
    // plus ; le défaut, lui, vit dans le projecteur que les trois partagent —
    // c'est donc lui qu'on interroge ici, et la sérialisation est prouvée par
    // les deux témoins ci-dessus.
    const { authService } = await monterConnexion(compteEnBase());

    const user = await authService.getUserById(ID);

    expect(user).not.toBeNull();
    expect(user!.banner).toBe(BANNIERE);
  });
});

describe('le fuseau horaire promis par le contrat est SERVI (#4641)', () => {
  it('porte MOT DE PASSE : `timezone` est une clé de la réponse, à sa valeur', async () => {
    const { app } = await monterConnexion(compteEnBase());

    const user = (await parMotDePasse(app)).json().data.user;

    expect(user).toHaveProperty('timezone');
    expect(user.timezone).toBe(FUSEAU);
    await app.close();
  });

  it('porte SECOND FACTEUR : même fuseau', async () => {
    const { app } = await monterConnexion(
      compteEnBase({ twoFactorEnabledAt: LE('2026-02-01T00:00:00.000Z') })
    );

    expect((await parSecondFacteur(app)).json().data.user.timezone).toBe(FUSEAU);
    await app.close();
  });
});

describe('chaque champ que `userSchema` promet a un producteur (#4641)', () => {
  it('la porte MOT DE PASSE sert tout ce que le contrat déclare', async () => {
    const { app } = await monterConnexion(compteEnBase());

    const user = (await parMotDePasse(app)).json().data.user as Record<string, unknown>;

    const muets = CHAMPS_PROMIS.filter(
      (champ) => !(champ in SANS_PRODUCTEUR_ASSUME) && !(champ in user)
    );

    expect(muets).toEqual([]);
    await app.close();
  });

  it('et il le sert à la VALEUR de la colonne, jamais à un repli', async () => {
    // La moitié qui distingue ce témoin d'une vérification de présence :
    // `banner: user.banner || null` produisait bien la CLÉ — à `null`, pour
    // tout le monde. Seule la confrontation à la valeur en base le voit.
    const { app } = await monterConnexion(compteEnBase());

    const user = (await parMotDePasse(app)).json().data.user as Record<string, unknown>;

    const ecarts = Object.entries(SERVI_ATTENDU)
      .filter(([champ, attendu]) => user[champ] !== attendu)
      .map(([champ, attendu]) => `${champ}: servi=${JSON.stringify(user[champ])} attendu=${JSON.stringify(attendu)}`);

    expect(ecarts).toEqual([]);
    await app.close();
  });

  it('`permissions` est servi comme un objet, et non supprimé', async () => {
    const { app } = await monterConnexion(compteEnBase());

    const user = (await parMotDePasse(app)).json().data.user;

    expect(typeof user.permissions).toBe('object');
    expect(user.permissions).not.toBeNull();
    await app.close();
  });

  it('la table des valeurs attendues couvre TOUT le contrat, moins les exemptions écrites', () => {
    // Sans ce témoin, oublier une ligne de `SERVI_ATTENDU` affaiblirait la
    // garde en silence : le champ omis ne serait plus confronté à rien.
    const couverts = new Set([
      ...Object.keys(SERVI_ATTENDU),
      ...Object.keys(SANS_PRODUCTEUR_ASSUME),
      'permissions'
    ]);

    expect(CHAMPS_PROMIS.filter((champ) => !couverts.has(champ))).toEqual([]);
  });

  it('une seule exemption, et elle porte sa raison', () => {
    expect(Object.keys(SANS_PRODUCTEUR_ASSUME)).toEqual(['phoneCountryCode']);
    Object.values(SANS_PRODUCTEUR_ASSUME).forEach((raison) => {
      expect(raison.length).toBeGreaterThan(40);
    });
  });
});
