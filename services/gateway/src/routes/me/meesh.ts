/**
 * `POST /me/meesh/mint` — la FRAPPE d'une Meesh (#5743).
 *
 * Le seul point d'écriture du registre est `MeeshService` ; cette route ne fait
 * que l'appeler pour l'utilisateur AUTHENTIFIÉ. Elle ne prend jamais d'`userId`
 * en corps : frapper pour le compte d'autrui n'a aucun sens et serait la
 * première faille d'une monnaie.
 *
 * `requestId` porte l'IDEMPOTENCE. Une seconde requête portant le même
 * identifiant rend `already-minted` avec le solde courant — un SUCCÈS, pas une
 * erreur : du point de vue de l'appelant la frappe a bien eu lieu, ce qui est
 * vrai. Renvoyer une erreur pousserait le client à réessayer, donc à frapper
 * deux fois le jour où l'index unique céderait.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendSuccess, sendUnauthorized, sendError, sendInternalError } from '../../utils/response.js';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { logError } from '../../utils/logger';
import { MeeshService, receiptOnTheWire } from '../../services/meesh/MeeshService';

/**
 * Débit par COMPTE, strict — la frappe ÉCRIT, et elle est irréversible. Un
 * plafond bas est ici une protection, pas une gêne : personne ne frappe
 * légitimement plus de quelques Meeshes par minute (il en coûte des centaines d'étincelles).
 */
