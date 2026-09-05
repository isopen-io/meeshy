/**
 * `GET /me/consents` et `PUT /me/consents/{purpose}` — l'adresse CANONIQUE
 * d'un consentement (#4348, fusion de #4335, suite de #4180).
 *
 * Avant ce lot, un consentement se lisait par `GET /voice/profile/consent`
 * (trois clés seulement — pas `dataProcessingConsentAt`) et s'écrivait par
 * `POST /voice/profile/consent` (`VoiceProfileService.updateConsent`), deux
 * routes montées sous `/voice/profile`, hors de tout préfixe `/me` — la
 * raison structurelle nommée par #4335 : aucune route enregistrée à
 * l'intérieur de ce plugin ne peut exposer un chemin `/me`. Ce fichier NEUF
 * ouvre l'adresse `/me/consents`, montage AUTONOME au même préfixe que
 * `me-permissions` (#4350) et `me-categories` (#4359) — même patron : pas de
 * parent qui pose déjà l'authentification, donc `onRequest:
 * [fastify.authenticate]` posé ICI, sur les deux routes.
 *
 * `POST /voice/profile/consent` n'est PAS touchée par ce lot : elle reste la
 * seule porte qui CASCADE l'octroi (accorder le clonage vocal accorde aussi,
 * en silence, ses trois dépendances si elles manquent). `PUT
 * /me/consents/{purpose}` reproduit la MÊME cascade au moment d'ACCORDER
 * (jamais au moment de RETIRER — retirer une clé ne touche que sa propre
 * colonne, comme `VoiceProfileService.updateConsent`) : sans elle, accorder
 * `voice-cloning` seul par cette route laisserait `voiceCloningEnabledAt`
 * posé pendant que `ConsentValidationService.hasVoiceCloningConsent` reste
 * `false` faute d'ancêtre — un consentement affiché « accordé » ici et
 * inactif partout ailleurs, exactement la divergence que #4180 a fermée côté
 * lecture. La hiérarchie reproduite est celle que documente
 * `ConsentValidationService` en tête de fichier :
 * `dataProcessingConsentAt → voiceDataConsentAt → voiceProfileConsentAt →
 * voiceCloningEnabledAt`. Fusionner les deux écrivains dans une seule route
 * (retirer `/voice/profile/consent`) est un suivi distinct — #4348 nomme
 * explicitement « compter les appels Android avant de retirer
 * `/voice/profile/consent` » comme un préalable non fait ici.
 *
 * ## Le régime des quatre `purpose`, et pourquoi `analytics` n'y est pas
 *
 * Quatre `purpose` seulement, chacun adossé à UNE colonne `User.*ConsentAt`
 * horodatée par le SERVEUR — jamais un cinquième fabriqué pour l'apparence
 * de la conformité. `allowAnalytics` (`PrivacyPreferenceSchema`) reste une
 * PRÉFÉRENCE booléenne, opt-out, décidée dans le commentaire de fusion de
 * #4348 : un consentement horodaté n'a de sens que s'il gouverne un
 * traitement qui, sans lui, ne peut pas avoir lieu — ce n'est pas le cas
 * aujourd'hui pour l'analytique produit. `analyticsConsentAt` n'existe nulle
 * part dans `schema.prisma`, et ce fichier ne l'invente pas.
 *
 * ## `policyVersion` — une version, pas un historique par consentement
 *
 * `schema.prisma` ne porte AUCUNE colonne pour horodater « sous quelle
 * version de la politique ce consentement précis a été donné » — ni sur
 * `User`, ni ailleurs. Ajouter quatre colonnes pour le savoir est un choix de
 * schéma que ni #4348 ni #4335 ne tranchent, et qui engage une décision de
 * gouvernance (garder un historique versionné) hors du périmètre de ce lot.
 * `CONSENT_POLICY_VERSION` est donc une valeur UNIQUE, globale, qui nomme la
 * politique EN VIGUEUR : `GET` la sert identique sur les quatre `purpose`
 * (elle ne prétend pas savoir sous quelle version tel consentement a été
 * donné — seulement quelle version est en vigueur AUJOURD'HUI), et `PUT`
 * EXIGE qu'elle soit citée en retour et REFUSE (409) toute valeur différente
 * — un client qui accepterait une politique déjà périmée ne consentirait pas
 * à celle qui compte. C'est le sens que `policyVersion` peut porter SANS
 * schéma nouveau ; un historique par consentement reste un suivi ouvert, pas
 * une omission silencieuse.
 *
 * ## `revokedAt` — toujours `null`, jamais fabriqué
 *
 * Aucune colonne ne conserve la date d'un retrait : `*ConsentAt` repasse à
 * `null` sur revocation, et la date du retrait lui-même n'est nulle part.
 * `revokedAt` est donc rendu (clé présente uniquement quand `granted` est
 * `false`, jamais aux côtés de `grantedAt`) mais vaut toujours `null` — c'est
 * une réponse honnête (« nous ne savons pas quand »), jamais une date
 * inventée. Fabriquer une date ici referait exactement l'erreur que #4180 a
 * fermée : une affirmation datée que le serveur ne peut pas prouver.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CONSENT_PURPOSES,
  CONSENT_POLICY_VERSION_DEFAULT,
  isConsentPurpose,
  type ConsentPurpose,
} from '@meeshy/shared/types/consents';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { zodIssueSchema, issuesServies } from '../../utils/zod-issue-schema';
import { ConsentValidationService } from '../../services/ConsentValidationService';
import { logError } from '../../utils/logger';
import {
  sendSuccess,
  sendUnauthorized,
  sendNotFound,
  sendBadRequest,
  sendError,
  sendInternalError,
} from '../../utils/response.js';

/**
 * Les QUATRE `purpose`, dans l'ORDRE de la hiérarchie de dépendance
 * (racine → feuille) — c'est cet ORDRE, pas une table séparée, qui porte la
 * chaîne : les ancêtres d'un `purpose` sont tout ce qui le précède dans ce
 * tableau.
 */
