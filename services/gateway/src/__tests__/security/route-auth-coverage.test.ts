/**
 * Garde de non-régression — couverture d'authentification de TOUTES les
 * routes du gateway.
 *
 * Contexte : quatre failles d'authentification ont été trouvées par hasard
 * en cherchant autre chose (`POST /translate-blocking` sans garde,
 * `routes/voice/*` qui faisait confiance à l'en-tête client `x-user-id`,
 * les cinq routes de `routes/maintenance.ts` sans aucune garde, `GET /test`
 * qui déclenchait un job ML sans authentification — toutes corrigées).
 * Quatre trouvailles fortuites, c'est le signe qu'il faut arrêter de
 * chercher au cas par cas. Ce test ferme ce qu'on n'a pas encore trouvé :
 * il énumère les routes RÉELLEMENT enregistrées par le serveur assemblé et
 * échoue si l'une d'elles laisse passer un appelant totalement anonyme sans
 * la rejeter, sauf exception explicite et justifiée ci-dessous.
 *
 * MÉTHODE — pourquoi ce n'est pas une relecture de code source :
 * Une garde de source (`grep` sur "requireAdmin", vérification que le texte
 * d'un fichier contient tel import) se contourne par un simple renommage ou
 * un fichier voisin non protégé. Ici, on construit une VRAIE instance
 * Fastify avec le VRAI graphe de routes — `registerAllRoutes`, extrait de
 * `server.ts` dans `route-registration.ts` pour rester bit-à-bit identique
 * à ce qu'exécute la production — puis on envoie, pour CHAQUE route
 * détectée via le hook `onRoute` de Fastify, une VRAIE requête HTTP simulée
 * (`app.inject`) sans AUCUN credential (ni `Authorization`, ni
 * `X-Session-Token`, ni cookie), et on observe la VRAIE réponse produite
 * par le VRAI pipeline de hooks (`onRequest`/`preValidation`/`preHandler`,
 * y compris ceux posés via `fastify.addHook` dans un fichier de routes,
 * comme `me/preferences/index.ts`). Une route est considérée protégée
 * uniquement si la réponse est 401 ou 403 — tout le reste (200, 400, 404,
 * 500...) signifie que l'appelant anonyme a franchi la porte d'entrée.
 *
 * PÉRIMÈTRE — ce test vérifie l'AUTHENTIFICATION (une identité est-elle
 * exigée), pas l'AUTORISATION fine. Un utilisateur authentifié mais qui
 * accède à une ressource d'un tiers dont il n'est pas membre (IDOR/BOLA —
 * plusieurs cas documentés dans l'audit, ex. rôle de communauté, pièces
 * jointes vocales par attachmentId) n'est PAS détecté ici : un appelant
 * réellement anonyme y est déjà rejeté par le `preHandler` d'authentification,
 * donc le test le classe correctement comme protégé contre ce qu'il mesure.
 * Ces trous-là vivent dans le document d'audit, pas dans ce test.
 *
 * DEUX LISTES D'EXCEPTIONS, chacune justifiée ligne par ligne :
 *
 *  - PUBLIC_ROUTES : routes légitimement accessibles sans aucune identité
 *    par CONCEPTION (santé, inscription, connexion, flux de récupération de
 *    compte par jeton à usage limité, aperçu de lien de partage anonyme...).
 *    Liste STABLE — n'y ajouter une entrée que si la route ne doit
 *    structurellement jamais exiger de session HTTP.
 *
 *  - KNOWN_GAPS : trous CONFIRMÉS par l'audit du 2026-07-30
 *    (docs/superpowers/specs/2026-07-30-audit-authentification-gateway.md),
 *    volontairement NON corrigés ici — la consigne de cette mission est
 *    « chacun demande sa décision, un correctif de sécurité groupé est un
 *    correctif que personne ne relit ». Cette liste DOIT décroître : quand
 *    une entrée est corrigée, retire-la — le test se resserre alors tout
 *    seul et retombe en erreur si la même route régresse un jour.
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';

// `@tus/server`/`@tus/file-store` sont publiés en ESM pur — Jest ne peut pas
// les transformer (le reste de node_modules est exclu de la transformation,
// voir transformIgnorePatterns de jest.config.json), donc importer
// `routes/uploads/tus-handler.ts` sans mock fait échouer TOUTE la suite au
// chargement du module. On mocke la plomberie du protocole TUS (chunked
// upload resumable, hors périmètre de ce test) tout en PRÉSERVANT le vrai
// `onUploadCreate` de production — c'est exactement là que vit la garde
// d'authentification qu'on veut vérifier (routes/uploads/tus-handler.ts,
// "if (!authHeader && !sessionToken) throw 401") — en l'invoquant réellement
// depuis le mock plutôt que de le contourner.
jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    private opts: any;
    constructor(opts: any) {
      this.opts = opts;
    }
    async handle(req: any, res: any) {
      const headers = req?.headers || {};
      const headersApi = { get: (k: string) => headers[k.toLowerCase()] };
      try {
        await this.opts?.onUploadCreate?.({ headers: headersApi }, { metadata: {}, size: 0 });
        res.statusCode = 201;
        res.end();
      } catch (err: any) {
        res.statusCode = (err && err.status_code) || 500;
        res.end(typeof err?.body === 'string' ? err.body : JSON.stringify(err ?? {}));
      }
    }
  },
}));
jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
  },
}));

// `routes/voice-profile.ts` et `routes/voice-analysis.ts` appellent
// `ZMQSingleton.getInstance()` à l'enregistrement (pas dans un handler) et
// ouvrent un VRAI socket ZMQ vers 0.0.0.0:5555/5558. Sans mock, ce socket ne
// se ferme jamais (Jest reste bloqué sur les handles ouverts pendant ~2 min,
// avec un cycle de reconnexion visible dans les logs) alors qu'aucune route
// de ce test n'a besoin d'un client ZMQ fonctionnel — les appelants anonymes
// sont rejetés avant d'atteindre le moindre appel ZMQ. `VoiceProfileService`
// appelle `.on(...)` sur la valeur résolue à la construction (écoute
// d'évènements) : un vrai EventEmitter, pas `{}` (contrairement au mock plus
// simple de `__tests__/unit/routes/voice-profile.test.ts`, qui mocke aussi
// `VoiceProfileService` lui-même et n'a donc pas ce problème).
jest.mock('../../services/ZmqSingleton', () => {
  const { EventEmitter: EE } = require('events');
  return { ZMQSingleton: { getInstance: jest.fn().mockResolvedValue(new EE()) } };
});

import { registerAllRoutes, type RouteRegistrationDeps } from '../../route-registration';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';

// ---------------------------------------------------------------------------
// Stub Prisma "profond" : tout accès de propriété renvoie un nouveau proxy
// chainable, tout appel renvoie une Promise résolue à `[]`. Suffisant pour
// que le code de CONSTRUCTION de chaque module de routes (ex. `new
// XxxService(prisma)`, ou du chargement de clés au démarrage) ne plante pas
// au chargement — aucune des requêtes anonymes de ce test ne doit jamais
// réellement lire un résultat Prisma signifiant (elles sont rejetées par le
// hook d'auth avant), donc le contenu renvoyé par le stub n'a pas d'importance,
// seule sa forme (itérable, chainable) compte.
// ---------------------------------------------------------------------------
// Propriétés à ne JAMAIS relayer vers un proxy imbriqué : `then/catch/finally`
// évitent qu'un `await` traite le proxy comme un thenable ; `getter/setter`
// évitent un piège Fastify — `fastify.decorate(name, value)` sonde
// `value.getter`/`value.setter` (typeof === 'function' ?) pour détecter le
// pattern d'accesseur `{getter, setter}`. Un proxy racine dont TARGET est une
// fonction (nécessaire pour que `prisma.model.findMany(...)` reste appelable)
// a `typeof proxy === 'function'` pour CHAQUE propriété relayée, y compris
// `.getter` — Fastify croit alors définir un accesseur et n'expose plus la
// valeur telle quelle (perte de référence, `.serverEncryptionKey` redevient
// `undefined` une fois traversé `fastify.decorate`). Vérifié empiriquement :
// sans cette exclusion, `fastify.prisma !== prismaStub` à l'intérieur d'un
// plugin enregistré.
const STUB_EXCLUDED_PROPS = new Set(['then', 'catch', 'finally', 'getter', 'setter']);

function makeCallableStub(): any {
  // `[]` plutôt que `undefined` : plusieurs chemins d'enregistrement (ex.
  // `EncryptionService.ServerKeyVault.initialize()`) font `for (const x of
  // await prisma.model.findMany(...))` — un stub générique doit rester
  // itérable pour ne pas faire planter la CONSTRUCTION des routes (aucune
  // requête anonyme de ce test ne dépend du contenu réel de ce résultat).
  const fn: any = (..._args: unknown[]) => Promise.resolve([]);
  return new Proxy(fn, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (STUB_EXCLUDED_PROPS.has(prop)) return undefined;
      return makeCallableStub();
    },
    apply() {
      return Promise.resolve([]);
    },
  });
}

/**
 * Racine du stub Prisma. Doit envelopper un OBJET, pas une fonction : la même
 * sonde Fastify décrite ci-dessus traite `typeof decoratedValue === 'function'`
 * comme un signal de rebind spécial pour les décorateurs-méthodes — un stub
 * racine appelable perdrait sa référence dès `app.decorate('prisma', ...)`.
 * Seuls les niveaux enfants (`prisma.model.method(...)`) doivent être
 * appelables ; eux ne passent jamais par `fastify.decorate`.
 */
