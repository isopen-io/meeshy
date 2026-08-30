/**
 * `GET /me` — la SEULE lecture de soi (#4178).
 *
 * ## Pourquoi ce fichier, séparé de `me/index.ts` et de `auth/magic-link.ts`
 *
 * Le défaut que #4178 corrige n'est pas la duplication d'ADRESSE (`GET /me/me`
 * contre `GET /auth/me`) : c'est la DIVERGENCE possible entre deux calculs
 * indépendants de « qui suis-je ». Deux fichiers qui réécrivent chacun leur
 * propre lecture peuvent toujours diverger un jour — sur un champ oublié, un
 * garde d'accès relâché, un ETag qui ne couvre pas tout ce qui est servi.
 * `handleGetMe` est donc écrit UNE fois ici, et `me/index.ts` (la route CIBLE,
 * `GET /api/v1/me`) comme `auth/magic-link.ts` (l'ALIAS déprécié,
 * `GET /api/v1/auth/me`) l'important tel quel : la MÊME fonction, servie à
 * deux adresses. Il ne peut pas y avoir de divergence entre les deux réponses
 * puisqu'il n'y a qu'un seul calcul.
 *
 * ## Niveau S2 : JWT OU session anonyme, sans chemin frère
 *
 * `createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous:
 * true })` est ce qui distingue cette route de l'ancien `GET /auth/me` :
 * celui-ci appelait `createUnifiedAuthMiddleware(prisma, { requireAuth: true
 * })` SANS `allowAnonymous`, ce qui — vérifié en lisant la garde de
 * `middleware/auth.ts` — REFUSE en 403 tout porteur de `X-Session-Token` avant
 * même d'atteindre le handler. La branche anonyme du handler existait, mais
 * était du code MORT : la suite de tests de `auth/magic-link.ts` ne le voyait
 * pas parce qu'elle MOCKE `createUnifiedAuthMiddleware` et injecte
 * `authContext` directement, sans jamais exercer la vraie garde. C'est
 * exactement le défaut que le critère 6 de #4178 anticipe (« une route
 * régressée vers "authentifié seulement" rendrait le même verdict qu'une
 * route juste » au rang JWT) — sauf qu'ici il précédait le correctif, pas
 * seulement une régression hypothétique. `allowAnonymous: true` corrige les
 * DEUX adresses dans le même geste, puisqu'elles partagent cette constante.
 *
 * ## `security` — même source que `GET /me/preferences/encryption`
 *
 * `loadSecuritySummary` recopie la requête de `routes/me/preferences/index.ts`
 * (bundle `SignalPreKeyBundle` actif = la SEULE source de vérité de « cet
 * utilisateur a des clés » — les colonnes `User.signalIdentityKeyPublic` /
 * `signalRegistrationId` sont un miroir qu'aucun chemin d'écriture n'alimente).
 * La copie n'est pas un choix : `me/preferences/index.ts` est un CARREFOUR
 * pour ce lot (réservé en parallèle par #4181), donc rien n'est exporté de ce
 * fichier qu'on puisse importer sans risquer une collision d'édition. Le
 * rapprochement des deux (l'ancienne route DELEGANT à `loadSecuritySummary`)
 * est un suivi déclaré, pas fait ici — voir le commentaire de clôture de
 * l'issue.
 *
 * ## `fields` / `expand` — ce qui est fait, ce qui ne l'est pas
 *
 * La GRAMMAIRE des deux paramètres est celle de `utils/sparse-fieldset.ts`
 * (#4356) ; seul le vocabulaire est local. Et il n'y a RIEN à réduire côté
 * base ici — la forme enregistrée se compose depuis `authContext.registeredUser`,
 * déjà en mémoire (§ « Forme ENREGISTRÉE ») : cette route n'ouvre aucune requête
 * pour composer le compte, donc `?fields=` n'y allège que le fil. C'est mesuré
 * par un témoin (`sparse-fieldset-wiring.test.ts`), pas supposé.
 *
 * `?fields=` filtre les clés de PREMIER NIVEAU de `user` — silencieusement
 * (une clé inconnue est ignorée, jamais un 400 : la route ne connaît pas
 * d'avance tous les champs qu'un futur client demandera, et un filtre qui
 * échoue sur l'inconnu casserait un client plus récent que le serveur).
 * `?expand=` n'est RESTREINT PAR RIEN — `expand=security` ajoute `security`
 * même si `fields` ne le nomme pas, exactement comme le montre l'exemple de
 * la source (`?fields=id,username,displayName,avatar,role&expand=security` ⇒
 * les quatre champs nommés PLUS `security`). Seul `security` est implémenté :
 * `preferences` et `stats` sont des jetons RECONNUS (la querystring ne 400
 * pas dessus) mais n'ajoutent rien — ces deux expansions appartiennent aux
 * routes agrégées de #4181 (`GET /me/preferences`) et d'un futur
 * `GET /me/stats`, explicitement hors du périmètre de #4178 (§ « Reste hors
 * de cette issue »).
 *
 * ## L'ETag ne se calcule PAS ici
 *
 * `conditionalGetOnSend` (`utils/etag.ts`) est un hook `onSend` GLOBAL qui
 * hache le corps SÉRIALISÉ de toute réponse JSON 200 sans ETag déjà posé. Lui
 * laisser la main est délibéré, pas une omission : un hash calculé ICI, sur
 * l'objet `user` avant sérialisation, pourrait diverger du hash de ce qui part
 * RÉELLEMENT sur le fil si un champ était ajouté au schéma sans être ajouté au
 * hash — la route rendrait alors un 304 sur une réponse qui a changé, ce qui
 * est PIRE que l'absence de cache (elle se présente comme une synchronisation
 * réussie). En hachant les octets déjà sérialisés, `conditionalGetOnSend`
 * ferme cette classe de défaut par construction : il ne peut pas y avoir
 * d'écart entre « ce qui est haché » et « ce qui est servi », ce sont les
 * mêmes octets. Cette route se contente donc de ne PAS poser son propre ETag
 * ni son propre `Cache-Control: max-age` — les deux désactiveraient le hook
 * global (`shouldApplyConditionalGet`).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { userSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { servedUserPermissions } from '../../services/admin/served-permissions';
import { resolveAutoTranslateEnabled } from '../../utils/auto-translate-preference';
import { sendSuccess, sendUnauthorized, sendNotFound } from '../../utils/response.js';
import { formatUserResponse, type UserResponseData } from '../auth/types';
import { parseFieldList, parseTokenList, restrictFields } from '../../utils/sparse-fieldset';
import type { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';

// ─── `?expand=` ────────────────────────────────────────────────────────────

/** Les trois valeurs ACCEPTÉES par la querystring — une seule est SERVIE (§ doc-comment). */
export type ExpandOption = 'security' | 'preferences' | 'stats';

