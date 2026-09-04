/**
 * Upload routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import {
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendInternalError,
} from '../../utils/response.js';

const logger = enhancedLogger.child({ module: 'AttachmentUploadRoutes' });
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AttachmentService } from '../../services/attachments';
import {
  messageAttachmentSchema,
  errorResponseSchema,
} from '@meeshy/shared/types/api-schemas';
import type { UploadedFile, UploadTextBody } from './types';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { classifyAnonymousAttachment } from '../../services/attachments/ContentSignature.js';

/**
 * Plafond RÉEL, en OCTETS, du champ `content` de `POST /attachments/upload-
 * text` (task-1-fix-round-3, I2 ; corrigé round 4). Vérifié ci-dessous via
 * `Buffer.byteLength(content, 'utf-8')` — la seule mesure qui corresponde
 * exactement à ce que `Buffer.from(content, 'utf-8')` écrira sur disque
 * (`AttachmentService.createTextAttachment`).
 *
 * AVANT round 4 : ce plafond n'était appliqué QUE via `maxLength` dans le
 * schéma Fastify — or AJV compte des POINTS DE CODE Unicode, jamais des
 * octets (vérifié par exécution isolée du moteur de schéma réellement
 * utilisé). Avec des caractères astraux choisis délibérément par un
 * attaquant (emoji, 4 octets chacun en UTF-8), un contenu de 10 485 760
 * points de code passait la validation tout en pesant ~41,9 Mo une fois
 * écrit sur disque — face au plafond global de 50 Mo du serveur
 * (`server.ts`), une réduction réelle d'environ 16 % seulement, alors que ce
 * commentaire affirmait alors abaisser « nettement » le plafond réel. 10 Mo
 * reste très généreux pour tout usage BubbleStream légitime (plusieurs
 * romans en texte brut) tout en abaissant réellement le plafond effectif.
 */
export const MAX_TEXT_ATTACHMENT_LENGTH = 10 * 1024 * 1024;

