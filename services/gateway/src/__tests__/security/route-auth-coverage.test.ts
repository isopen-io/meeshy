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
import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

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
      // #4190 — AVANT : ce double n'appelait QUE `onUploadCreate` et rendait
      // donc 201/401 POUR TOUTE MÉTHODE. Or `onUploadCreate` n'est invoqué en
      // production que par le gestionnaire POST : GET/HEAD/PATCH/DELETE passent
      // par `onIncomingRequest`. Le double fabriquait un 401 sur des méthodes
      // que ce chemin ne garde pas — n'importe quel témoin écrit contre ce
      // montage mesurait le double, jamais la route. Il aiguille désormais sur
      // la MÉTHODE, exactement comme `@tus/server`.
      const method = String(req?.method || 'POST').toUpperCase();
      // L'identifiant de session est le dernier segment du chemin ; la
      // collection n'en a pas — seule la CRÉATION y a un sens.
      const uploadId = String(req?.url || '').split('?')[0].split('/').filter(Boolean).pop() ?? '';
      try {
        if (method === 'POST') {
          await this.opts?.onUploadCreate?.({ headers: headersApi }, { metadata: {}, size: 0 });
          res.statusCode = 201;
        } else {
          await this.opts?.onIncomingRequest?.({ headers: headersApi }, uploadId);
          res.statusCode = 204;
        }
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
    // #4190 — un upload EXISTANT, appartenant à un tiers : le seul état dans
    // lequel `onIncomingRequest` exerce réellement sa comparaison d'identité
    // (401 sans justificatif, 403 pour un autre utilisateur). Sans lui, la
    // garde revient sur `if (!ownerUserId) return` et ne mesure rien.
    async getUpload(id: string) {
      return { id, offset: 0, size: 0, metadata: { userId: 'tus-upload-owner-user-id' } };
    }
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

import { buildAssembledApp, type CollectedRoute } from '../../route-manifest';

// Le montage jetable (stub Prisma profond + assemblage du VRAI serveur Fastify
// via `registerAllRoutes`) vivait ici même, lignes ~141-266. Il est parti dans
// `route-manifest/collect.ts` (#4276), qui en fait un ARTEFACT régénérable
// (`route-manifest.json` + `scripts/generate-route-manifest.ts`) plutôt qu'une
// pièce jetable de CE seul test — deux montages divergeraient tôt ou tard,
// exactement la classe de défaut que ce dépôt referme sans relâche. Ce test
// consomme désormais `buildAssembledApp()` depuis ce module partagé ; son
// comportement observable (mêmes routes, mêmes décorations, mêmes stubs) est
// inchangé au caractère près — seul l'endroit où le montage est ÉCRIT a bougé.

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
  // --- Annuaire ---
  {
    method: 'GET',
    url: '/api/v1/directory/availability',
    why:
      "porte PUBLIQUE de l'annuaire (S1) : elle dit si un PSEUDO est libre — une clé " +
      'publique, déjà énumérable par GET /u/:username — et si une adresse ou un numéro ' +
      'est BIEN FORMÉ. Elle ne dit JAMAIS si un identifiant de contact appartient à un ' +
      'compte : ce serait un oracle, à rebours de la doctrine de /forgot-password et de ' +
      '/magic-link/request (#4158). Bornée à 20/min par IP, plus un coupe-circuit global.',
  },
  {
    method: 'GET',
    url: '/api/v1/directory/people/:handle',
    why:
      "L'ADRESSE canonique d'un profil public (S1 anonyme / S2 connecté, #4161). " +
      'Un profil se consulte depuis un lien partagé, sans compte — comme le faisaient ' +
      "déjà GET /u/:username, GET /users/:id et GET /users/id/:id, dont elle est " +
      "l'implémentation UNIQUE, ces trois-là devenant des alias. Elle sert la " +
      'projection publique et rien de plus : les trois langues du Prisme, isActive, ' +
      'deactivatedAt et updatedAt ne sont plus ni chargés ni déclarés. La présence ' +
      "n'est servie que sur ?expand=presence, et toujours sous la loi du 2026-08-25 ; " +
      'les quatre compteurs intimes de ?expand=stats ne partent qu\'à soi et à ' +
      "l'administration. Débit : 60/min par IP pour l'anonyme, 240/min par compte.",
  },
  // --- Récupération de compte ---
  {
    method: 'POST',
    url: '/api/v1/account/deletion/resolve',
    why:
      "résolution d'un lien de suppression reçu par courriel — publique PAR NATURE : " +
      "la personne qui ANNULE sa suppression peut avoir perdu l'accès à son compte, " +
      "c'est même le cas nominal. Le secret est le jeton, qui périme en 72 h, dont les " +
      "essais sont comptés (5 avant invalidation de la demande) et dont la cadence est " +
      "bornée par un limiteur (10/h par IP). Elle remplace trois GET MUTANTS qu'un " +
      'pré-chargeur de lien pouvait déclencher (#4183).',
  },
  // --- Santé / méta ---
  { method: 'GET', url: '/health', why: 'sonde de santé infra' },
  {
    method: 'GET',
    url: '/api/v1/health/ready',
    why:
      "sonde de DISPONIBILITÉ (S0, #4219) : un orchestrateur l'appelle sans jeton, " +
      "c'est son unique raison d'être. Elle ne divulgue RIEN de l'infrastructure — son " +
      "corps ENTIER est `{ success, data: { status: 'ready' } }` en 200 et " +
      "`{ success: false, error: 'not-ready', code: 'NOT_READY' }` en 503 : ni version, " +
      "ni build, ni environnement, ni hôte, ni compteur, ni le message du pilote de base " +
      "(qui porte l'hôte et le port dans son texte). Contrairement à `GET /health`, elle " +
      'ne lit aucune collection : `$runCommandRaw({ ping: 1 })`, verdict mémoïsé 2 s, ce ' +
      "qui borne le coût de l'exemption de débit qu'une sonde exige.",
  },
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
  // `/users/email/:email` et `/users/phone/:phone` ont QUITTÉ cette liste : elles
  // sont désormais AUTHENTIFIÉES (#4160). Elles confirmaient sans compte qu'une
  // adresse ou un numéro appartient à un utilisateur Meeshy — et rendaient son
  // profil : un annuaire INVERSÉ. Cette liste les tolérait au motif que
  // l'énumération était « notée séparément dans l'audit, pas un défaut de
  // garde » — mais une primitive d'énumération EST un défaut de garde, et la
  // note ne la refermait pas.
  //
  // `GET /users`, `PUT` et `DELETE /users/:id` en ont été retirées avec les
  // routes elles-mêmes (#4185). Leur commentaire disait « à retirer de cette
  // liste si un jour implémenté » : c'est le retrait qui est arrivé d'abord.

  // --- Liens de partage anonymes / participation anonyme (mécanisme de
  //     token de session dédié, vérifié dans le handler — catégorie
  //     explicitement légitime de la mission) ---
  { method: 'POST', url: '/api/v1/anonymous/join/:linkId', why: "point d'entrée d'émission de session anonyme par lien de partage" },
  { method: 'POST', url: '/api/v1/anonymous/refresh', why: 'sessionToken du corps haché puis vérifié en base (fail-closed)' },
  { method: 'POST', url: '/api/v1/anonymous/leave', why: 'idem' },
  { method: 'GET', url: '/api/v1/anonymous/link/:identifier', why: "aperçu pré-jointure d'un lien de partage, sans contenu de messages" },
  // #4167 — porte CANONIQUE de jointure par lien (S1 invité, S2 inscrit) et ses
  // deux jumelles de session invitée : mêmes raisons que les quatre `anonymous/*`
  // ci-dessus, sous les nouveaux noms cibles (`docs/product/api-simplification/conversations.md`).
  // `admitLinkEntry` (`services/conversations/linkAdmission.ts`) est la garde —
  // un JWT valide y bascule simplement l'identité de invité à inscrit, jamais un
  // 401/403 générique, exactement comme `anonymous/join` ne l'a jamais rendu.
  { method: 'POST', url: '/api/v1/links/:key/members', why: "point d'entrée UNIFIÉ de jointure par lien — S1 invité (aucune créance) · S2 inscrit (JWT optionnel), gardé par admitLinkEntry" },
  { method: 'PATCH', url: '/api/v1/guest-sessions/me', why: 'X-Session-Token haché puis vérifié en base (fail-closed) — remplace POST /anonymous/refresh' },
  { method: 'DELETE', url: '/api/v1/guest-sessions/me', why: 'X-Session-Token haché puis vérifié en base (fail-closed) — remplace POST /anonymous/leave' },
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

  // --- Voice : sonde publique, aucune donnée utilisateur ---
  // `GET /api/v1/voice/health` a QUITTÉ cette liste AVEC la route elle-même
  // (#4190) : aucun appelant côté clients ni côté sondes d'infrastructure, et
  // une seconde réponse à « le service répond-il ? » vaut moins qu'une seule
  // qui fait autorité — `GET /health` (racine). Ne la remets pas ici.
  { method: 'GET', url: '/api/v1/voice/languages', why: 'liste statique de langues supportées' },

  // --- Posts/Feed : visibilité PUBLIC appliquée côté service pour les
  //     appelants anonymes (vérifié par lecture de PostFeedService/PostService) ---
  { method: 'GET', url: '/api/v1/posts/user/:userId', why: 'optionalAuth ; PostFeedService.getUserPosts applique buildVisibilityFilter — un anonyme ne voit que le PUBLIC' },
  { method: 'GET', url: '/api/v1/posts/community/:communityId', why: 'idem' },
  // #4149 — `GET /api/v1/social/posts` remplace neuf routes de fil social.
  // Elle est ici pour la MEME raison que les deux lignes ci-dessus : optionalAuth,
  // et PostFeedService applique `buildVisibilityFilter`, donc un anonyme ne voit
  // que le PUBLIC. Mais elle mérite un mot de plus, parce que la sonde n'observe
  // pas d'elle-même ce qui la protège : cette route ne déclare AUCUN
  // `schema.querystring` Fastify (elle valide son `scope` par une union
  // discriminée Zod DANS le gestionnaire), donc la synthèse de querystring de ce
  // test ne s'y applique pas — la sonde l'appelle SANS aucun `?scope=` et reçoit
  // un 400 avant même que la route sache QUELLE ressource est demandée, donc
  // avant qu'une autorisation ait un sens.
  //
  // Ce que cette ligne fait perdre à ce test, un autre le garde : les six scopes
  // qui exigent une identité (home, stories, stories.mine, reels, statuses,
  // bookmarks) rendent 401 à un anonyme, et c'est
  // `unit/routes/posts/social-posts-scope.test.ts` qui le prouve, scope par
  // scope. Si cette garantie tombe un jour, c'est LUI qui rougira — pas ce
  // balayage. Ne retire pas ce témoin en croyant qu'il fait doublon.
  { method: 'GET', url: '/api/v1/social/posts', why: 'optionalAuth ; scope=author/community publics par conception, les six autres rendent 401 (prouvé par unit/routes/posts/social-posts-scope.test.ts)' },
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

  // -------------------------------------------------------------------------
  // Les chemins que le WEB appelle existent (#4189)
  // -------------------------------------------------------------------------
  // Trois adresses appelées par le web ne correspondaient à AUCUNE route :
  // `/auth/check-username`, `/users/profile/:id` et `/friend-requests` sans
  // suffixe. Deux d'entre elles étaient avalées par un `if (response.ok)` — la
  // page de profil publique retombait sur des métadonnées génériques, et les
  // listes de demandes d'ami restaient DÉFINITIVEMENT vides, sans erreur.
  //
  // Pourquoi la garde vit ICI et pas côté web : un test web ne peut vérifier
  // ses URL que contre un `apiService` MOQUÉ, et un mock verrouille l'URL
  // FAUSSE aussi bien que la juste — il ne peut donc pas tomber. La seule
  // source qui tranche est la table de routes du serveur ASSEMBLÉ, qui vit
  // ici. Elle rougit dans les DEUX sens : chemin client erroné, et route
  // serveur retirée sous un appelant qui existe encore.
  //
  // PÉRIMÈTRE, dit à voix haute : seuls les appels dont le chemin est une
  // chaîne LITTÉRALE sont vus. Ceux composés par gabarit
  // (`buildApiUrl(`/users/${id}`)`) ne le sont pas — les couvrir demanderait
  // d'évaluer du TypeScript, et une garde qui prétendrait les couvrir sans le
  // faire serait pire que celle-ci.
  it('ne laisse aucun appel LITTÉRAL du web viser une route absente', () => {
    const racineWeb = path.resolve(__dirname, '../../../../../apps/web');
    if (!fs.existsSync(racineWeb)) {
      throw new Error(`apps/web introuvable (${racineWeb}) — cette garde ne peut pas se prononcer, et se taire serait pire que rougir.`);
    }

    const IGNORÉS = ['node_modules', '.next', '.turbo', '__tests__', 'coverage'];
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entrée of fs.readdirSync(dossier, { withFileTypes: true })) {
        if (IGNORÉS.includes(entrée.name)) continue;
        const complet = path.join(dossier, entrée.name);
        if (entrée.isDirectory()) parcourir(complet);
        else if (/\.(ts|tsx)$/.test(entrée.name)) fichiers.push(complet);
      }
    };
    parcourir(racineWeb);

    // `buildApiUrl('/x')` sert `<backend>/api/v1/x` ; un `/api/...` déjà présent
    // n'est pas doublé (`lib/config.ts`).
    const versUrlServeur = (litteral: string) => {
      const sansApi = litteral.startsWith('/api/v')
        ? litteral
        : litteral.startsWith('/api/')
          ? `/api/v1${litteral.slice(4)}`
          : `/api/v1${litteral.startsWith('/') ? litteral : `/${litteral}`}`;
      return sansApi.split('?')[0];
    };

    const déclarées = new Set(routes.map((r) => r.url));
    /** Une route paramétrée matche un chemin concret segment à segment. */
    const estServie = (url: string) =>
      déclarées.has(url) ||
      routes.some((r) => {
        const attendus = r.url.split('/');
        const reçus = url.split('/');
        if (attendus.length !== reçus.length) return false;
        return attendus.every((seg, i) => seg.startsWith(':') || seg === '*' || seg === reçus[i]);
      });

    // Le littéral n'est un chemin COMPLET que si rien ne lui est concaténé.
    // `${buildApiUrl('/messages')}/${id}/translate` vise bien une route réelle,
    // dont ce littéral n'est que le préfixe : le compter entier ferait rougir
    // la garde sur trois appels parfaitement corrects. On l'écarte en regardant
    // ce qui suit immédiatement la parenthèse fermante.
    const motif = /(?:buildApiUrl|apiService\.(?:get|post|put|patch|delete))\(\s*['"]([^'"$]+)['"]\s*[,)]/g;
    // Clé (url, site) et non url seule : deux fichiers visant la MÊME adresse
    // absente s'écrasaient, et le rapport n'en nommait qu'un — c'est ainsi que
    // `hooks/use-group-modal.ts` est resté caché derrière `lib/server-cache.ts`
    // pendant deux tours.
    const fantômes = new Map<string, { url: string; site: string }>();

    for (const fichier of fichiers) {
      const source = fs.readFileSync(fichier, 'utf8');
      for (const m of source.matchAll(motif)) {
        // Un appel `apiService.get('/x', …)` se termine par une virgule ; un
        // `buildApiUrl('/x')` par la parenthèse, éventuellement suivie d'une
        // concaténation qui en fait un simple PRÉFIXE — écartée ici.
        // Un appel COMMENTÉ n'est pas un appel. `privacy-settings.tsx` garde
        // ainsi, en commentaire, un `apiService.delete('/api/v1/me/account')`
        // qui documente une intention — le compter ferait rougir la garde sur
        // du texte.
        const débutLigne = source.lastIndexOf('\n', m.index!) + 1;
        const avant = source.slice(débutLigne, m.index!).trimStart();
        if (avant.startsWith('//') || avant.startsWith('*')) continue;

        const suite = source.slice(m.index! + m[0].length, m.index! + m[0].length + 3);
        if (m[0].endsWith(')') && /^\}\s*[/`]/.test(suite)) continue;

        const url = versUrlServeur(m[1]);
        if (!estServie(url)) {
          const site = path.relative(racineWeb, fichier);
          fantômes.set(`${url}\u0000${site}`, { url, site });
        }
      }
    }

    // Garde-fou du harnais lui-même : si l'extraction cesse de trouver des
    // appels, la garde passerait au vert en ne mesurant plus rien.
    //
    // Ce garde-fou a porté un PLANCHER DE VOLUME (`littéraux > 40`), calibré
    // sur un web qui écrivait ses adresses à la main. #4281 en a migré 217 vers
    // le catalogue partagé : il en reste trois, et le plancher est devenu
    // inatteignable — non parce que l'extraction a CASSÉ, mais parce qu'elle a
    // RÉUSSI. Un plancher de volume posé sur une quantité qu'un chantier a pour
    // BUT de réduire à zéro finit forcément par rougir sur un progrès, puis par
    // être abaissé à zéro : c'est-à-dire exactement l'état muet qu'il prétendait
    // interdire. Il ne mesurait pas la santé de l'extracteur, il mesurait
    // l'ampleur de la dette.
    //
    // Les deux façons dont cette garde peut devenir muette se gardent donc
    // séparément, et aucune des deux ne décroît avec la migration.

    // 1. Le BALAYAGE atteint-il l'arbre ? Un `racineWeb` cassé rendrait une
    //    liste vide, et tout le reste passerait au vert sans rien lire.
    expect(fichiers.length).toBeGreaterThan(500);

    // 2. L'EXTRACTEUR reconnaît-il encore les deux formes d'appel ? Question qui
    //    se répond sur un échantillon FIXE, insensible à ce que le web contient.
    //    Si `motif` cesse de matcher, ceci rougit — même le jour où il ne reste
    //    plus un seul littéral en production.
    const ÉCHANTILLON = [
      "apiService.get('/api/v1/echantillon/verbe');",
      "buildApiUrl('/api/v1/echantillon/constructeur');",
    ].join('\n');
    const extraits = [...ÉCHANTILLON.matchAll(motif)].map((m) => m[1]);
    expect(extraits).toEqual([
      '/api/v1/echantillon/verbe',
      '/api/v1/echantillon/constructeur',
    ]);

    // Exception UNIQUE, datée et suivie. L'onglet santé de l'administration
    // lit trois sondes qui n'existent pas — un défaut RÉEL, trouvé par cette
    // garde, mais dont le correctif exige d'abord une décision : faut-il
    // SERVIR ces sondes (une disponibilité distincte de `/health` a une valeur
    // propre) ou replier l'écran sur `/health` et `/admin/analytics/*` ?
    // Suivi en #4219. Cette liste doit rester vide ou décroître : elle n'est
    // pas un endroit où ranger ce qu'on n'a pas eu le temps de faire.
    // VIDE depuis le lot 1 du 2026-08-29 : #4219 a SERVI les trois sondes de
    // santé, #4222 a décidé qu'un « groupe » est une COMMUNAUTÉ et a repointé la
    // modale. Une liste de suivi qui ne survit pas à sa propre résolution est ce
    // qui a rendu ces deux corrections visibles — laisser les entrées après le
    // correctif ferait rougir la garde, et c'est voulu.
    const SUIVIS = new Set<string>([]);

    const restants = [...fantômes.values()].filter(({ url }) => !SUIVIS.has(url));
    expect(restants.map(({ url, site }) => `${url}  ← ${site}`)).toEqual([]);

    // La liste de suivi ne survit pas à sa propre résolution : dès qu'une de
    // ces issues est livrée, l'entrée cesse d'être trouvée et CE témoin rougit,
    // forçant son retrait. Sans lui, une exception résolue resterait en place
    // et couvrirait silencieusement la prochaine régression sur la même URL.
    const suivisEncoreFantômes = new Set(
      [...fantômes.values()].filter(({ url }) => SUIVIS.has(url)).map(({ url }) => url)
    );
    expect(suivisEncoreFantômes).toEqual(SUIVIS);
  });

  // -------------------------------------------------------------------------
  // Les routes « to be implemented » (#4185)
  // -------------------------------------------------------------------------
  // Quatre routes étaient montées, documentées dans Swagger, et ne faisaient
  // RIEN. `GET /users`, `PUT /users/:id` et `DELETE /users/:id` rendaient
  // `{ message: '… to be implemented' }` en 200 et **sans aucune garde** —
  // alors que la description Swagger des deux dernières annonçait
  // « Admin-only endpoint ». Le contrat publié déclarait une restriction que le
  // code n'appliquait pas : aucune fuite tant que ce sont des stubs, une vraie
  // fuite le jour où quelqu'un les implémente sur le contrat existant.
  // `GET /users/me/test` n'avait, elle, aucun appelant sur les trois clients.
  //
  // GARDE NÉGATIVE — et une garde négative meurt en silence : elle passe au
  // vert le jour où elle ne teste plus rien. Celle-ci a été PROUVÉE en
  // remontant temporairement `getAllUsers` et en vérifiant qu'elle rougit.
  // Le garde-fou du harnais (« au moins une centaine de routes ») la protège
  // du cas où l'assemblage cesserait d'énumérer quoi que ce soit.
  it('ne monte plus aucune route « to be implemented »', () => {
    const RETIREES = [
      { method: 'GET', url: '/api/v1/users' },
      { method: 'PUT', url: '/api/v1/users/:id' },
      { method: 'DELETE', url: '/api/v1/users/:id' },
      { method: 'GET', url: '/api/v1/users/me/test' },
      // #4186 — jumelles appauvries de l'identité et de « moi ».
      { method: 'GET', url: '/api/v1/auth/magic-link/validate' },
      { method: 'POST', url: '/api/v1/auth/validate-session' },
      // `DELETE /api/v1/me/preferences` a quitté cette liste : #4181 a ROUVERT
      // l'adresse sous un AUTRE contrat (`?categories=`, absent = tout), qui
      // absorbe les sept DELETE par catégorie. Le retrait de #4186 n'était pas
      // un aller-retour — c'est lui qui a libéré l'adresse.
      { method: 'GET', url: '/api/v1/me/me' },
    ];

    const encoreMontees = RETIREES.filter((retiree) =>
      routes.some((r) => r.method === retiree.method && r.url === retiree.url)
    );

    expect(encoreMontees.map((r) => `${r.method} ${r.url}`)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Le segment doublé (#4141)
  // -------------------------------------------------------------------------
  // `registerRevokeAllSessionsRoute` déclarait '/auth/revoke-all-sessions' sur
  // une instance que `route-registration.ts` monte DÉJÀ sous
  // `${API_PREFIX}/auth`. Le chemin réel était donc
  // `/api/v1/auth/AUTH/revoke-all-sessions`, quand l'e-mail « nouvelle
  // connexion détectée » envoie `/api/v1/auth/revoke-all-sessions` : le lien
  // « ce n'était pas moi » — SEUL site du dépôt qui coupe réellement les
  // sockets d'un intrus — répondait 404.
  //
  // Le défaut ne se voit dans aucun fichier pris isolément : la déclaration est
  // correcte, le montage est correct, c'est leur COMPOSITION qui est fausse.
  // Il ne peut donc s'attraper que sur le serveur ASSEMBLÉ, et c'est pourquoi
  // cette garde vit ici plutôt que dans un test du module de routes.
  it('ne monte aucune route dont un segment est immédiatement répété', () => {
    const doublons = routes
      .map((route) => {
        const segments = route.url.split('/').filter(Boolean);
        const doublon = segments.find((segment, i) => i > 0 && segment === segments[i - 1]);
        return doublon ? `${route.method} ${route.url}  (segment « ${doublon} » répété)` : null;
      })
      .filter((ligne): ligne is string => ligne !== null);

    expect(doublons).toEqual([]);
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
    // Une exception PÉRIMÉE ne se contente pas d'être inutile : elle attend.
    // Le jour où une route réapparaît à la même adresse — un renommage, une
    // refonte, un copier-coller — elle est accueillie comme « publique par
    // conception » sans que personne n'ait tranché. C'est une garde qui meurt
    // en silence, et un `console.warn` dans un flot de milliers de lignes de
    // sortie de test n'est lu par personne.
    //
    // Ces deux listes ne survivent donc pas à leur propre résolution.
    expect([...unusedPublic]).toEqual([]);
    expect([...unusedGaps]).toEqual([]);
  });
});