const KNOWN_EXPAND_OPTIONS: readonly ExpandOption[] = ['security', 'preferences', 'stats'];

/**
 * `undefined`/`''` ⇒ aucune expansion demandée. Jetons inconnus ignorés
 * (silencieux, § doc-comment).
 *
 * Le DÉCOUPAGE vit désormais dans `utils/sparse-fieldset.ts` (#4356) : quatre
 * analyseurs portaient la même grammaire avec quatre jeux de bornes. Ce fichier
 * ne garde que son VOCABULAIRE — les trois jetons que cette route reconnaît —
 * et le nom sous lequel la route le désigne.
 */
export function parseExpandParam(raw: unknown): ExpandOption[] {
  return [...parseTokenList(raw, KNOWN_EXPAND_OPTIONS)];
}

// ─── `?fields=` ────────────────────────────────────────────────────────────

/** `undefined`/`''` ⇒ aucun filtre (toutes les clés servies). */
export function parseFieldsParam(raw: unknown): string[] | undefined {
  const champs = parseFieldList(raw);
  return champs === null ? undefined : [...champs];
}

/**
 * Filtre les clés de PREMIER NIVEAU de `obj`. Sans `fields`, `obj` est rendu
 * TEL QUEL (même référence) — c'est le chemin nominal, sans copie inutile.
 *
 * Aucune clé n'est ÉPINGLÉE ici, contrairement à `GET /directory/people/:handle`
 * qui retient toujours `id` : sur une lecture de SOI, l'appelant sait déjà de
 * qui la réponse parle. La différence est un choix de contrat, pas un oubli, et
 * c'est la raison pour laquelle l'épinglage est un PARAMÈTRE du module partagé
 * plutôt qu'une règle qu'il imposerait.
 */
