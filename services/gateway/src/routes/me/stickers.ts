/**
 * « Mes stickers » — `/me/stickers` (#7938).
 *
 *   - `GET    /me/stickers` rend la bibliothèque, la plus récemment utilisée d'abord ;
 *   - `POST   /me/stickers` crée un sticker depuis une image (multipart : `file`,
 *     et les champs `origin` et `name` facultatifs) — 201 à la création, 200 quand
 *     la même image était déjà là (elle remonte en tête) ;
 *   - `POST   /me/stickers/:stickerId/use` le remonte en tête quand il part dans un message ;
 *   - `DELETE /me/stickers/:stickerId` le retire, ligne et fichier.
 *
 * La définition servie est `StickerDefinition` (`packages/shared/types/sticker-definition.ts`) ;
 * la normalisation et les bornes vivent dans `services/stickers/`. Cette route
 * n'en fait que la traduction HTTP. Réservée aux comptes INSCRITS : une
 * bibliothèque se rattache à un `User.id`, un invité de lien n'en a pas.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { STICKER_LIMITS, STICKER_MIME_TYPES, STICKER_ORIGINS } from '@meeshy/shared/types/sticker-definition';

import { isRegisteredUser, type UnifiedAuthRequest } from '../../middleware/auth';
import { StickerLibrary, type StickerFileStore } from '../../services/stickers/StickerLibrary';
import { logError } from '../../utils/logger';
import {
  sendBadRequest,
  sendConflict,
  sendForbidden,
  sendInternalError,
  sendNotFound,
  sendPayloadTooLarge,
  sendSuccess,
  sendUnsupportedMediaType,
} from '../../utils/response.js';

export const STICKER_ERROR_CODES = {
  NOT_AN_IMAGE: 'STICKER_NOT_AN_IMAGE',
  TOO_LARGE: 'STICKER_TOO_LARGE',
  LIBRARY_FULL: 'STICKER_LIBRARY_FULL',
  NOT_FOUND: 'STICKER_NOT_FOUND',
} as const;

const stickerDefinitionJsonSchema = {
  type: 'object',
  required: ['id', 'origin', 'mimeType', 'fileUrl', 'width', 'height', 'sizeBytes', 'animated', 'createdAt', 'lastUsedAt'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string', nullable: true },
    origin: { type: 'string', enum: [...STICKER_ORIGINS] },
    mimeType: { type: 'string', enum: [...STICKER_MIME_TYPES] },
    fileUrl: { type: 'string', description: 'Chemin servi par GET /attachments/file/*' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    sizeBytes: { type: 'integer' },
    animated: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    lastUsedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const stickerResponseSchema = {
  type: 'object',
  properties: { success: { type: 'boolean' }, data: stickerDefinitionJsonSchema },
} as const;

const stickerListResponseSchema = {
  type: 'object',
  properties: { success: { type: 'boolean' }, data: { type: 'array', items: stickerDefinitionJsonSchema } },
} as const;

const stickerRemovedResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object', properties: { id: { type: 'string' }, removed: { type: 'boolean' } } },
  },
} as const;

const stickerParamsSchema = z.object({ stickerId: z.string().regex(/^[0-9a-f]{24}$/i) });
const stickerParamsJsonSchema = {
  type: 'object',
  required: ['stickerId'],
  properties: { stickerId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
} as const;

const originSchema = z.enum(STICKER_ORIGINS).catch('upload');

type StickerParamsRequest = FastifyRequest<{ Params: { stickerId: string } }>;

export type MeStickersRoutesOptions = {
  readonly library?: StickerLibrary;
};

export function diskStickerFileStore(basePath: string): StickerFileStore {
  const resolve = (relativePath: string) => path.join(basePath, relativePath);
  return {
    write: async (relativePath, bytes) => {
      await fs.mkdir(path.dirname(resolve(relativePath)), { recursive: true });
      await fs.writeFile(resolve(relativePath), bytes);
    },
    remove: async (relativePath) => {
      await fs.unlink(resolve(relativePath));
    },
  };
}

function ownerId(request: FastifyRequest): string | null {
  const authContext = (request as UnifiedAuthRequest).authContext;
  if (!authContext || !isRegisteredUser(authContext)) return null;
  return authContext.registeredUser?.id ?? null;
}

type UploadedSticker = { readonly bytes: Buffer; readonly origin: string | undefined; readonly name: string | undefined };

async function readUpload(request: FastifyRequest): Promise<UploadedSticker | null> {
  const fields: Record<string, string> = {};
  let bytes: Buffer | null = null;
  for await (const part of request.parts({ limits: { files: 1, fileSize: STICKER_LIMITS.maxSourceBytes + 1 } })) {
    if (part.type === 'file') {
      bytes = bytes ?? (await part.toBuffer());
    } else if (typeof part.value === 'string') {
      fields[part.fieldname] = part.value;
    }
  }
  return bytes === null ? null : { bytes, origin: fields['origin'], name: fields['name'] };
}

export async function meStickersRoutes(fastify: FastifyInstance, options: MeStickersRoutesOptions = {}) {
  const library =
    options.library ??
    new StickerLibrary({
      prisma: fastify.prisma,
      files: diskStickerFileStore(process.env.UPLOAD_PATH || '/app/uploads'),
    });

  fastify.get(
    '/stickers',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Bibliothèque « Mes stickers » de l’utilisateur (#7938), la plus récemment utilisée d’abord.',
        tags: ['me', 'stickers'],
        summary: 'List my stickers',
        response: { 200: stickerListResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = ownerId(request);
      if (!userId) return sendForbidden(reply, 'Registered user required', { code: 'REGISTERED_USER_REQUIRED' });
      try {
        reply.header('Cache-Control', 'private, no-cache');
        return sendSuccess(reply, await library.list(userId));
      } catch (error) {
        logError(fastify.log, '[GET /me/stickers]', error);
        return sendInternalError(reply, 'Error listing stickers');
      }
    },
  );

  fastify.post(
    '/stickers',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          'Crée un sticker depuis une image (#7938) — multipart `file` (PNG, WebP, GIF animé ou JPEG), champs ' +
          '`origin` (upload · paste · lift · received) et `name` facultatifs. Le type est lu dans les octets ; ' +
          'l’image est ré-encodée, réduite au carré de 512 px, EXIF retiré ; un JPEG devient WebP. 201 à la ' +
          'création ; 200 quand la même image était déjà dans la bibliothèque (elle remonte en tête).',
        tags: ['me', 'stickers'],
        summary: 'Create a sticker from an image',
        consumes: ['multipart/form-data'],
        response: {
          200: stickerResponseSchema,
          201: stickerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = ownerId(request);
      if (!userId) return sendForbidden(reply, 'Registered user required', { code: 'REGISTERED_USER_REQUIRED' });
      if (!request.isMultipart()) return sendBadRequest(reply, 'Expected multipart/form-data', { code: 'VALIDATION_ERROR' });

      try {
        const upload = await readUpload(request);
        if (upload === null) return sendBadRequest(reply, 'No image provided', { code: 'VALIDATION_ERROR' });

        const outcome = await library.create(userId, {
          bytes: upload.bytes,
          origin: originSchema.parse(upload.origin),
          name: upload.name ?? null,
        });
        switch (outcome.kind) {
          case 'created':
            return sendSuccess(reply, outcome.sticker, { statusCode: 201 });
          case 'existing':
            return sendSuccess(reply, outcome.sticker);
          case 'library-full':
            return sendConflict(reply, `Sticker library is full (${STICKER_LIMITS.maxCount})`, {
              code: STICKER_ERROR_CODES.LIBRARY_FULL,
            });
          case 'refused':
            return outcome.reason === 'too-large'
              ? sendPayloadTooLarge(reply, 'Image too large for a sticker', { code: STICKER_ERROR_CODES.TOO_LARGE })
              : sendUnsupportedMediaType(reply, 'Not an image that can become a sticker', {
                  code: STICKER_ERROR_CODES.NOT_AN_IMAGE,
                });
        }
      } catch (error) {
        if ((error as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE') {
          return sendPayloadTooLarge(reply, 'Image too large for a sticker', { code: STICKER_ERROR_CODES.TOO_LARGE });
        }
        logError(fastify.log, '[POST /me/stickers]', error);
        return sendInternalError(reply, 'Error creating sticker');
      }
    },
  );

  fastify.post(
    '/stickers/:stickerId/use',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Remonte un sticker de la bibliothèque en tête, quand il part dans un message (#7938).',
        tags: ['me', 'stickers'],
        summary: 'Mark a sticker as used',
        params: stickerParamsJsonSchema,
        response: {
          200: stickerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: StickerParamsRequest, reply: FastifyReply) => {
      const userId = ownerId(request);
      if (!userId) return sendForbidden(reply, 'Registered user required', { code: 'REGISTERED_USER_REQUIRED' });
      const params = stickerParamsSchema.safeParse(request.params);
      if (!params.success) return sendBadRequest(reply, 'Invalid sticker id', { code: 'VALIDATION_ERROR' });
      try {
        const sticker = await library.markUsed(userId, params.data.stickerId);
        if (!sticker) return sendNotFound(reply, 'Sticker not found', { code: STICKER_ERROR_CODES.NOT_FOUND });
        return sendSuccess(reply, sticker);
      } catch (error) {
        logError(fastify.log, '[POST /me/stickers/:stickerId/use]', error);
        return sendInternalError(reply, 'Error updating sticker');
      }
    },
  );

  fastify.delete(
    '/stickers/:stickerId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Retire un sticker de la bibliothèque, ligne et fichier (#7938).',
        tags: ['me', 'stickers'],
        summary: 'Delete a sticker',
        params: stickerParamsJsonSchema,
        response: {
          200: stickerRemovedResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: StickerParamsRequest, reply: FastifyReply) => {
      const userId = ownerId(request);
      if (!userId) return sendForbidden(reply, 'Registered user required', { code: 'REGISTERED_USER_REQUIRED' });
      const params = stickerParamsSchema.safeParse(request.params);
      if (!params.success) return sendBadRequest(reply, 'Invalid sticker id', { code: 'VALIDATION_ERROR' });
      try {
        const removed = await library.remove(userId, params.data.stickerId);
        if (!removed) return sendNotFound(reply, 'Sticker not found', { code: STICKER_ERROR_CODES.NOT_FOUND });
        return sendSuccess(reply, { id: params.data.stickerId, removed: true });
      } catch (error) {
        logError(fastify.log, '[DELETE /me/stickers/:stickerId]', error);
        return sendInternalError(reply, 'Error deleting sticker');
      }
    },
  );
}