function mintRateLimitConfig() {
  return {
    max: 10,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    // `false` — FAIL-CLOSED, à l'inverse de la route de lecture voisine.
    //
    // Une panne du magasin de débit ferme ici la frappe, et c'est voulu : une
    // MONNAIE ne se frappe pas pendant que sa garde est aveugle. Le coût du
    // refus est nul (les points restent, l'utilisateur réessaie dans une
    // minute) ; le coût de l'inverse serait une fenêtre d'abus sur une écriture
    // irréversible. `skipOnError: true` se justifie pour un écran de
    // consultation, jamais pour une écriture qui crée de la valeur.
    skipOnError: false,
    keyGenerator: (request: FastifyRequest) => {
      const userId = request.auth?.userId;
      return userId ? `me:meesh:mint:${userId}` : `me:meesh:mint:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Trop de frappes demandées. Veuillez patienter.',
      statusCode: 429,
    }),
  };
}

const mintBodySchema = {
  type: 'object',
  required: ['requestId'],
  properties: {
    // Borné : un identifiant d'idempotence est un UUID, pas un champ libre.
    requestId: { type: 'string', minLength: 8, maxLength: 64 },
    // Une Meesh ne se paie QU'EN POINTS (porteur, 2026-10-10, #10011) : tout autre moyen est refusé en 400, AVANT
    // toute écriture — jamais ignoré en silence (une frappe en points que le client n'a pas demandée).
    payWith: { type: 'string', enum: ['points'] },
    // La garde de prix (#10903) : le prix que l'écran a montré. Au-delà, 409 PRICE_CHANGED avec le prix courant, sans
    // débit. Absente, la frappe se comporte comme avant (rétrocompatible).
    maxPrice: { type: 'integer', minimum: 1 },
  },
  additionalProperties: false,
} as const;

const mintResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['minted', 'already-minted', 'insufficient'] },
        balance: { type: 'number' },
        mintedLifetime: { type: 'number' },
        missingPoints: { type: 'number' },
        // Le REÇU de la pièce (#9374) — ajouté à côté de l'ancienne forme : un
        // ancien client ne lit que les trois premiers champs.
        number: { type: 'number' },
        edition: { type: 'string', enum: ['silver', 'gold', 'prism'] },
        price: { type: 'number' },
        gloryGained: { type: 'number' },
        // Ancienne loi : bornés à 100 pour les clients publiés ; les niveaux ouverts par le rang dans `ladder` (#9688).
        levelBefore: { type: 'number' },
        levelAfter: { type: 'number' },
        // Le prix de rang et le facteur du niveau actuel (#10847) — ajoutés à côté du prix effectif (`price`).
        basePrice: { type: 'number' },
        costFactor: { type: 'number' },
        ladder: {
          type: 'object',
          properties: { levelBefore: { type: 'number' }, levelAfter: { type: 'number' } },
        },
        // Le marqueur d'ordre de l'état après la frappe (#10900) : un état servi avant lui (une lecture partie avant la
        // frappe) est plus ancien, et le client l'ignore.
        gameRevision: { type: 'number' },
      },
    },
  },
} as const;

export async function meMeeshRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/meesh/mint',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: mintRateLimitConfig() },
      schema: {
        description:
          'Frappe une Meesh au prix de sa rareté (1221 pour les dix premières, #5743, #9374) × le facteur du niveau ' +
          'ACTUEL (#10847). Action MANUELLE et idempotente par `requestId`. Elle dépense la poche d\'étincelles ' +
          'et fait baisser le niveau du montant dépensé (#10892), jamais un badge (#10845). 409 TREASURY_LOCKED si le rang n\'ouvre pas ' +
          'la réserve où la pièce entrerait (#10848). `maxPrice` optionnel (#10903) : le prix que l\'écran a montré ; ' +
          'si le prix rejugé dans la transaction le dépasse, 409 PRICE_CHANGED avec le prix courant (`number`, `price`, ' +
          '`basePrice`, `costFactor` à la racine), sans rien débiter. La réponse porte `gameRevision` (#10900).',
        tags: ['me', 'meesh'],
        summary: 'Mint a Meesh',
        body: mintBodySchema,
        response: {
          200: mintResponseSchema,
          401: errorResponseSchema,
          // Le manque est servi (`details` s'étale à la racine) : déclaré EN
          // PLUS du superset, sans quoi le sérialiseur le supprimait et l'écran
          // devait relire toute la progression pour le dire.
          409: {
            ...errorResponseSchema,
            properties: {
              ...errorResponseSchema.properties,
              missingPoints: { type: 'number' },
              // Le refus de RANG (#10848) : la réserve fermée et le rang qu'elle exige, à la racine, à côté de `code`.
              sparksDebt: { type: 'number' },
              // Le refus de GARDE DE PRIX (#10903) : le prix courant de la prochaine pièce.
              number: { type: 'number' },
              price: { type: 'number' },
              basePrice: { type: 'number' },
              costFactor: { type: 'number' },
              tier: { type: 'string' },
              minHeld: { type: 'number' },
              requires: {
                type: 'object',
                properties: { rank: { type: 'string' }, division: { type: 'number' }, division5: { type: 'number' } },
              },
            },
          },
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest<{ Body: { requestId: string; maxPrice?: number } }>, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) {
        // Le sens est NOMMÉ plutôt qu'hérité du défaut : `undefined` disparaît
        // à la sérialisation, et deux 401 ne se distinguaient alors que par le
        // filage d'une prose française (#4857). Ici le sens est bien
        // « non authentifié » — le dire ne change pas la réponse, il la rend
        // lisible par un client.
        return sendUnauthorized(reply, 'Authentication required', {
          code: AUTH_ERROR_CODES.UNAUTHORIZED,
        });
      }

      try {
        const { requestId, maxPrice } = request.body;
        const outcome = await new MeeshService(fastify.prisma).mint(userId, requestId, maxPrice === undefined ? {} : { maxPrice });

        if (outcome.status === 'blocked-by-debt') {
          // 409 TYPÉ (porteur, 2026-10-16) : une reprise de contenu supprimé n'a pas pu être prélevée sur une poche déjà
          // dépensée ; la dette se déduit des prochaines étincelles et bloque la frappe jusqu'à son remboursement.
          return sendError(reply, 409, 'MINT_BLOCKED_BY_DEBT', { code: 'MINT_BLOCKED_BY_DEBT', details: { sparksDebt: outcome.sparksDebt } });
        }

        if (outcome.status === 'treasury-locked') {
          // 409 TYPÉ (#10848) : la pièce ferait entrer dans une réserve que le rang de Gloire n'ouvre pas encore. Le rang
          // exigé est servi pour que l'écran le dise sans relire toute la progression.
          return sendError(reply, 409, 'TREASURY_LOCKED', {
            code: 'TREASURY_LOCKED',
            details: { tier: outcome.lock.tier, minHeld: outcome.lock.minHeld, requires: outcome.lock.requires },
          });
        }

        if (outcome.status === 'price-changed') {
          // 409 TYPÉ (#10903) : le prix a bougé depuis ce que l'écran a montré. Le prix COURANT est servi pour que l'écran
          // le montre et redemande la confirmation — jamais un débit que l'utilisateur n'a pas vu.
          return sendError(reply, 409, 'PRICE_CHANGED', {
            code: 'PRICE_CHANGED',
            details: { number: outcome.number, price: outcome.price, basePrice: outcome.basePrice, costFactor: outcome.costFactor },
          });
        }

        if (outcome.status === 'insufficient') {
          // 409 et non 400 : la requête est bien formée, c'est l'ÉTAT du compte
          // qui ne permet pas encore la frappe. Le manque est servi pour que
          // l'écran puisse le dire sans relire toute la progression.
          return sendError(reply, 409, 'INSUFFICIENT_POINTS', {
            code: 'INSUFFICIENT_POINTS',
            details: { missingPoints: outcome.plan.missingPoints },
          });
        }

        return sendSuccess(reply, {
          status: outcome.status,
          balance: outcome.balance,
          mintedLifetime: outcome.mintedLifetime,
          ...(outcome.receipt === null ? {} : receiptOnTheWire(outcome.receipt)),
          // La révision GRAVÉE par la frappe (#10912), jamais l'heure de la réponse : toute lecture partie avant elle porte
          // une révision plus petite, quelle que soit l'horloge de la passerelle qui la sert.
          gameRevision: outcome.gameRevision,
        });
      } catch (error) {
        logError(fastify.log, 'Error minting a Meesh', error);
        return sendInternalError(reply, 'Failed to mint');
      }
    }
  );
}