export { CONSENT_PURPOSES, type ConsentPurpose } from '@meeshy/shared/types/consents';

type ConsentColumn =
  | 'dataProcessingConsentAt'
  | 'voiceDataConsentAt'
  | 'voiceProfileConsentAt'
  | 'voiceCloningEnabledAt';

const PURPOSE_COLUMN: Readonly<Record<ConsentPurpose, ConsentColumn>> = {
  'data-processing': 'dataProcessingConsentAt',
  'voice-data': 'voiceDataConsentAt',
  'voice-profile': 'voiceProfileConsentAt',
  'voice-cloning': 'voiceCloningEnabledAt',
};

type ConsentColumns = Record<ConsentColumn, Date | null>;

const CONSENT_SELECT: Readonly<Record<ConsentColumn, true>> = {
  dataProcessingConsentAt: true,
  voiceDataConsentAt: true,
  voiceProfileConsentAt: true,
  voiceCloningEnabledAt: true,
};

/**
 * La politique EN VIGUEUR — voir le doc-comment de module. Un override par
 * variable d'environnement permet de la faire évoluer sans redéploiement de
 * code ; la valeur par défaut date ce lot.
 */
export const CONSENT_POLICY_VERSION =
  process.env.CONSENT_POLICY_VERSION || CONSENT_POLICY_VERSION_DEFAULT;

/** Les ancêtres d'un `purpose`, racine d'abord — jamais lui-même. */
function ancestorsOf(purpose: ConsentPurpose): readonly ConsentPurpose[] {
  return CONSENT_PURPOSES.slice(0, CONSENT_PURPOSES.indexOf(purpose));
}

type ConsentEntry = {
  purpose: ConsentPurpose;
  granted: boolean;
  grantedAt?: string;
  revokedAt?: null;
  policyVersion: string;
  source: 'server';
};

/**
 * L'UNIQUE projection colonne → entrée servie — partagée par `GET` (les
 * quatre `purpose`) et par `PUT` (le `purpose` visé, dans sa réponse). Un
 * consentement accordé ne porte QUE `grantedAt` ; un consentement absent ou
 * retiré ne porte QUE `revokedAt` (toujours `null`, voir doc-comment de
 * module) — jamais les deux à la fois sur la même entrée.
 */
function buildConsentEntry(purpose: ConsentPurpose, grantedAt: Date | null): ConsentEntry {
  if (grantedAt) {
    return {
      purpose,
      granted: true,
      grantedAt: grantedAt.toISOString(),
      policyVersion: CONSENT_POLICY_VERSION,
      source: 'server',
    };
  }
  return {
    purpose,
    granted: false,
    revokedAt: null,
    policyVersion: CONSENT_POLICY_VERSION,
    source: 'server',
  };
}