export function pickFields<T extends Record<string, unknown>>(
  obj: T,
  fields: readonly string[] | undefined
): Partial<T> {
  return restrictFields(obj, fields && fields.length > 0 ? new Set(fields) : null);
}

// ─── `expand=security` ─────────────────────────────────────────────────────

/** Exactement la forme que sert aujourd'hui `GET /me/preferences/encryption` (critère 2 de #4178). */
export type MeSecuritySummary = {
  readonly hasSignalKeys: boolean;
  readonly signalRegistrationId: number | null;
  readonly lastKeyRotation: Date | null;
};

const NO_SECURITY: MeSecuritySummary = {
  hasSignalKeys: false,
  signalRegistrationId: null,
  lastKeyRotation: null,
};

/**
 * Un utilisateur anonyme n'a jamais de bundle Signal (`User.id` requis par la
 * colonne `SignalPreKeyBundle.userId`, qu'un `Participant.id` ne peut pas
 * satisfaire — cf. CLAUDE.md « Anonymous users have NO encryption ») : ce cas
 * est tranché SANS requête, pas seulement optimisé.
 */
export async function loadSecuritySummary(
  prisma: Pick<PrismaClient, 'signalPreKeyBundle'>,
  userId: string
): Promise<MeSecuritySummary> {
  const bundle = await prisma.signalPreKeyBundle.findUnique({
    where: { userId },
    select: { registrationId: true, isActive: true, lastRotatedAt: true },
  });
  const activeBundle = bundle?.isActive ? bundle : null;

  return {
    hasSignalKeys: activeBundle !== null,
    signalRegistrationId: activeBundle?.registrationId ?? null,
    lastKeyRotation: activeBundle?.lastRotatedAt ?? null,
  };
}

// ─── Composition de `user` par forme d'appelant ────────────────────────────

/**
 * Forme ANONYME — identique à ce que servait déjà `GET /auth/me` avant
 * l'unification (préservée à l'octet près : c'est un comportement déjà
 * correct et déjà testé, pas quelque chose à réinventer).
 */
export function buildAnonymousMeUser(authContext: UnifiedAuthContext): Record<string, unknown> {
  const anonymousUser = authContext.anonymousUser;
  if (!anonymousUser) {
    throw new Error('buildAnonymousMeUser requiert authContext.anonymousUser');
  }

  const now = new Date();

  return {
    id: authContext.userId,
    username: anonymousUser.username,
    email: null,
    firstName: anonymousUser.firstName,
    lastName: anonymousUser.lastName,
    displayName: authContext.displayName,
    avatar: null,
    role: 'ANONYMOUS',
    systemLanguage: anonymousUser.language,
    regionalLanguage: anonymousUser.language,
    customDestinationLanguage: null,
    // Un participant anonyme n'a pas de ligne UserPreferences : le défaut
    // partagé s'applique (cf. GET /auth/me avant unification).
    autoTranslateEnabled: resolveAutoTranslateEnabled(null),
    isOnline: true,
    lastActiveAt: now,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    permissions: anonymousUser.permissions,
  };
}

/**
 * Forme ENREGISTRÉE — `authContext.registeredUser` (déjà en mémoire depuis le
 * middleware d'auth, cache Redis 60s compris) plutôt qu'un second
 * `prisma.user.findUnique` : c'est la requête que #4178 supprime (le gain
 * « une requête Prisma supprimée » de la table cible), et c'est déjà le
 * comportement de `GET /auth/me` — préservé, pas introduit.
 *
 * `servedUserPermissions(user.role)` est la MÊME fonction que
 * `AuthService.getUserPermissions(user)` appelle (`return
 * servedUserPermissions(user.role)`, `services/AuthService.ts:1227`) : l'appeler
 * directement évite d'exiger une instance `AuthService` dans `me/index.ts`,
 * qui n'en a pas aujourd'hui, sans rien changer au calcul.
 */
