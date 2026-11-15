import { trackingLinkSchema } from '@meeshy/shared/types/api-schemas';

/**
 * Schémas de réponse FERMÉS de `tracking-links` (#4168).
 *
 * Extraits de `tracking.ts` pour deux raisons : (1) `creation.ts` et
 * `affiliate.ts` frôlent déjà le plafond de 800-1100 lignes du dépôt, et
 * `tracking.ts` suit la même discipline avant d'y toucher plutôt qu'après ;
 * (2) un schéma de réponse se relit mieux seul que noyé dans la logique de
 * route.
 *
 * ## Le défaut fermé ici
 *
 * `trackingLinkClick` (schema.prisma) porte 33 colonnes hors clés techniques,
 * dont `ipAddress`, `userAgent`, `deviceFingerprint`, `referrer` et onze
 * champs de fingerprinting navigateur (résolution d'écran, fuseau, cœurs CPU,
 * RAM, etc.) — la combinaison de ces colonnes NON-PII prises isolément forme,
 * ensemble, une empreinte de visiteur. Les deux routes qui servent des lignes
 * de clic (`GET /tracking-links/:token/clicks` côté propriétaire du lien,
 * `GET /tracking-links/admin/:token/clicks` côté administration) déclaraient
 * `additionalProperties: true` sur chaque item — fast-json-stringify ne
 * filtrait donc RIEN, et la ligne Prisma brute partait entière sur le fil : un
 * utilisateur ordinaire, propriétaire d'un lien qu'il a partagé dans une
 * conversation, pouvait lire l'IP de quiconque avait cliqué dessus.
 *
 * ### Décision produit — `ipAddress` ne sort sur AUCUNE des deux routes, à AUCUN niveau
 *
 * `GET /tracking-links/:token/clicks` est **S3** (propriétaire du lien —
 * `createdBy: userId` vérifié dans la requête même) ; sa jumelle
 * `GET /tracking-links/admin/:token/clicks` est **S5** (administration —
 * `requireAnalyticsPermission`, permission nommée `canViewAnalytics` de la
 * matrice centrale). Le README (§4) pose par défaut que la donnée
 * personnelle d'un TIERS — ici le visiteur qui clique, jamais l'appelant,
 * qu'il soit S3 ou S5 — ne se sert pas ; l'ADMINISTRATION n'est pas en
 * elle-même une raison d'en servir plus, seul un consommateur MESURÉ l'est.
 * `ipAddress` n'est donc déclarée à AUCUN des deux niveaux — pas même S5 —
 * faute d'un tel consommateur. La mesure confirme qu'aucun n'en a besoin :
 *
 * - **iOS SDK** (`TrackingLinkModels.swift:24`) et **Android**
 *   (`core/model/.../TrackingLink.kt`) déclarent tous deux la MÊME forme
 *   minimale de `TrackingLinkClick` — `id, country, city, device, browser,
 *   os, referrer, socialSource, redirectStatus, clickedAt` — sans `ipAddress`
 *   ni aucun champ de fingerprinting. Les deux plateformes convergent déjà
 *   vers exactement l'ensemble fermé ci-dessous.
 * - **Web admin** (`apps/web/app/admin/tracking-links/page.tsx`) ne RENDS
 *   dans son tableau que `clickedAt, country, city, device, browser, os,
 *   referrer, socialSource, redirectStatus` — un sous-ensemble strict. Son
 *   interface TS `TrackingClick` déclare bien `ipAddress?` en plus, mais
 *   AUCUN JSX ne le lit (`grep '\.ipAddress\b'` sur le fichier : zéro match) —
 *   un champ de type mort, pas un lecteur.
 * - **Web (hors admin), iOS app, Android app** : aucun appelant de
 *   `GET /tracking-links/:token/clicks` (le seul, `apps/web/services/
 *   tracking-links.ts`, ne couvre que `/stats`) hormis le SDK iOS
 *   (`TrackingLinkService.fetchClicks`), qui décode dans la MÊME struct
 *   minimale que ci-dessus.
 * - Recherche `grep -rn '\.ipAddress\b'` sur `apps/web apps/ios
 *   packages/MeeshySDK apps/android` (hors tests) : les seuls résultats
 *   portent sur `AdminAuditLog.ipAddress` (journal d'audit, domaine distinct,
 *   déjà S5) et `Session.ipAddress` (l'IP de sa PROPRE session, `ActiveSessions*`,
 *   S3 sur soi-même) — zéro résultat sur `TrackingLinkClick`.
 *
 * Alternative envisagée et écartée : servir une IP tronquée (`/24`) ou hachée
 * à l'administration (S5) pour l'anti-fraude. Écartée parce qu'aucun outil ne
 * la consomme aujourd'hui — l'ajouter serait remettre une PII sur le fil sans
 * lecteur, exactement le défaut inverse que ce lot corrige. Si un besoin
 * anti-fraude nommé apparaît, il ouvre sa PROPRE issue avec sa propre
 * décision motivée (traçable dans l'historique de #4168), plutôt que
 * d'hériter d'un ajout fait par défaut ici.
 *
 * `trackingLinkClickResponseSchema` sert donc IDENTIQUE aux deux routes : la
 * jumelle admin ne reçoit pas plus que le propriétaire, faute d'un lecteur
 * qui justifierait l'écart (S5 n'est pas une raison en soi de servir plus —
 * seul un consommateur mesuré l'est).
 *
 * ## Le second défaut trouvé au même endroit
 *
 * `GET /tracking-links/admin/all` et `GET /tracking-links/admin/:token/clicks`
 * déclaraient leurs clés de succès (`trackingLinks`/`clicks`, `total`) à la
 * RACINE du schéma `200`, alors que `sendSuccess`/`sendPaginatedSuccess`
 * (utils/response.ts) les émettent sous `data`. `fast-json-stringify` ne
 * retenant que les clés DÉCLARÉES, `data` — non déclarée — partait en bloc :
 * les deux routes ne servaient jamais que `{"success":true}`. Le balayage
 * `routes/__tests__/response-payload-mismatch.ts` (issue #4192) avait déjà
 * mesuré et gelé ce défaut sur ces deux mêmes lignes ; fermer l'enveloppe ici
 * est la correction que sa documentation appelait explicitement (« déclarés à
 * l'intégrateur, qui décide : correction immédiate »). Sans cette correction,
 * fermer seulement les items de `clicks` n'aurait rien changé de VISIBLE — la
 * charge entière restait engloutie par l'enveloppe manquante — et l'aurait
 * laissée « corrigée en apparence, mais inerte », le piège exact que ce même
 * balayage documente ailleurs pour `messages.ts|sender|200`.
 *
 * `apps/web/app/admin/tracking-links/page.tsx` lit déjà `response.data.trackingLinks`
 * et `response.data.clicks` — le client attendait la BONNE enveloppe depuis le
 * début ; c'est le serveur qui ne la servait pas. Aucune migration client
 * requise, la page admin passe de « toujours vide » à « fonctionnelle ».
 *
 * `creator` (nom, pseudo, avatar du propriétaire du lien) reste déclaré sur
 * `admin/all` : lu par `link.creator?.displayName` dans la même page, et ce
 * n'est pas une PII de tiers vis-à-vis de l'appelant admin — c'est l'identité
 * (déjà publique) du créateur du lien, nécessaire pour l'attribuer dans la
 * liste d'administration.
 */