function makeDeepStub(): any {
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (STUB_EXCLUDED_PROPS.has(prop)) return undefined;
      return makeCallableStub();
    },
  });
}

interface CollectedRoute {
  method: string;
  url: string;
  bodySchema?: any;
  querystringSchema?: any;
}

async function buildAssembledApp(): Promise<{ app: FastifyInstance; routes: CollectedRoute[] }> {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        strict: 'log' as const,
        keywords: ['example'],
      },
    },
  });

  const prismaStub = makeDeepStub();

  // `fastify.authenticate` = EXACT même middleware que la production
  // (`createUnifiedAuthMiddleware(prisma, {requireAuth:true,
  // allowAnonymous:false})`, voir `server.ts` `createAuthMiddleware()`).
  // On utilise la VRAIE fonction, pas un mock — pour un appelant sans
  // `Authorization` ni `X-Session-Token`, `createAuthContext()` retourne
  // `createUnauthenticatedContext()` sans jamais toucher Prisma, donc le
  // stub ci-dessus n'est pas sollicité sur ce chemin.
  app.decorate('authenticate', createUnifiedAuthMiddleware(prismaStub, {
    requireAuth: true,
    allowAnonymous: false,
  }));

  app.decorate('prisma', prismaStub);
  app.decorate('redis', undefined);
  app.decorate('mentionService', {} as any);
  app.decorate('socketIOHandler', {} as any);
  app.decorate('jobMappingCache', {} as any);
  app.decorate('emailService', {} as any);
  app.decorate('mutationLogService', {} as any);
  app.decorate('callService', {} as any);
  app.decorate('notificationService', {} as any);
  app.decorate('socialEvents', {} as any);
  app.decorate('presenceChecker', {
    isOnline: () => false,
    bulk: () => new Map(),
    listOnlineAmong: () => [],
  } as any);

  const routes: CollectedRoute[] = [];
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    const schema = (routeOptions as any).schema;
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue; // miroir mécanique de GET, pas une route distincte à garder
      routes.push({
        method,
        url: routeOptions.url,
        bodySchema: schema?.body,
        querystringSchema: schema?.querystring,
      });
    }
  });

  const deps: RouteRegistrationDeps = {
    prisma: prismaStub,
    translationService: {
      healthCheck: async () => true,
      // Valeur non-null pour forcer l'enregistrement de
      // `registerVoiceRoutes` (voir `route-registration.ts` : "if
      // (zmqClient) { ... }") — sans ça, tout `routes/voice/*` ne serait
      // jamais enregistré et échapperait totalement à ce test.
      // `AudioTranslateService`/`AttachmentTranslateService` appellent
      // `zmqClient.on(...)` à la construction (écoute d'évènements) : un vrai
      // EventEmitter, pas un objet nu, pour que ces constructions ne plantent
      // pas au chargement des routes.
      getZmqClient: () => new EventEmitter() as any,
    } as any,
    messagingService: {} as any,
    mentionService: {} as any,
    orphanMediaCleanup: {} as any,
  };

  await registerAllRoutes(app, deps);
  await app.ready();

  return { app, routes };
}

