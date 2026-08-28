import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { enhancedLogger } from '../utils/logger-enhanced';
import { validateBody } from '../validation/helpers.js';
import { sendSuccess, sendGone, sendInternalError } from '../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { disconnectRevokedSessions } from '../socketio/disconnectRevokedSessions';
import { createCustomRateLimiter } from '../utils/rate-limiter.js';

const logger = enhancedLogger.child({ module: 'AccountDeletionResolve' });

const GRACE_PERIOD_DAYS = 90;

/**
 * Au-delà, la demande est INVALIDÉE plutôt que laissée ouverte à la devinette.
 * Le jeton fait 32 octets — il n'est pas devinable —, mais une demande qui
 * encaisse des essais indéfiniment est une cible qu'on offre.
 */
export const MAX_RESOLVE_ATTEMPTS = 5;

export type DeletionAction = 'confirm' | 'cancel' | 'purge';

const ResolveBodySchema = z.object({
  token: z.string().min(1),
  action: z.enum(['confirm', 'cancel', 'purge']),
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Marque un jeton consommé par une valeur UNIQUE, jamais par une constante.
 *
 * `confirmTokenHash` et `cancelTokenHash` portent `@unique` dans le schéma, et
 * le code y écrivait littéralement `'used'` : la DEUXIÈME demande résolue de la
 * base entrait en collision sur l'index et échouait — un piège latent tant que
 * l'index n'existe pas, armé le jour d'un `prisma db push` (#4183).
 */
function jetonConsomme(requestId: string, quoi: 'used' | 'revoked'): string {
  return `${quoi}:${requestId}`;
}

/**
 * Résoudre un lien de suppression de compte — la porte qui remplace les trois
 * `GET` mutants (#4183).
 *
 * Niveau **S1** : publique, mais bornée. Elle n'est pas authentifiée par
 * nature — la personne qui annule sa suppression peut très bien avoir perdu
 * l'accès à son compte, c'est même le cas nominal.
 *
 * Ce qui la distingue de ce qu'elle remplace :
 *  - c'est un `POST` : aucun pré-chargeur de lien ne le déclenche ;
 *  - le jeton PÉRIME (72 h), vérifié dans les deux recherches ;
 *  - les essais sont comptés, et la demande s'invalide au plafond ;
 *  - un débit par IP borne la cadence.
 */
export async function accountDeletionRoutes(fastify: FastifyInstance) {
  const limiteur = createCustomRateLimiter(
    {
      max: 10,
      windowMs: 60 * 60 * 1000,
      keyPrefix: 'account:deletion-resolve',
      message: 'Trop de tentatives. Veuillez réessayer dans une heure.',
    },
    fastify.redis ?? undefined
  );

  fastify.post(
    '/resolve',
    {
      preHandler: [limiteur.middleware(), validateBody(ResolveBodySchema)],
      config: { rateLimit: false },
      schema: {
        description:
          'Resolve an account-deletion email link. Replaces the three mutating GET routes: a link preloader can no longer confirm a deletion (#4183).',
        tags: ['account'],
        summary: 'Resolve an account deletion link',
        body: {
          type: 'object',
          required: ['token', 'action'],
          properties: {
            token: { type: 'string', description: 'Token carried by the email link' },
            action: { type: 'string', enum: ['confirm', 'cancel', 'purge'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  gracePeriodEndsAt: { type: 'string', nullable: true },
                  canCancelUntil: { type: 'string', nullable: true },
                  /**
                   * Ce que la suppression FAIT réellement aujourd'hui : le
                   * compte est désactivé et daté, les données ne sont PAS
                   * purgées. La page le dit — c'est la décision du critère 7,
                   * et la purge effective est un lot à part.
                   */
                  dataPurged: { type: 'boolean' },
                },
              },
            },
          },
          400: errorResponseSchema,
          410: errorResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
        security: [],
      },
    },
    async (request, reply) => {
      const { token, action } = request.body as { token: string; action: DeletionAction };
      const tokenHash = hashToken(token);

      // `cancel` se présente avec le jeton d'annulation ; `confirm` et `purge`
      // avec celui de confirmation. Chercher dans la mauvaise colonne rendrait
      // « lien invalide » sur un lien parfaitement bon.
      const colonne = action === 'cancel' ? 'cancelTokenHash' : 'confirmTokenHash';

      try {
        const demande = await fastify.prisma.accountDeletionRequest.findFirst({
          where: { [colonne]: tokenHash } as Record<string, string>,
        });

        if (!demande) {
          // L'enveloppe PLATE du dépôt (`sendError`), pas un objet `error`
          // imbriqué : `errorResponseSchema` déclare `error` en `string`, et
          // `fast-json-stringify` retire en silence tout ce qu'il ne déclare
          // pas — le code d'erreur n'aurait jamais atteint le client (#4139).
          return sendGone(reply, 'Ce lien est invalide ou a déjà été utilisé.', { code: 'TOKEN_INVALID' });
        }

        // Le TTL, vérifié pour les DEUX recherches. `null` = demande créée
        // avant que le champ existe : on la traite comme périmée plutôt que
        // comme éternelle — se tromper vers « le lien est mort » ne coûte
        // qu'une nouvelle demande ; l'inverse coûte un compte.
        const perime = !demande.tokenExpiresAt || demande.tokenExpiresAt.getTime() < Date.now();
        if (perime) {
          return sendGone(reply, 'Ce lien a expiré. Relancez la demande depuis l’application.', { code: 'TOKEN_EXPIRED' });
        }

        const etatAttendu: Record<DeletionAction, string[]> = {
          confirm: ['PENDING_EMAIL_CONFIRMATION'],
          cancel: ['PENDING_EMAIL_CONFIRMATION', 'CONFIRMED', 'GRACE_PERIOD_EXPIRED'],
          purge: ['GRACE_PERIOD_EXPIRED'],
        };

        if (!etatAttendu[action].includes(demande.status)) {
          // Un essai qui ne correspond à aucun état attendu se COMPTE : c'est
          // la seule forme de devinette possible sur cette route.
          const { resolveAttempts } = await fastify.prisma.accountDeletionRequest.update({
            where: { id: demande.id },
            data: { resolveAttempts: { increment: 1 } },
            select: { resolveAttempts: true },
          });

          if (resolveAttempts >= MAX_RESOLVE_ATTEMPTS) {
            await fastify.prisma.accountDeletionRequest.update({
              where: { id: demande.id },
              data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                confirmTokenHash: jetonConsomme(demande.id, 'revoked'),
                cancelTokenHash: jetonConsomme(demande.id, 'revoked'),
              },
            });
            logger.warn(`[Deletion] demande invalidée après ${resolveAttempts} essais, id=${demande.id}`);
          }

          return sendGone(reply, 'Ce lien ne s’applique plus à l’état de votre demande.', { code: 'TOKEN_INVALID' });
        }

        if (action === 'confirm') {
          const gracePeriodEndsAt = new Date();
          gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + GRACE_PERIOD_DAYS);

          await fastify.prisma.accountDeletionRequest.update({
            where: { id: demande.id },
            data: {
              status: 'CONFIRMED',
              confirmedAt: new Date(),
              gracePeriodEndsAt,
              confirmTokenHash: jetonConsomme(demande.id, 'used'),
            },
          });

          logger.info(`[Deletion] confirmée user=${demande.userId}, grâce jusqu'au ${gracePeriodEndsAt.toISOString()}`);

          return sendSuccess(reply, {
            status: 'CONFIRMED',
            gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
            canCancelUntil: gracePeriodEndsAt.toISOString(),
            dataPurged: false,
          });
        }

        if (action === 'cancel') {
          await fastify.prisma.accountDeletionRequest.update({
            where: { id: demande.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancelTokenHash: jetonConsomme(demande.id, 'used'),
            },
          });

          // Annuler après l'expiration de la grâce doit RENDRE le compte : à ce
          // stade, le job de maintenance l'a déjà désactivé. Sans cette
          // réactivation, l'annulation « réussirait » et laisserait la personne
          // dehors — comportement préservé de la route qu'on remplace.
          const compte = await fastify.prisma.user.findUnique({
            where: { id: demande.userId },
            select: { isActive: true },
          });

          if (compte && !compte.isActive) {
            await fastify.prisma.user.update({
              where: { id: demande.userId },
              data: { isActive: true, deletedAt: null },
            });
          }

          logger.info(`[Deletion] annulée user=${demande.userId}`);

          return sendSuccess(reply, {
            status: 'CANCELLED',
            gracePeriodEndsAt: null,
            canCancelUntil: null,
            dataPurged: false,
          });
        }

        // `purge` — la suppression immédiate, après expiration de la grâce.
        await fastify.prisma.user.update({
          where: { id: demande.userId },
          data: { isActive: false, deletedAt: new Date() },
        });

        await fastify.prisma.accountDeletionRequest.update({
          where: { id: demande.id },
          data: { status: 'COMPLETED', confirmTokenHash: jetonConsomme(demande.id, 'used') },
        });

        // Le compte n'existe plus : ses sockets tombent, APRÈS l'écriture — un
        // socket resté ouvert recevrait encore les fils temps réel d'un compte
        // supprimé. Best-effort par construction.
        await disconnectRevokedSessions({
          io: fastify.socketIOHandler?.getManager?.()?.getIO(),
          userId: demande.userId,
          reason: 'logout_all_devices',
          message: 'Your account was deleted — every session was signed out.',
          onError: (err) => logger.warn(`[Deletion] coupure des sockets échouée user=${demande.userId}`, err),
        });

        logger.info(`[Deletion] compte désactivé immédiatement user=${demande.userId}`);

        return sendSuccess(reply, {
          status: 'COMPLETED',
          gracePeriodEndsAt: null,
          canCancelUntil: null,
          // DIT LA VÉRITÉ. La page annonçait « supprimé définitivement » quand
          // le code ne fait qu'un `isActive: false` + `deletedAt` : rien n'est
          // purgé. La purge réelle est un lot à part, irréversible, qui mérite
          // sa propre revue (#4183 critère 7).
          dataPurged: false,
        });
      } catch (error) {
        logger.error('[Deletion] échec de résolution', error as Error);
        return sendInternalError(reply, 'Erreur lors du traitement du lien', { code: 'INTERNAL_ERROR' });
      }
    }
  );
}
