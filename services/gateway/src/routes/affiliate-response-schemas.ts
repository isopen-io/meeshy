/**
 * Schéma de réponse FERMÉ de `GET /affiliate/stats` (#4168).
 *
 * Extrait de `affiliate.ts` (914 lignes avant ce lot, à 186 lignes du plafond
 * de 1100) pour ne pas ajouter à un fichier déjà proche du budget — la règle
 * du dépôt est d'extraire D'ABORD.
 *
 * ## Pourquoi la route était ouverte, et pourquoi PAS `properties`-sans-plus
 *
 * Le commentaire original (conservé dans l'historique) explique le premier
 * incident : un `type: 'object'` sans AUCUNE des trois clés qui bornent un
 * schéma (`properties` / `additionalProperties` / `patternProperties`) faisait
 * sérialiser `data: {}` — compteurs, filleuls et jetons effacés en silence.
 * `additionalProperties: true` a réparé la troncature en ROUVRANT la porte en
 * grand plutôt qu'en énumérant les champs — l'AUTRE défaut que #4168 corrige :
 * « tout ce que le service ajoutera partira sur le fil sans revue ».
 *
 * ## Ce que le producteur envoie RÉELLEMENT
 *
 * Lu dans `AffiliateTrackingService.getAffiliateStats` (services/gateway/src/
 * services/AffiliateTrackingService.ts:237-357) — jamais deviné depuis le
 * handler, qui ne fait que relayer `result.data` :
 *
 * ```
 * { totalReferrals, completedReferrals, pendingReferrals, expiredReferrals,
 *   referrals: [{ id, referredUser, status, createdAt, completedAt, affiliateToken }],
 *   tokens: [{ id, name, token, maxUses, currentUses, expiresAt, isActive, createdAt, _count }] }
 * ```
 *
 * `referredUser` provient d'un `select` qui charge `{ id, username, firstName,
 * lastName, email, avatar, createdAt }` — un sur-fetch AU NIVEAU BASE, hors
 * territoire de ce lot (`AffiliateTrackingService.ts` n'y est pas), mais qui
 * n'oblige à RIEN côté fil : le schéma de réponse est la frontière qui compte
 * ici, et lui seul est fermé.
 *
 * ## Décision produit — `email` et `referredUser.createdAt` ne sortent pas
 *
 * `referredUser` décrit un AUTRE utilisateur que l'appelant (l'affilié voit
 * les comptes qu'il a parrainés) : README §4 s'applique — donnée personnelle
 * d'un tiers, par défaut non servie. Mesure des lecteurs sur les quatre
 * plateformes :
 *
 * - **iOS SDK** (`AffiliateModels.swift`, `struct ReferredUser`) décode
 *   `id, username, firstName, lastName, avatar` — PAS `email`, PAS
 *   `createdAt`. `firstName`/`lastName` sont des lecteurs RÉELS :
 *   `AffiliateReferral.resolvedName` les compose pour l'affichage
 *   (repli sur `@username` si absents) — ils restent donc déclarés, à la
 *   différence de la convention `userMinimalSchema` (qui n'a que
 *   `displayName`) : ici c'est le PRODUCTEUR ET le consommateur qui comptent,
 *   pas une convention voisine.
 * - **Web** : aucun appelant de `/affiliate/stats` (`grep -rn
 *   'affiliate/stats\|getAffiliateStats' apps/web` : zéro résultat en
 *   dehors du CHANGELOG). Rien à casser, rien à préserver.
 * - **Android** : `Affiliate.kt` déclare un `AffiliateStats` (totalTokens,
 *   totalReferrals, totalVisits, conversionRate) SANS `referrals` ni
 *   `tokens`, et aucun appel à `/affiliate/stats` n'existe dans
 *   `apps/android` — ce type est mort côté réseau pour cette route. Le Json
 *   global (`SdkModule.kt:255`, `ignoreUnknownKeys = true`) est de toute
 *   façon tolérant aux champs en trop comme aux champs manquants.
 * - `grep -rn '\.email\b'` sur les quatre surfaces, restreint aux fichiers
 *   `Affiliate*`/`ReferredUser*` : zéro résultat.
 *
 * `avatar` reste déclaré (lu par la struct iOS, aucune sensibilité
 * particulière — c'est une URL déjà publique sur le profil de l'utilisateur).
 *
 * `tokens` et `affiliateToken` (sous-objet de chaque `referral`) restent
 * déclarés INTÉGRALEMENT tels que produits : ce sont les jetons/compteurs de
 * l'AFFILIÉ LUI-MÊME (l'appelant), aucune PII de tiers, et les retirer sans
 * lecteur mesuré serait le défaut INVERSE que #4168 met en garde contre
 * (`GET /translate/jobs/:jobId` perdant `result`) — une liste blanche
 * incomplète efface une donnée que le handler envoie légitimement.
 */

/** Un filleul de l'affilié appelant — jamais `email`, jamais la date de création du COMPTE du filleul. */
const referredUserResponseSchema = {
  type: 'object',
  description: 'Referred user — minimal identity only, see file header for the email/createdAt decision',
  properties: {
    id: { type: 'string' },
    username: { type: 'string' },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true }
  }
} as const;

/** `200` de `GET /affiliate/stats`. */
export const affiliateStatsResponseSchema = {
  description: 'Affiliate statistics retrieved successfully',
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      description: 'Affiliate statistics and metrics',
      properties: {
        totalReferrals: { type: 'number', description: 'Total number of referral relations' },
        completedReferrals: { type: 'number', description: 'Referrals that completed onboarding' },
        pendingReferrals: { type: 'number', description: 'Referrals still pending' },
        expiredReferrals: { type: 'number', description: 'Referrals whose window expired' },
        referrals: {
          type: 'array',
          description: 'Individual referral relations, most recent first',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'completed', 'expired'] },
              createdAt: { type: 'string', format: 'date-time' },
              completedAt: { type: 'string', format: 'date-time', nullable: true },
              referredUser: referredUserResponseSchema,
              affiliateToken: {
                type: 'object',
                description: 'The affiliate token that produced this referral',
                properties: {
                  name: { type: 'string' },
                  token: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        tokens: {
          type: 'array',
          description: "The caller's own affiliate tokens",
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              token: { type: 'string' },
              maxUses: { type: 'number', nullable: true },
              currentUses: { type: 'number' },
              expiresAt: { type: 'string', format: 'date-time', nullable: true },
              isActive: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
              _count: {
                type: 'object',
                properties: {
                  affiliations: { type: 'number', description: 'Total relations created from this token' }
                }
              }
            }
          }
        }
      }
    }
  }
} as const;