/**
 * Débit par COMPTE, jamais par IP — même piège que #4334/#4347/#4359 :
 * `hook: 'preHandler'` place le seau APRÈS l'authentification, posée ICI en
 * `onRequest` (montage autonome, voir doc-comment de module). Deux seuils
 * distincts, comme le fixe le commentaire de fusion de #4348/#4335:
 * `read` (120/min, un écran de réglages relit souvent) et `write` (20 PAR
 * HEURE — un consentement ne se bascule pas en boucle, et c'est un geste
 * juridiquement significatif).
 *
 * ## `skipOnError: true` — le sens de l'échec, PESÉ puis écrit (#4687)
 *
 * Ces deux seaux héritaient du côté ouvert sans que personne l'ait décidé :
 * `registerGlobalRateLimiter` (`middleware/rate-limiter.ts`) enregistre le
 * plugin avec `skipOnError: true`, et `mergeParams` (`Object.assign`,
 * @fastify/rate-limit `index.js:190`) l'étale dans toute config muette — alors
 * que le DÉFAUT DU PLUGIN vaut `false` (`index.js:138`), ce qui fait lire
 * l'omission comme prudente à qui va vérifier dans la dépendance. La valeur ne
 * change pas ; ce qui change est qu'elle est désormais CHOISIE.
 *
 * Le choix se pèse entre deux extrêmes, pas entre « strict » et « laxiste ».
 * Une route qui déclare `config.rateLimit` perd le limiteur global — `onRoute`
 * (`index.js:174`) monte le sien À LA PLACE, jamais en plus. Fermé, une panne
 * du magasin de compteurs répond 500 à CHAQUE requête de `/me/consents`, pas
 * seulement à celles qui dépassent (`index.js:301`) ; ouvert, ces deux routes
 * n'ont plus aucun plafond pendant la panne.
 *
 * Trois mesures ont décidé, et la première contredit l'intuition :
 *
 * 1. **Il n'y a PAS de journal de consentement à protéger.** Un consentement
 *    vit dans UNE colonne `User.*ConsentAt` (`PURPOSE_COLUMN`), écrasée à
 *    chaque `PUT` ; `schema.prisma` ne porte aucune table d'historique, et le
 *    doc-comment de module dit que la versionner reste hors périmètre. Une
 *    rafale ne peut donc pas polluer la preuve d'un choix : elle réécrit un
 *    horodatage que seule la DERNIÈRE valeur porte.
 * 2. **Rien ne part vers un tiers, et rien n'est créé.** Le `PUT` fait deux
 *    requêtes Prisma sur la ligne de L'APPELANT, sans e-mail, sans push, sans
 *    diffusion, sans ligne nouvelle. L'abus que le côté fermé préviendrait est
 *    auto-adressé et ne survit pas à la panne.
 * 3. **Ce `PUT` est le coupe-circuit de l'utilisateur.** `granted: false` met
 *    la colonne à `null`, et `ConsentValidationService` lit exactement ces
 *    colonnes pour autoriser (ou refuser) le traitement audio et le clonage
 *    vocal. Répondre 500 à un RETRAIT pendant une panne Redis laisse tourner
 *    le traitement sous un consentement que la personne est en train
 *    d'enlever, sans trace de sa tentative.
 *
 * C'est la forme que le dépôt nomme déjà `'ouvert'` : on n'enferme pas
 * quelqu'un dans un appel qu'il ne peut plus quitter (`ROUTE_RATE_LIMITS`,
 * `middleware/rate-limit.ts`), on ne laisse pas un intrus connecté
 * (`routes/auth/revoke-all-sessions.ts`). Le `read` suit le `write` : lui
 * répondre 500 couperait l'écran qui AFFICHE les consentements au moment
 * précis où l'on cherche à en retirer un.
 *
 * **Ce choix se repèse le jour où un HISTORIQUE de consentement est ajouté au
 * schéma** — une table qui accumule une ligne par bascule ferait de la mesure
 * 1 son contraire, et le côté fermé redeviendrait le bon.
 */