export async function registerUploadRoutes(
  fastify: FastifyInstance,
  authOptional: any,
  prisma: PrismaClient
) {
  const attachmentService = new AttachmentService(prisma);

  /**
   * POST /attachments/upload
   * Upload un ou plusieurs fichiers (support utilisateurs authentifiés ET anonymes)
   */
  fastify.post(
    '/attachments/upload',
    {
      onRequest: [authOptional],
      schema: {
        description: 'Upload one or multiple files. Supports both authenticated and anonymous users. Files are processed with metadata extraction (dimensions for images, duration for audio/video). Anonymous users must have file/image upload permissions on their share link.',
        tags: ['attachments'],
        summary: 'Upload file attachments',
        consumes: ['multipart/form-data'],
        response: {
          200: {
            description: 'Files uploaded successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  attachments: {
                    type: 'array',
                    items: messageAttachmentSchema
                  }
                }
              }
            }
          },
          400: {
            description: 'Bad request - no files provided',
            ...errorResponseSchema
          },
          401: {
            description: 'Authentication required',
            ...errorResponseSchema
          },
          403: {
            description: 'Forbidden - anonymous users without upload permissions',
            ...errorResponseSchema
          },
          // #4856 — le lien de partage RECHERCHÉ est celui par lequel
          // l'appelant s'est lui-même authentifié (son propre
          // `shareLinkId` de session) : sa disparition entretemps est un
          // « je ne trouve pas », pas un refus d'accès à un tiers.
          404: {
            description: 'The share link this anonymous session was authenticated with no longer exists',
            ...errorResponseSchema
          },
          500: {
            description: 'Internal server error',
            ...errorResponseSchema
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as UnifiedAuthRequest).authContext;
        // `isAnonymous` vaut `true` sur le contexte d'un VISITEUR NU : la garde
        // `!isAuthenticated && !isAnonymous` était donc toujours fausse et ne
        // rejetait personne. Un participant anonyme réellement identifié par un
        // jeton de session porte `isAuthenticated: true` — c'est le seul test utile.
        if (!authContext || !authContext.isAuthenticated) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const userId = authContext.userId;
        const isAnonymous = authContext.isAnonymous;

        const parts = request.parts();
        const files: UploadedFile[] = [];
        const metadataMap: Map<number, any> = new Map();

        let fileIndex = 0;
        for await (const part of parts) {
          if (part.type === 'file') {
            const buffer = await part.toBuffer();
            files.push({
              buffer,
              filename: part.filename,
              mimeType: part.mimetype,
              size: buffer.length,
            });
            fileIndex++;
          } else if (part.type === 'field' && part.fieldname.startsWith('metadata_')) {
            const index = parseInt(part.fieldname.replace('metadata_', ''), 10);
            const metadataValue = await part.value;
            try {
              const metadata = JSON.parse(metadataValue as string);
              logger.debug('Metadata received for file', { index, hasDuration: !!metadata.duration, duration: metadata.duration, fullMetadata: metadata });
              metadataMap.set(index, metadata);
            } catch (error) {
              logger.warn('Impossible de parser les métadonnées', error as Error);
            }
          }
        }

        logger.debug('Files received', { count: files.length });

        if (files.length === 0) {
          return sendBadRequest(reply, 'No files provided');
        }

        if (isAnonymous && authContext.participantId) {
          const shareLink = await prisma.conversationShareLink.findUnique({
            where: { id: authContext.anonymousUser?.shareLinkId },
            select: {
              allowAnonymousFiles: true,
              allowAnonymousImages: true,
            },
          });

          if (!shareLink) {
            // #4856 — le lien recherché ici est celui de la SESSION anonyme
            // de l'appelant, jamais celui d'un tiers : rien à cacher.
            return sendNotFound(reply, 'Share link not found');
          }

          // Round 1 sécurité (task-1-fix-round-1) : la classification ne se
          // fie plus SEULEMENT au `Content-Type` déclaré (en-tête multipart
          // fourni par le client, jamais vérifié) — elle se MÉRITE par les
          // octets, dans les limites décrites en tête de `ContentSignature.ts`
          // (préfixe structurel, pas un parseur de conteneur — round 2). Un
          // type déclaré dont la signature ne correspond à aucun conteneur
          // connu retombe dans la branche « fichier », la plus stricte.
          // `classifyAnonymousAttachment` est la décision UNIQUE, partagée
          // avec `routes/uploads/tus-handler.ts`, pour que les deux chemins
          // d'upload ne puissent pas diverger (round 2, Critical 1).
          for (const file of files) {
            const verdict = classifyAnonymousAttachment(file.mimeType, file.buffer, shareLink);
            if (verdict.allowed === false) {
              return sendForbidden(reply, verdict.reason);
            }
          }
        }

        const results = await attachmentService.uploadMultiple(
          files,
          userId,
          isAnonymous,
          undefined,
          metadataMap.size > 0 ? metadataMap : undefined
        );

        return sendSuccess(reply, { attachments: results });
      } catch (error: any) {
        logger.error('Error uploading files', error as Error);
        return sendInternalError(reply, error.message || 'Error uploading files');
      }
    }
  );

  /**
   * POST /attachments/upload-text
   * Crée un fichier texte à partir du contenu
   */
  fastify.post(
    '/attachments/upload-text',
    {
      onRequest: [authOptional],
      schema: {
        description: 'Create a text file attachment from provided content. Useful for BubbleStream and text-based messaging. The content is stored as a .txt file and treated as a standard attachment.',
        tags: ['attachments'],
        summary: 'Create text file attachment',
        body: {
          type: 'object',
          required: ['content'],
          properties: {
            content: {
              type: 'string',
              description: 'Text content to save as a file',
              // Barrière de schéma peu coûteuse : AJV compte des POINTS DE
              // CODE Unicode, pas des octets — cette valeur ne borne donc PAS
              // la taille réelle en octets (jusqu'à ×4 en pire cas avec des
              // caractères astraux, voir le commentaire de
              // `MAX_TEXT_ATTACHMENT_LENGTH` ci-dessus). Elle rejette
              // seulement, tôt et à coût nul, un contenu manifestement
              // démesuré avant l'appel au service ; le plafond RÉEL est
              // vérifié en octets dans le handler ci-dessous.
              maxLength: MAX_TEXT_ATTACHMENT_LENGTH,
            },
            messageId: {
              type: 'string',
              description: 'Optional message ID to associate with this attachment'
            },
          },
        },
        response: {
          200: {
            description: 'Text attachment created successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  attachment: messageAttachmentSchema
                }
              }
            }
          },
          401: {
            description: 'Authentication required',
            ...errorResponseSchema
          },
          403: {
            description: 'Forbidden - anonymous users without file upload permission',
            ...errorResponseSchema
          },
          // #4856 — même verdict que sur `/attachments/upload` : le lien de
          // partage recherché est celui de la session anonyme appelante.
          404: {
            description: 'The share link this anonymous session was authenticated with no longer exists',
            ...errorResponseSchema
          },
          500: {
            description: 'Internal server error',
            ...errorResponseSchema
          }
        }
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext || !authContext.isAuthenticated) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { content, messageId } = request.body as UploadTextBody;

        // task-1-fix-round-4 — plafond RÉEL, en octets : `Buffer.byteLength`
        // mesure exactement ce que `Buffer.from(content, 'utf-8')` produira
        // (AttachmentService.createTextAttachment), contrairement au
        // `maxLength` du schéma ci-dessus qui ne borne que des points de code.
        const contentByteLength = Buffer.byteLength(content, 'utf-8');
        if (contentByteLength > MAX_TEXT_ATTACHMENT_LENGTH) {
          return sendBadRequest(
            reply,
            `Content exceeds maximum size of ${MAX_TEXT_ATTACHMENT_LENGTH} bytes (received ${contentByteLength} bytes)`
          );
        }

        const userId = authContext.userId;
        const isAnonymous = authContext.isAnonymous;

        // task-1-fix-round-3, I2 — AVANT : ce point d'entrée ne vérifiait QUE
        // `isAuthenticated`, jamais `allowAnonymousFiles`. Un invité anonyme
        // sur un lien « pas de fichiers » persistait donc jusqu'à ~50 Mo de
        // texte (limite globale du serveur, `bodyLimit`) en un seul appel
        // REST documenté — le contournement le plus simple des trois vus sur
        // ce chantier, sans rien forger.
        //
        // Décision produit : contrairement à un message VOCAL (round 1 —
        // exempté de `allowAnonymousFiles`/`allowAnonymousImages` car borné
        // par la durée d'enregistrement et vérifié par signature, donc jamais
        // réutilisable pour du stockage en vrac), un texte déposé ici n'a
        // AUCUNE borne naturelle de taille ni de forme : c'est un fichier
        // `.txt` arbitraire, exactement ce que `allowAnonymousFiles: false`
        // existe pour empêcher. Il suit donc le droit de FICHIER, pas le
        // droit d'écrire un message — même garde que `POST /attachments/upload`.
        if (isAnonymous && authContext.participantId) {
          const shareLink = await prisma.conversationShareLink.findUnique({
            where: { id: authContext.anonymousUser?.shareLinkId },
            select: { allowAnonymousFiles: true },
          });

          if (!shareLink) {
            // #4856 — comme sur `/attachments/upload` : c'est le lien de la
            // session anonyme appelante, jamais celui d'un tiers.
            return sendNotFound(reply, 'Share link not found');
          }

          if (!shareLink.allowAnonymousFiles) {
            return sendForbidden(reply, 'File uploads are not allowed for anonymous users on this conversation');
          }
        }

        const result = await attachmentService.createTextAttachment(
          content,
          userId,
          isAnonymous,
          messageId
        );

        return sendSuccess(reply, { attachment: result });
      } catch (error: any) {
        logger.error('Error creating text attachment', error as Error);
        return sendInternalError(reply, error.message || 'Error creating text attachment');
      }
    }
  );
}