export function buildRegisteredMeUser(authContext: UnifiedAuthContext): UserResponseData {
  const user = authContext.registeredUser;
  if (!user) {
    throw new Error('buildRegisteredMeUser requiert authContext.registeredUser');
  }
  const permissions = servedUserPermissions(user.role);
  return formatUserResponse(user, permissions);
}

// ─── Le handler partagé ─────────────────────────────────────────────────────

type MeQuerystring = {
  fields?: string;
  expand?: string;
};

/**
 * `undefined` ⇒ ni « utilisateur enregistré » ni « participant anonyme » n'a
 * pu être établi (un `authContext.type` inconnu, ou une forme incohérente —
 * `isAuthenticated: true` sans l'un ni l'autre). Le handler y répond 404,
 * comme le faisait déjà `GET /auth/me` (branche « unknown auth type »).
 *
 * `UserResponseData` (enregistré) n'a pas d'index de type, contrairement à
 * l'objet littéral de la forme anonyme : les deux sont ramenés à
 * `Record<string, unknown>` pour que `pickFields` les traite identiquement —
 * les deux sont, à l'exécution, de simples objets JSON.
 */
function resolveMeBase(authContext: UnifiedAuthContext): Record<string, unknown> | undefined {
  if (authContext.type === 'user' && authContext.registeredUser) {
    return buildRegisteredMeUser(authContext) as unknown as Record<string, unknown>;
  }
  if (authContext.type === 'anonymous' && authContext.anonymousUser) {
    return buildAnonymousMeUser(authContext);
  }
  return undefined;
}

/**
 * Le SEUL calcul de « qui suis-je ». Enregistré par `me/index.ts` (adresse
 * CIBLE) et par `auth/magic-link.ts` (ALIAS déprécié) — voir le doc-comment
 * de tête. Ne rien recalculer ici indépendamment ailleurs dans le dépôt : un
 * second site qui répond à « qui suis-je » est exactement le défaut que
 * #4178 ferme.
 */
export async function handleGetMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authContext = (request as UnifiedAuthRequest).authContext;

  if (!authContext?.isAuthenticated) {
    sendUnauthorized(reply, 'Authentication required');
    return;
  }

  const query = (request.query ?? {}) as MeQuerystring;
  const fields = parseFieldsParam(query.fields);
  const expand = parseExpandParam(query.expand);

  const base = resolveMeBase(authContext);
  if (!base) {
    sendNotFound(reply, 'Utilisateur non trouvé');
    return;
  }

  const filtered = pickFields(base, fields);

  if (!expand.includes('security')) {
    sendSuccess(reply, { user: filtered });
    return;
  }

  const security =
    authContext.type === 'user' && authContext.userId
      ? await loadSecuritySummary(request.server.prisma, authContext.userId)
      : NO_SECURITY;

  sendSuccess(reply, { user: { ...filtered, security } });
}

// ─── Débit : 600/min PAR COMPTE (critère 5 de #4178) ───────────────────────

/**
 * La clé est `userId`, JAMAIS `request.ip` : depuis #4137 `trustProxy` est
 * posé, donc `request.ip` est l'ADRESSE de l'appelant — une limite posée
 * dessus compterait par adresse et non par compte, se trompant dans les deux
 * sens (plusieurs comptes derrière une sortie partagent un crédit ; un compte
 * à plusieurs adresses en cumule autant)
 * (issue #4178, critère 5 ; même motif que `createDirectoryRouteRateLimitConfig`
 * et `createPostRouteRateLimitConfig`, `middleware/rate-limiter.ts`). Le repli
 * `ip:${request.ip}` ne sert qu'un appelant SANS `authContext` exploitable —
 * impossible en pratique ici puisque `requireAuth: true` a déjà rejeté en 401
 * avant que le limiteur ne s'applique, mais un repli identifiable reste plus
 * sûr qu'une clé constante partagée par tout le monde.
 */
export function meRateLimitKeyGenerator(request: FastifyRequest): string {
  const authContext = (request as UnifiedAuthRequest).authContext;
  const id = authContext?.userId ?? `ip:${request.ip}`;
  return `me:read:${id}`;
}