function consentRateLimitConfig(usage: 'read' | 'write') {
  const max = usage === 'read' ? 120 : 20;
  const timeWindow = usage === 'read' ? '1 minute' : '1 hour';
  return {
    max,
    timeWindow,
    hook: 'preHandler' as const,
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) => {
      const userId = request.auth?.userId;
      return userId ? `consents:${usage}:${userId}` : `consents:${usage}:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de requêtes (consents/${usage}). Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}

const consentEntrySchema = {
  type: 'object',
  properties: {
    purpose: { type: 'string', enum: [...CONSENT_PURPOSES] },
    granted: { type: 'boolean' },
    grantedAt: { type: 'string', format: 'date-time' },
    revokedAt: { type: 'string', format: 'date-time', nullable: true },
    policyVersion: { type: 'string' },
    source: { type: 'string', example: 'server' },
  },
} as const;

const derivedSchema = {
  type: 'object',
  properties: {
    canTranscribeAudio: { type: 'boolean' },
    canTranslateAudio: { type: 'boolean' },
    canUseVoiceCloning: { type: 'boolean' },
  },
} as const;

/**
 * ## Pourquoi un refus doit DÉCLARER ce qu'il ajoute (#4487)
 *
 * `sendError` étale `details` à la RACINE de l'enveloppe, et
 * fast-json-stringify RETIRE en silence toute propriété que le schéma de
 * réponse ne déclare pas. Un champ d'appoint non déclaré est donc calculé,
 * passé, sérialisé — puis jeté au dernier mètre : le serveur savait quel
 * champ manquait et n'avait aucun moyen de le dire. C'est ce silence qui a
 * fait conclure à tort à une route cassée pendant la vérification de #4348.
 *
 * L'enveloppe reste à site UNIQUE (`errorResponseSchema`) : on l'ÉTEND, on ne
 * la recopie pas — recopier l'aurait figée au jour de ce lot. Et la forme
 * déclarée est celle que Zod émet RÉELLEMENT, jamais une projection maison :
 * une seconde forme divergerait de la première au premier changement de
 * version de Zod, et `path` seul ne dit pas tout (une clé refusée par
 * `.strict()` vit dans `keys`, `path` restant vide).
 */

const badRequestResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    issues: {
      type: 'array',
      items: zodIssueSchema,
      description: 'Une entrée par champ refusé par le schéma du corps',
    },
    allowedPurposes: {
      type: 'array',
      items: { type: 'string', enum: [...CONSENT_PURPOSES] },
      description: "Les purpose acceptés, quand celui de l'URL est inconnu",
    },
  },
} as const;

const policyConflictResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    expectedPolicyVersion: {
      type: 'string',
      description:
        'La version EN VIGUEUR, lisible par une machine : un client dont la ' +
        'constante a dérivé se recale sans relire GET /me/consents.',
    },
  },
} as const;

/**
 * `PUT` n'accepte QUE `{ granted, policyVersion }` — `.strict()` rejette
 * toute clé de plus, en particulier `grantedAt`/`revokedAt` : le serveur
 * pose la date, JAMAIS le client (#4180, répété par le critère 2 de #4335).
 */
const PutConsentBodySchema = z
  .object({
    granted: z.boolean(),
    policyVersion: z.string().min(1),
  })
  .strict();

export async function meConsentsRoutes(fastify: FastifyInstance) {
  const consentService = new ConsentValidationService(fastify.prisma);

  // ═══════════════════════════════════════════════════════════════════════
  // GET /me/consents
  // ═══════════════════════════════════════════════════════════════════════
  fastify.get(
    '/consents',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: consentRateLimitConfig('read') },
      schema: {
        description:
          'Lire les quatre consentements horodatés côté serveur (data-processing, ' +
          'voice-data, voice-profile, voice-cloning), plus le bloc dérivé calculé ' +
          'par ConsentValidationService.',
        tags: ['me', 'consents'],
        summary: 'Get consents',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  consents: { type: 'array', items: consentEntrySchema },
                  derived: derivedSchema,
                },
              },
            },
          },
          401: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      try {
        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: CONSENT_SELECT,
        });

        if (!user) {
          return sendNotFound(reply, 'USER_NOT_FOUND');
        }

        const consents = CONSENT_PURPOSES.map((purpose) =>
          buildConsentEntry(purpose, (user as ConsentColumns)[PURPOSE_COLUMN[purpose]])
        );

        // Le bloc dérivé vient de `ConsentValidationService` — jamais
        // recalculé sur place (critère de #4335/#4348 repris tel quel).
        const status = await consentService.getConsentStatus(userId);

        return sendSuccess(reply, {
          consents,
          derived: {
            canTranscribeAudio: status.canTranscribeAudio,
            canTranslateAudio: status.canTranslateAudio,
            canUseVoiceCloning: status.canUseVoiceCloning,
          },
        });
      } catch (error) {
        logError('Error fetching consents', error, { source: 'me-consents-routes' });
        return sendInternalError(reply, 'FETCH_ERROR', { message: 'Failed to fetch consents' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
  // PUT /me/consents/:purpose
  // ═══════════════════════════════════════════════════════════════════════
  fastify.put<{ Params: { purpose: string } }>(
    '/consents/:purpose',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: consentRateLimitConfig('write') },
      schema: {
        description:
          'Accorder ou retirer UN consentement. Le serveur pose `new Date()` ou ' +
          '`null` — aucune date reçue du client. `policyVersion` doit citer la ' +
          'politique en vigueur, sinon 409.',
        tags: ['me', 'consents'],
        summary: 'Update one consent',
        params: {
          type: 'object',
          properties: { purpose: { type: 'string' } },
          required: ['purpose'],
        },
        body: { type: 'object' },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: consentEntrySchema,
            },
          },
          400: badRequestResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: policyConflictResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest<{ Params: { purpose: string } }>, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const { purpose } = request.params;
      if (!isConsentPurpose(purpose)) {
        return sendBadRequest(reply, 'UNKNOWN_CONSENT_PURPOSE', {
          message: `purpose doit être l'un de : ${CONSENT_PURPOSES.join(', ')}`,
          details: { allowedPurposes: [...CONSENT_PURPOSES] },
        });
      }

      let body: z.infer<typeof PutConsentBodySchema>;
      try {
        body = PutConsentBodySchema.parse(request.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          // #4487 — `issues`, étalé à la racine par `details`, et déclaré
          // par `badRequestResponseSchema`, monté sur le 400 de cette route.
          //
          // `details` est étalé à la RACINE de l'enveloppe, et
          // `fast-json-stringify` retire toute propriété que le schéma de
          // réponse ne déclare PAS. Le serveur savait exactement quel champ
          // manquait, le sérialisait, et le jetait — l'appelant recevait
          // `{"error":"VALIDATION_ERROR","message":"VALIDATION_ERROR"}`, sans
          // rien. Ce n'est pas théorique : c'est ce qui m'a fait conclure à
          // tort à une route cassée en vérifiant #4348 sur staging, alors
          // qu'il manquait seulement `policyVersion` au corps.
          //
          // La correction a donc DEUX moitiés, et une seule ne sert à rien :
          // le schéma déclare `issues` (avec `zodIssueSchema`), et le
          // handler sert `issues`. Ce site a servi `violations` pendant un
          // temps — la clé générique de l'enveloppe — pendant que le schéma
          // déclarait déjà la forme riche : le corps servi ne portait alors
          // ni l'un ni l'autre au complet, et les trois témoins du fichier
          // `consents-refus-motive.test.ts` étaient rouges.
          //
          // La forme est celle de Zod, RÉELLE et non supposée : `path` est
          // un TABLEAU (le témoin le compare à `['policyVersion']`), et une
          // clé refusée par `strict` laisse `path` vide en nommant la clé
          // dans `keys` — deux faits mesurés, pas déduits.
          return sendBadRequest(reply, 'VALIDATION_ERROR', {
            details: { issues: issuesServies(error.issues) },
          });
        }
        throw error;
      }

      if (body.policyVersion !== CONSENT_POLICY_VERSION) {
        return sendError(reply, 409, 'CONSENT_POLICY_VERSION_MISMATCH', {
          message:
            `La politique de confidentialité a changé (version en vigueur : ` +
            `${CONSENT_POLICY_VERSION}) — relire GET /me/consents avant de renvoyer ce PUT.`,
          details: { expectedPolicyVersion: CONSENT_POLICY_VERSION },
        });
      }

      try {
        const existing = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: CONSENT_SELECT,
        });

        if (!existing) {
          return sendNotFound(reply, 'USER_NOT_FOUND');
        }

        const existingColumns = existing as ConsentColumns;
        const targetColumn = PURPOSE_COLUMN[purpose];
        const updateData: Partial<ConsentColumns> = {};

        if (body.granted) {
          const now = new Date();
          // La cible reçoit TOUJOURS `now()` — un octroi explicite est un
          // évènement neuf, même si la colonne portait déjà une date.
          updateData[targetColumn] = now;
          // Les ANCÊTRES ne sont posés que s'ils manquent — reproduit la
          // cascade de `VoiceProfileService.updateConsent` (voir doc-comment
          // de module) sans jamais écraser un octroi antérieur.
          for (const ancestor of ancestorsOf(purpose)) {
            const ancestorColumn = PURPOSE_COLUMN[ancestor];
            if (!existingColumns[ancestorColumn]) {
              updateData[ancestorColumn] = now;
            }
          }
        } else {
          // Un retrait ne touche QUE sa propre colonne — jamais ses
          // ancêtres ni ses dépendants (même choix que
          // `VoiceProfileService.updateConsent`).
          updateData[targetColumn] = null;
        }

        const updated = await fastify.prisma.user.update({
          where: { id: userId },
          data: updateData,
          select: CONSENT_SELECT,
        });

        const entry = buildConsentEntry(purpose, (updated as ConsentColumns)[targetColumn]);
        return sendSuccess(reply, entry);
      } catch (error) {
        logError('Error updating consent', error, { source: 'me-consents-routes' });
        return sendInternalError(reply, 'UPDATE_ERROR', { message: 'Failed to update consent' });
      }
    }
  );
}