/**
 * Remplace les segments `:param`/`*` d'un patron de route Fastify par une
 * valeur factice plausible (hex 24 caractères — valide à la fois comme
 * ObjectId Mongo et comme chaîne générique), pour obtenir une URL injectable.
 */
function resolveUrl(pattern: string): string {
  return pattern
    .replace(/:[A-Za-z0-9_]+/g, '000000000000000000000000')
    .replace(/\*/g, 'dummy-wildcard-segment');
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Synthétise une valeur JSON minimale satisfaisant grossièrement un schéma
 * JSON Schema (type + required), pour construire un corps/une querystring
 * "assez valides" pour franchir la validation Fastify. Sans ça, un `{}`
 * générique se fait rejeter en 400 par la validation AVANT même d'atteindre
 * un `preHandler` d'authentification (l'ordre réel du cycle de vie Fastify
 * est onRequest → preValidation → VALIDATION DE SCHÉMA → preHandler) — ce
 * qui ferait passer une route réellement protégée pour non protégée. Ce
 * n'est PAS un générateur de données réalistes : juste assez pour que la
 * validation structurelle laisse passer la requête jusqu'à la vraie garde.
 */
function synthesizeFromSchema(schema: any, depth = 0): any {
  if (!schema || typeof schema !== 'object' || depth > 6) return {};
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.example !== undefined) return schema.example;

  const type = Array.isArray(schema.type) ? schema.type.find((t: string) => t !== 'null') : schema.type;

  switch (type) {
    case 'object': {
      const obj: Record<string, unknown> = {};
      const required: string[] = Array.isArray(schema.required) ? schema.required : [];
      const props = schema.properties || {};
      for (const key of required) {
        obj[key] = synthesizeFromSchema(props[key] || {}, depth + 1);
      }
      return obj;
    }
    case 'array': {
      const minItems = typeof schema.minItems === 'number' ? schema.minItems : 0;
      const count = Math.max(minItems, 0);
      return Array.from({ length: count }, () => synthesizeFromSchema(schema.items || {}, depth + 1));
    }
    case 'string':
      if (schema.format === 'email') return 'anon-probe@example.com';
      if (schema.format === 'date-time') return new Date().toISOString();
      if (typeof schema.minLength === 'number') return 'x'.repeat(Math.max(schema.minLength, 1));
      if (typeof schema.pattern === 'string') return '000000000000000000000000'; // hex 24, satisfait la plupart des regex d'ObjectId
      return 'anon-probe-value';
    case 'number':
    case 'integer':
      return typeof schema.minimum === 'number' ? schema.minimum : 1;
    case 'boolean':
      return true;
    default:
      // Pas de `type` explicite (union oneOf/anyOf, $ref non résolu...) :
      // au mieux avec les `properties`/`required` si présents, sinon objet
      // vide — l'essentiel de ce test porte sur la garde d'auth, pas sur la
      // validation de schéma elle-même.
      if (schema.properties || schema.required) return synthesizeFromSchema({ ...schema, type: 'object' }, depth);
      return {};
  }
}

