/**
 * GET /posts/:postId/media/:mediaId/export — export watermarké côté serveur
 * d'un média de post (#3600).
 *
 * Authentifié + gardé par l'audience du post : mêmes trois questions que
 * `mayConsumePost` (auteur → audience déclarée → référence), la porte que le
 * favori/l'impression/le partage utilisent déjà pour un geste de LECTEUR sur
 * un post sans le rendre. Un export en est un de plus.
 *
 * La variante watermarkée est mise en cache sous
 * `<UPLOAD_PATH>/watermarked/<mediaId><ext>` — jamais référencée par une ligne
 * de base, donc hors du territoire d'`OrphanMediaCleanupService` (qui ne
 * purge que ce qu'un producteur a explicitement `track()`é).
 */

import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { mayConsumePost, type PostConsumptionPrisma } from './postConsumptionGate';
import {
  applyImageWatermark,
  applyVideoWatermark,
  watermarkedVariantPath,
} from '../../services/media/mediaWatermark';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'PostMediaExport' });

export interface PostMediaExportParams {
  postId: string;
  mediaId: string;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

/**
 * Déduplique les générations concurrentes pour la MÊME variante — deux
 * requêtes arrivant avant la première écriture n'invoquent sharp/ffmpeg
 * qu'une fois. Clé = chemin de destination, donc borné par le nombre de
 * médias EN COURS de watermarkage, jamais par le trafic total.
 *
 * La réservation (`get`/`set` ci-dessous) doit rester SYNCHRONE — aucun
 * `await` entre les deux. `fs.stat` (#5583) est un appel I/O réel dont la
 * latence varie sous charge ; le placer AVANT la réservation ouvre une
 * fenêtre où deux requêtes concurrentes le trouvent toutes deux vide et
 * lancent chacune leur propre génération pour le même fichier. Le déplacer
 * DANS la promesse réservée (`generateWatermarkedVariant`) ferme la fenêtre :
 * la réservation elle-même ne dépend plus d'aucune I/O.
 */
const generationsInFlight = new Map<string, Promise<void>>();

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generateWatermarkedVariant(params: {
  destPath: string;
  sourcePath: string;
  mimeType: string;
  handle: string;
  mediaId: string;
}): Promise<void> {
  const { destPath, sourcePath, mimeType, handle, mediaId } = params;
  if (await fileExists(destPath)) return;
  await (mimeType.startsWith('video/')
    ? applyVideoWatermark({ sourcePath, destPath, handle, mediaId })
    : applyImageWatermark({ sourcePath, destPath, handle, mediaId }));
}

async function ensureWatermarkedVariant(params: {
  destPath: string;
  sourcePath: string;
  mimeType: string;
  handle: string;
  mediaId: string;
}): Promise<void> {
  const { destPath } = params;
  let generation = generationsInFlight.get(destPath);
  if (!generation) {
    generation = generateWatermarkedVariant(params).finally(() => generationsInFlight.delete(destPath));
    generationsInFlight.set(destPath, generation);
  }
  await generation;
}

export function registerPostMediaExportRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient & PostConsumptionPrisma,
  requiredAuth: unknown,
  uploadBasePath: string = process.env.UPLOAD_PATH || '/app/uploads',
) {
  fastify.get(
    '/posts/:postId/media/:mediaId/export',
    { preValidation: [requiredAuth as never] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext?.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
        }

        const { postId, mediaId } = request.params as PostMediaExportParams;
        if (!isValidObjectId(postId) || !isValidObjectId(mediaId)) {
          return sendNotFound(reply, 'Media not found');
        }

        const userId = authContext.registeredUser.id;
        const allowed = await mayConsumePost(prisma, postId, userId);
        if (!allowed) {
          return sendNotFound(reply, 'Media not found');
        }

        const media = await prisma.postMedia.findFirst({
          where: { id: mediaId, postId },
          select: { id: true, filePath: true, mimeType: true },
        });
        if (!media) {
          return sendNotFound(reply, 'Media not found');
        }

        const ext = EXTENSION_BY_MIME[media.mimeType];
        if (!ext) {
          return sendNotFound(reply, 'Media not found');
        }

        const post = await prisma.post.findFirst({
          where: { id: postId },
          select: { author: { select: { username: true } } },
        });
        const handle = post?.author?.username ? `@${post.author.username}` : '@meeshy';

        const destPath = watermarkedVariantPath(uploadBasePath, mediaId, ext);
        const sourcePath = path.join(uploadBasePath, media.filePath);

        try {
          await ensureWatermarkedVariant({
            destPath,
            sourcePath,
            mimeType: media.mimeType,
            handle,
            mediaId,
          });
        } catch (error) {
          log.warn('[PostMediaExport] watermark generation failed', {
            mediaId,
            error: (error as Error).message,
          });
          return sendNotFound(reply, 'Media not found');
        }

        reply.header('Content-Type', media.mimeType);
        reply.header('Cache-Control', 'private, max-age=31536000, immutable');
        reply.header('Content-Disposition', `attachment; filename="meeshy-${mediaId}${ext}"`);
        return reply.send(createReadStream(destPath));
      } catch (error) {
        log.error('[PostMediaExport] export failed', { error: (error as Error).message });
        return sendInternalError(reply, 'Failed to export media');
      }
    },
  );
}