/** Une ligne de clic, dépouillée de tout ce qui identifie le visiteur. */
export const trackingLinkClickResponseSchema = {
  type: 'object',
  description: 'Click event on a tracking link — visitor-identifying fields (IP, user agent, device fingerprint, raw browser telemetry) are never served, see file header.',
  properties: {
    id: { type: 'string', description: 'Click ID' },
    country: { type: 'string', nullable: true, description: 'Visitor country' },
    city: { type: 'string', nullable: true, description: 'Visitor city' },
    device: { type: 'string', nullable: true, description: 'Device type (mobile/desktop/tablet)' },
    browser: { type: 'string', nullable: true, description: 'Browser name' },
    os: { type: 'string', nullable: true, description: 'Operating system' },
    referrer: { type: 'string', nullable: true, description: 'Referrer URL' },
    socialSource: { type: 'string', nullable: true, description: 'Detected social source (WhatsApp, Telegram, etc.)' },
    redirectStatus: { type: 'string', nullable: true, description: 'pending | confirmed | failed' },
    clickedAt: { type: 'string', format: 'date-time', description: 'Click timestamp' }
  }
} as const;

/** `200` de `GET /tracking-links/:token/stats` — agrégats seuls, aucune ligne brute. */
export const trackingLinkStatsResponseSchema = {
  description: 'Statistics retrieved successfully',
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        trackingLink: trackingLinkSchema,
        totalClicks: { type: 'number', description: 'Total number of clicks' },
        uniqueClicks: { type: 'number', description: 'Number of unique visitors' },
        clicksByCountry: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Click counts keyed by country name'
        },
        clicksByDevice: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Click counts keyed by device type'
        },
        clicksByBrowser: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Click counts keyed by browser name'
        },
        clicksByOS: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Click counts keyed by OS name'
        },
        clicksByLanguage: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Click counts keyed by language code'
        },
        clicksByHour: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Click counts keyed by hour (00-23)'
        },
        clicksBySocialSource: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Click counts keyed by social source (WhatsApp, Telegram, etc.)'
        },
        clicksByDate: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Click counts keyed by ISO date string'
        },
        topReferrers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              referrer: { type: 'string' },
              count: { type: 'number' }
            }
          },
          description: 'Top referrer sources sorted by count'
        },
        confirmedClicks: { type: 'number', description: 'Number of clicks with confirmed redirect' }
      }
    }
  }
} as const;

/** `200` de `GET /tracking-links/:token/clicks` (propriétaire du lien). */
export const trackingLinkUserClicksResponseSchema = {
  description: 'Click details retrieved successfully',
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        link: trackingLinkSchema,
        clicks: { type: 'array', items: trackingLinkClickResponseSchema },
        total: { type: 'number' }
      }
    },
    pagination: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' }
      }
    }
  }
} as const;

/** `TrackingLink` + son créateur minimal — forme réelle de `getAllTrackingLinks` (`include: { creator: {...} }`). */
const trackingLinkWithCreatorSchema = {
  type: 'object',
  properties: {
    ...trackingLinkSchema.properties,
    creator: {
      type: 'object',
      nullable: true,
      description: 'Link creator (null for anonymous links)',
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true }
      }
    }
  }
} as const;

/**
 * `200` de `GET /tracking-links/admin/all` — enveloppe corrigée (`data`, pas
 * la racine, voir le header) ET items fermés.
 */
export const trackingLinkAdminAllResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        trackingLinks: { type: 'array', items: trackingLinkWithCreatorSchema },
        total: { type: 'number' }
      }
    }
  }
} as const;

/**
 * `200` de `GET /tracking-links/admin/:token/clicks` — même correction
 * d'enveloppe, mêmes items fermés que la route propriétaire (aucun lecteur ne
 * justifie d'en servir plus à l'administration, voir le header).
 */
export const trackingLinkAdminClicksResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        clicks: { type: 'array', items: trackingLinkClickResponseSchema },
        total: { type: 'number' }
      }
    }
  }
} as const;