export const ME_READ_RATE_LIMIT_MAX = 600;

/**
 * `hook: 'preHandler'` et `skipOnError: false` — sans eux, le critère 5 est
 * ANNONCÉ et pas APPLIQUÉ.
 *
 * `config.rateLimit` s'applique par défaut au hook `onRequest`, qui court
 * AVANT `preValidation` — donc avant que `unifiedAuth` ne pose `authContext`.
 * `meRateLimitKeyGenerator` y recevait `undefined` et retombait sur
 * `ip:${request.ip}` : la clé « par compte » que le doc-comment ci-dessus
 * décrit était donc, en pratique, une clé par ADRESSE. Mesuré sur le vrai
 * plugin, pas déduit. Découverte de #4147, portée ici parce qu'elle vide de
 * son effet une clé correctement écrite.
 *
 * Depuis #4137, `trustProxy` est posé et `request.ip` est l'adresse réelle de
 * l'appelant : le repli n'était donc pas un seau unique pour la plateforme,
 * mais il restait faux dans les deux sens — un bureau derrière une seule
 * sortie partageait un crédit, un même compte à plusieurs adresses en
 * cumulait autant.
 *
 * `skipOnError: true` est posé GLOBALEMENT par `registerGlobalRateLimiter` et
 * fusionné par `Object.assign` dans toute config qui ne le redéclare pas : un
 * Redis indisponible ouvrait la route en grand.
 */
export const meRouteRateLimitConfig = {
  max: ME_READ_RATE_LIMIT_MAX,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: meRateLimitKeyGenerator,
  errorResponseBuilder: () => ({
    success: false,
    error: 'Trop de requêtes (me). Veuillez patienter.',
    statusCode: 429,
  }),
} as const;

// ─── Schémas Fastify ────────────────────────────────────────────────────────

/**
 * `...userSchema.properties` : le socle partagé (SOURCE UNIQUE, jamais
 * recopié champ par champ — cf. CLAUDE.md « Un schéma de réponse sans
 * `properties` EFFACE » et « Entre deux producteurs, déclarer le SUPERSET »).
 * `security` est LOCAL à cette route : `userSchema` (`packages/shared`) n'a
 * pas à grossir pour un seul appelant qui l'utilise en option.
 */
const meUserSchema = {
  type: 'object',
  description: 'Le compte tel que rendu par la seule route de lecture de soi (#4178).',
  properties: {
    ...userSchema.properties,
    security: {
      type: 'object',
      nullable: true,
      description:
        'Présent seulement si ?expand inclut "security" — même forme que GET /me/preferences/encryption.',
      properties: {
        hasSignalKeys: { type: 'boolean' },
        signalRegistrationId: { type: 'number', nullable: true },
        lastKeyRotation: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  },
} as const;

export const meResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        user: meUserSchema,
      },
    },
  },
} as const;

export const meQuerystringSchema = {
  type: 'object',
  properties: {
    fields: {
      type: 'string',
      description: 'Liste de champs de premier niveau séparés par des virgules (ex: id,username,role).',
    },
    expand: {
      type: 'string',
      description:
        'Liste séparée par des virgules parmi security, preferences, stats. Seul "security" est actuellement servi (#4178) ; preferences/stats sont réservés (#4181, futur GET /me/stats).',
    },
  },
  additionalProperties: false,
} as const;

/** Options de route COMMUNES aux deux montages — évite qu'un des deux dérive du schéma/débit de l'autre. */
export const meRouteSharedOptions = {
  schema: {
    description:
      'La seule lecture de soi (#4178). Accepte un JWT (utilisateur enregistré) OU un X-Session-Token (participant anonyme, role: "ANONYMOUS") — la même route sert les deux, seul le porteur varie.',
    tags: ['me', 'user'],
    summary: 'Get current account',
    querystring: meQuerystringSchema,
    response: {
      200: meResponseSchema,
      401: errorResponseSchema,
      404: errorResponseSchema,
    },
    security: [{ bearerAuth: [] }],
  },
  config: { rateLimit: meRouteRateLimitConfig },
} as const;