function synthesizeQueryString(schema: any): string {
  const value = synthesizeFromSchema(schema);
  if (!value || typeof value !== 'object') return '';
  const params = new URLSearchParams();
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue;
    params.set(key, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// PUBLIC_ROUTES — accessibles sans identité par conception. Une ligne =
// une route, un commentaire = pourquoi. Groupées par fichier pour la
// lisibilité ; la justification vaut pour tout le groupe qu'elle chapeaute.
// ---------------------------------------------------------------------------
const PUBLIC_ROUTES: Array<{ method: string; url: string; why: string }> = [
  // --- Santé / méta ---
  { method: 'GET', url: '/health', why: 'sonde de santé infra' },
  { method: 'GET', url: '/info', why: "métadonnées statiques du service, aucune donnée d'utilisateur" },
  { method: 'GET', url: '/api/v1/languages', why: 'liste statique de langues supportées' },
  { method: 'GET', url: '/api/v1/app/min-version', why: 'plancher de version applicative pour le bootstrap de la porte cliente (spec R6) — config statique lue avant toute session, aucune donnée utilisateur' },
  { method: 'POST', url: '/api/v1/detect-language', why: 'détection regex stateless, aucun accès DB/pipeline ML' },

  // --- Entrée du flux d'authentification (translation.ts a réparé /test,
  //     ce qui reste ici est volontairement sans session : on n'a pas
  //     encore de session au moment où on appelle ces routes) ---
  { method: 'POST', url: '/api/v1/auth/register', why: "point d'entrée d'inscription (rate-limité)" },
  { method: 'POST', url: '/api/v1/auth/login', why: "point d'entrée de connexion (rate-limité)" },
  { method: 'POST', url: '/api/v1/auth/login/2fa', why: 'étape 2FA du flux de connexion, protégée par le twoFactorToken transmis dans le corps — aucune session au moment de cet appel' },
  { method: 'POST', url: '/api/v1/auth/verify-email', why: "vérification d'email par token à usage limité, pré-session" },
  { method: 'POST', url: '/api/v1/auth/resend-verification', why: "renvoi d'email de vérification, pré-session" },
  { method: 'POST', url: '/api/v1/auth/send-phone-code', why: 'envoi de code SMS, pré-session (flux de vérification tél.)' },
  { method: 'POST', url: '/api/v1/auth/verify-phone', why: 'vérification de code SMS, pré-session' },
  { method: 'POST', url: '/api/v1/auth/validate-session', why: 'valide un sessionToken transmis dans le corps — son rôle est justement de fonctionner sans Authorization' },
  { method: 'POST', url: '/api/v1/auth/phone-transfer/check', why: 'flux de transfert de numéro, pré-session (rate-limité)' },
  { method: 'POST', url: '/api/v1/auth/phone-transfer/initiate', why: 'idem' },
  { method: 'POST', url: '/api/v1/auth/phone-transfer/verify', why: 'idem' },
  { method: 'POST', url: '/api/v1/auth/phone-transfer/resend', why: 'idem' },
  { method: 'POST', url: '/api/v1/auth/phone-transfer/cancel', why: 'idem, même flux pré-session que ses 6 routes soeurs (transferId non lié à un compte — cf. audit §2 pour le risque IDOR-lite noté séparément)' },
  { method: 'POST', url: '/api/v1/auth/phone-transfer/initiate-registration', why: 'flux de transfert de numéro pendant inscription, pré-session' },
  { method: 'POST', url: '/api/v1/auth/phone-transfer/verify-registration', why: 'idem' },
  { method: 'GET', url: '/api/v1/auth/check-availability', why: "vérification de disponibilité d'un identifiant avant inscription, pré-session (énumération notée séparément dans l'audit)" },
  { method: 'POST', url: '/api/v1/auth/forgot-password', why: "point d'entrée de récupération de mot de passe (3 rate-limiters dédiés)" },
  { method: 'POST', url: '/api/v1/auth/reset-password', why: 'consomme un token de reset à usage unique, pré-session' },
  { method: 'GET', url: '/api/v1/auth/reset-password/verify-token', why: 'oracle de validité de token de reset, pré-session' },
  { method: 'POST', url: '/api/v1/auth/forgot-password/phone/lookup', why: 'flux de reset par téléphone, pré-session (rate-limité)' },
  { method: 'POST', url: '/api/v1/auth/forgot-password/phone/verify-identity', why: 'idem' },
  { method: 'POST', url: '/api/v1/auth/forgot-password/phone/verify-code', why: 'idem' },
  { method: 'POST', url: '/api/v1/auth/forgot-password/phone/resend', why: 'idem' },
  { method: 'POST', url: '/api/v1/auth/magic-link/request', why: "demande de lien magique par email, pré-session" },
  { method: 'GET', url: '/api/v1/auth/magic-link/validate', why: 'consomme un lien magique à usage unique, pré-session' },
  { method: 'POST', url: '/api/v1/auth/magic-link/validate', why: 'idem' },
  { method: 'GET', url: '/api/v1/auth/revoke-all-sessions', why: 'lien signé JWT envoyé par e-mail sur connexion suspecte, vérifié par signature dans le handler. Le segment "auth" était DOUBLÉ jusqu\'à #4141 — la route existait à une adresse que rien n\'appelait, et l\'entrée d\'inventaire le disait en la traitant comme un fait acquis plutôt que comme un défaut à corriger' },

  // --- me/delete-account : flux de suppression de compte par email, tokens à usage limité ---
  { method: 'GET', url: '/api/v1/me/delete-account/confirm', why: "confirmation de suppression par lien email (token sha256 vérifié en base), pré-session par nature" },
  { method: 'GET', url: '/api/v1/me/delete-account/cancel', why: 'idem (cancelTokenHash)' },
  { method: 'GET', url: '/api/v1/me/delete-account/delete-now', why: "idem, exige en plus le statut GRACE_PERIOD_EXPIRED" },

  // --- Profils publics (design produit assumé) ---
  { method: 'GET', url: '/api/v1/u/:username', why: 'profil public consultable sans compte (optionalAuth, email/téléphone jamais renvoyés)' },
  { method: 'GET', url: '/api/v1/users/:id', why: 'idem, par id' },
  { method: 'GET', url: '/api/v1/users/id/:id', why: 'idem, lookup par ObjectId opaque' },
  { method: 'GET', url: '/api/v1/users/email/:email', why: "lookup public par email (primitive d'énumération notée séparément dans l'audit, pas un défaut de garde)" },
  { method: 'GET', url: '/api/v1/users/phone/:phone', why: "lookup public par téléphone (idem)" },
  { method: 'GET', url: '/api/v1/users', why: "stub no-op aujourd'hui (message statique, aucune donnée) — À RETIRER de cette liste si un jour implémenté avec de vraies données" },
  { method: 'PUT', url: '/api/v1/users/:id', why: "stub no-op aujourd'hui malgré une doc \"admin-only\" — À RETIRER de cette liste et gardé avant toute implémentation réelle" },
  { method: 'DELETE', url: '/api/v1/users/:id', why: 'idem' },

  // --- Liens de partage anonymes / participation anonyme (mécanisme de
  //     token de session dédié, vérifié dans le handler — catégorie
  //     explicitement légitime de la mission) ---
  { method: 'POST', url: '/api/v1/anonymous/join/:linkId', why: "point d'entrée d'émission de session anonyme par lien de partage" },
  { method: 'POST', url: '/api/v1/anonymous/refresh', why: 'sessionToken du corps haché puis vérifié en base (fail-closed)' },
  { method: 'POST', url: '/api/v1/anonymous/leave', why: 'idem' },
  { method: 'GET', url: '/api/v1/anonymous/link/:identifier', why: "aperçu pré-jointure d'un lien de partage, sans contenu de messages" },
  { method: 'GET', url: '/api/v1/links/:identifier', why: "aperçu public d'un lien d'invitation (design volontaire \"allowViewHistory\")" },
  { method: 'POST', url: '/api/v1/links/:identifier/messages', why: "x-session-token haché puis vérifié en base dans le handler (fail-closed), conversation dérivée du token pas de l'URL" },
  { method: 'GET', url: '/api/v1/links/:identifier/messages', why: 'accès conditionné à un match membre/participant anonyme vérifié dans le handler' },
  { method: 'POST', url: '/api/v1/tracking-links', why: "création d'un lien de suivi NON rattaché : ouverte par conception. Le rattachement à une conversation (`conversationId` dans le corps) exige désormais d'y participer, vérifié dans le handler — c'était le trou." },
  { method: 'GET', url: '/api/v1/tracking-links/:token', why: 'résolution publique de lien court (design assumé, commentaire explicite dans le code)' },
  { method: 'GET', url: '/api/v1/tracking-links/:token/resolve', why: 'idem, aucune donnée sensible exposée' },
  { method: 'GET', url: '/api/v1/l/:token', why: 'redirection publique de lien court' },
  { method: 'POST', url: '/api/v1/tracking-links/:token/click', why: "comptage de clic public par design" },
  { method: 'POST', url: '/api/v1/tracking-links/:token/redirect-status', why: "signal sendBeacon, explicitement documenté \"No authentication required\"" },

  // --- Affiliation : liens de parrainage publics par design ---
  { method: 'GET', url: '/api/v1/affiliate/validate/:token', why: "validation publique d'un token d'affiliation (nom/avatar publics uniquement)" },
  { method: 'POST', url: '/api/v1/affiliate/track-visit', why: "tracking de visite public par design (pollution mineure notée séparément dans l'audit)" },
  { method: 'POST', url: '/api/v1/affiliate/click/:token', why: 'comptage de clic public par design' },

  // --- Voice : sondes publiques, aucune donnée utilisateur ---
  { method: 'GET', url: '/api/v1/voice/health', why: 'statut agrégé des sous-services, aucune donnée utilisateur' },
  { method: 'GET', url: '/api/v1/voice/languages', why: 'liste statique de langues supportées' },

  // --- Posts/Feed : visibilité PUBLIC appliquée côté service pour les
  //     appelants anonymes (vérifié par lecture de PostFeedService/PostService) ---
  { method: 'GET', url: '/api/v1/posts/user/:userId', why: 'optionalAuth ; PostFeedService.getUserPosts applique buildVisibilityFilter — un anonyme ne voit que le PUBLIC' },
  { method: 'GET', url: '/api/v1/posts/community/:communityId', why: 'idem' },
  { method: 'POST', url: '/api/v1/posts/:postId/anonymous-view', why: "comptage de vue anonyme, PostService.recordAnonymousOpen filtre explicitement au PUBLIC" },

  // --- Attachments : fichiers statiques servis par nom de fichier UUIDv4
  //     réel (pas l'ObjectId de l'attachment), anti-path-traversal vérifié ---
  { method: 'GET', url: '/api/v1/attachments/file/*', why: 'noms de fichiers UUIDv4 non énumérables + garde anti path-traversal, CDN de fichiers publics par design' },
  { method: 'GET', url: '/api/attachments/file/*', why: 'même route, montage legacy sans /v1' },
];

// ---------------------------------------------------------------------------
// KNOWN_GAPS — trous confirmés par l'audit du 2026-07-30, non corrigés dans
// cette mission sur décision explicite. Cette liste doit décroître : retire
// la ligne dès que le correctif correspondant est mergé.
// ---------------------------------------------------------------------------
const KNOWN_GAPS: Array<{ method: string; url: string; why: string }> = [
  // Fermés depuis l'audit, retirés de cette liste — ne les y remets pas :
  //   POST /auth/refresh              → 573581e27 (signature vérifiée exigée)
  //   POST /auth/force-init           → route supprimée, l'init reste au démarrage
  //   GET  /status/:messageId/:lang   → 8b7c95010 (auth + appartenance)
  //   GET  /conversation/:identifier  → 8b7c95010 (auth)
  //   DELETE /attachments/:id         → 4201a63f9 (garde réparée)
  //   GET  /conversations/:id/attachments → 4201a63f9
  //   POST /attachments/upload        → 4201a63f9
  //   GET  /users/:userId/affiliate-token → authentification exigée
  //   POST /affiliate/register            → le référé est l'appelant, pas le corps
  //   GET  /attachments/:id (+thumbnail)  → auth + accès à la conversation du message
  //   POST /tracking-links                → rattachement à une conversation = y participer
  //
  // La liste est vide. Toute nouvelle entrée doit être justifiée et datée : ce
  // n'est pas un endroit où l'on range ce qu'on n'a pas eu le temps de faire.
];

function findException(list: Array<{ method: string; url: string; why: string }>, method: string, url: string) {
  return list.find((e) => e.method === method && e.url === url);
}

describe('Sécurité — couverture d\'authentification de toutes les routes du gateway', () => {
  let app: FastifyInstance;
  let routes: CollectedRoute[];

  afterAll(async () => {
    if (app) await app.close();
  });

  it('assemble le serveur réel et énumère au moins une centaine de routes (garde-fou anti-régression du harnais lui-même)', async () => {
    ({ app, routes } = await buildAssembledApp());
    expect(routes.length).toBeGreaterThan(100);
  });

  it('rejette tout appelant totalement anonyme (401/403) sur toute route qui ne figure ni dans PUBLIC_ROUTES ni dans KNOWN_GAPS', async () => {
    const failures: string[] = [];
    const unusedPublic = new Set(PUBLIC_ROUTES.map((e) => `${e.method} ${e.url}`));
    const unusedGaps = new Set(KNOWN_GAPS.map((e) => `${e.method} ${e.url}`));

    for (const route of routes) {
      const key = `${route.method} ${route.url}`;
      const publicMatch = findException(PUBLIC_ROUTES, route.method, route.url);
      const gapMatch = findException(KNOWN_GAPS, route.method, route.url);

      if (publicMatch) {
        unusedPublic.delete(key);
        continue;
      }
      if (gapMatch) {
        unusedGaps.delete(key);
        continue;
      }

      const baseUrl = resolveUrl(route.url);
      const url = route.querystringSchema ? `${baseUrl}${synthesizeQueryString(route.querystringSchema)}` : baseUrl;
      const payload = BODY_METHODS.has(route.method)
        ? JSON.stringify(route.bodySchema ? synthesizeFromSchema(route.bodySchema) : {})
        : undefined;
      const res = await app.inject({
        method: route.method as any,
        url,
        headers: { 'content-type': 'application/json' },
        payload,
      });

      if (res.statusCode !== 401 && res.statusCode !== 403) {
        failures.push(
          `${route.method} ${route.url} → HTTP ${res.statusCode} pour un appelant anonyme ` +
          `(attendu 401 ou 403). Ni dans PUBLIC_ROUTES ni dans KNOWN_GAPS. ` +
          `Ajoute une garde d'authentification, ou documente ce cas explicitement.`
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} route(s) laissent passer un appelant anonyme sans 401/403 :\n\n` +
        failures.join('\n')
      );
    }

    // Signale les entrées d'exception devenues obsolètes (route renommée/supprimée)
    // — pas un échec dur, mais un indice que la liste doit être mise à jour.
    if (unusedPublic.size > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[route-auth-coverage] Entrées PUBLIC_ROUTES obsolètes (route introuvable) : ${[...unusedPublic].join(', ')}`
      );
    }
    if (unusedGaps.size > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[route-auth-coverage] Entrées KNOWN_GAPS obsolètes (route introuvable, corrigée ou renommée ?) : ${[...unusedGaps].join(', ')}`
      );
    }
  });
});
