/**
 * Les PACKS de stickers — `/sticker-packs` (#9141).
 *
 *   - `GET    /sticker-packs`                    la boutique : intégrés puis publiés, avec l'état d'installation ;
 *   - `GET    /sticker-packs/installed`          les packs installés et leurs stickers (la feuille de stickers) ;
 *   - `GET    /sticker-packs/submissions`        les propositions de l'appelant, avec le mot du modérateur ;
 *   - `POST   /sticker-packs/submissions`        proposer un pack — multipart : champ `manifest` (JSON) et
 *                                                 un fichier par sticker, nommé comme son `asset` ;
 *   - `GET    /sticker-packs/pending`            la file de modération (`canModerateContent`) ;
 *   - `GET    /sticker-packs/:slug`              un pack et ses stickers ;
 *   - `PUT    /sticker-packs/:slug/install`      l'installer ; `DELETE` le retirer ;
 *   - `POST   /sticker-packs/:slug/review`       le publier ou le refuser (`canModerateContent`).
 *
 * Le format et sa validation vivent dans `packages/shared/types/sticker-pack.ts`,
 * la loi dans `services/stickers/StickerPacks.ts` ; cette route n'en fait que la
 * traduction HTTP. Réservée aux comptes INSCRITS.
 *
 * Depuis LP0 (#10148), la boutique, les installés, le détail et l'installation
 * sont produits par la fabrique commune à tous les domaines de packs
 * (`registerPackRoutes`, `./pack-routes.ts`) ; seules les propositions et la
 * modération restent propres aux stickers. Formes, codes, chemins, en-têtes et
 * schémas sont identiques à l'octet (`sticker-packs-frozen-responses.test.ts`).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { STICKER_LIMITS } from '@meeshy/shared/types/sticker-definition';
import { STICKER_PACK_LIMITS } from '@meeshy/shared/types/sticker-pack';

import { requirePermission } from '../middleware/authorize';
import { StickerPacks } from '../services/stickers/StickerPacks';
import {
  sendBadRequest,
  sendConflict,
  sendNotFound,
  sendPayloadTooLarge,
  sendSuccess,
  sendUnsupportedMediaType,
} from '../utils/response.js';
import { diskStickerFileStore } from './me/stickers';
import {
  PACK_ERRORS as ERRORS,
  packEnvelope as envelope,
  packInstallationBroadcaster,
  packRouteGuard,
  packSlugParamsJsonSchema as slugParamsJsonSchema,
  registerPackRoutes,
  type PackSlugRequest as SlugRequest,
} from './pack-routes';

export const STICKER_PACK_ERROR_CODES = {
  INVALID: 'STICKER_PACK_INVALID',
  ASSET_REFUSED: 'STICKER_PACK_ASSET_REFUSED',
  SLUG_TAKEN: 'STICKER_PACK_SLUG_TAKEN',
  TOO_MANY_PENDING: 'STICKER_PACK_TOO_MANY_PENDING',
  TOO_LARGE: 'STICKER_PACK_TOO_LARGE',
  NOT_FOUND: 'STICKER_PACK_NOT_FOUND',
} as const;

/** Le poids d'une proposition entière : de quoi loger cent vingt stickers déjà compressés. */
const MAX_SUBMISSION_BYTES = 60 * 1024 * 1024;

const zoneJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slot: { type: 'string' },
    label: { type: 'string' },
    box: {
      type: 'object',
      additionalProperties: false,
      properties: { x: { type: 'integer' }, y: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' } },
    },
    defaultText: { type: 'string' },
    maxLength: { type: 'integer' },
    maxLines: { type: 'integer' },
    minFontSize: { type: 'integer' },
    maxFontSize: { type: 'integer' },
    color: { type: 'string' },
    weight: { type: 'string' },
    align: { type: 'string' },
  },
} as const;

/** Un fichier dans le magasin adressé, `GET /api/v1/pack-assets/<src>` (#10188) — additif, absent tant que l'empreinte n'est pas gravée. */
const assetRefJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['src', 'sha256', 'bytes'],
  properties: { src: { type: 'string' }, sha256: { type: 'string' }, bytes: { type: 'integer' } },
} as const;

const itemJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string' },
    title: { type: 'string' },
    emoji: { type: 'string' },
    kind: { type: 'string', enum: ['static', 'cinematic', 'instant'] },
    mimeType: { type: 'string' },
    fileUrl: { type: 'string', description: 'Chemin servi par GET /attachments/file/* — l’ancien chemin, gardé pour les clients publiés (#9223)' },
    asset: { ...assetRefJsonSchema, description: 'Le même fichier, servi par GET /api/v1/pack-assets/<src> (#10188)' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    zones: { type: 'array', items: zoneJsonSchema },
  },
} as const;

const summaryProperties = {
  slug: { type: 'string' },
  name: { type: 'string' },
  description: { type: 'string' },
  author: { type: 'string' },
  builtin: { type: 'boolean' },
  status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
  itemCount: { type: 'integer' },
  kinds: { type: 'array', items: { type: 'string' } },
  coverUrl: { type: 'string', nullable: true },
  cover: { ...assetRefJsonSchema, description: 'La couverture, servie par GET /api/v1/pack-assets/<src> (#10188)' },
  installed: { type: 'boolean' },
  installCount: { type: 'integer' },
} as const;

const summaryJsonSchema = { type: 'object', additionalProperties: false, properties: summaryProperties } as const;
const detailJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { ...summaryProperties, items: { type: 'array', items: itemJsonSchema }, reviewNote: { type: 'string', nullable: true } },
} as const;


const invalidPackJsonSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' },
    message: { type: 'string' },
    code: { type: 'string' },
    problems: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, code: { type: 'string' } } } },
  },
} as const;


const reviewBodySchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(STICKER_PACK_LIMITS.maxReviewNoteLength).optional(),
});

export type StickerPacksRoutesOptions = { readonly packs?: StickerPacks };

type Submission = { readonly manifest: unknown; readonly assets: ReadonlyMap<string, Buffer> } | 'too-large' | 'no-manifest';

async function readSubmission(request: FastifyRequest): Promise<Submission> {
  const assets = new Map<string, Buffer>();
  let manifest: string | undefined;
  let total = 0;
  for await (const part of request.parts({ limits: { files: STICKER_PACK_LIMITS.maxItems, fileSize: STICKER_LIMITS.maxSourceBytes + 1 } })) {
    if (part.type === 'file') {
      const bytes = await part.toBuffer();
      total += bytes.length;
      if (total > MAX_SUBMISSION_BYTES) return 'too-large';
      assets.set(part.filename, bytes);
    } else if (part.fieldname === 'manifest' && typeof part.value === 'string') {
      manifest = part.value;
    }
  }
  if (manifest === undefined) return 'no-manifest';
  try {
    return { manifest: JSON.parse(manifest) as unknown, assets };
  } catch {
    return 'no-manifest';
  }
}

export async function stickerPacksRoutes(fastify: FastifyInstance, options: StickerPacksRoutesOptions = {}) {
  const packs =
    options.packs ??
    new StickerPacks({
      prisma: fastify.prisma,
      files: diskStickerFileStore(process.env.UPLOAD_PATH || '/app/uploads'),
      broadcast: packInstallationBroadcaster(fastify),
    });
  const requireModerator = requirePermission('canModerateContent');

  const guarded = packRouteGuard(fastify, {
    internalErrorMessage: 'Error handling sticker packs',
    onError: (error: unknown, reply: FastifyReply) => {
      const code = (error as { code?: unknown }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT') {
        return sendPayloadTooLarge(reply, 'Sticker pack too large', { code: STICKER_PACK_ERROR_CODES.TOO_LARGE });
      }
      return undefined;
    },
  });

  registerPackRoutes(fastify, {
    catalog: packs.catalog,
    guard: guarded,
    basePath: '/sticker-packs',
    tags: ['stickers'],
    summaryJsonSchema,
    detailJsonSchema,
    notFound: { message: 'Sticker pack not found', code: STICKER_PACK_ERROR_CODES.NOT_FOUND },
    notRemovable: { message: 'This pack is included and cannot be removed', code: 'PACK_NOT_REMOVABLE' },
    texts: {
      list: {
        description: 'La boutique des packs de stickers (#9141) : les packs intégrés (Mee, Meo, Mee & Meo) puis les packs publiés, avec leur état d’installation.',
        summary: 'List sticker packs',
      },
      installed: {
        description: 'Les packs installés par l’appelant et leurs stickers (#9141) — un onglet par pack dans la feuille de stickers. Un pack intégré n’a pas de stickers servis : le client les dessine.',
        summary: 'List my installed sticker packs',
      },
      detail: {
        description: 'Un pack de stickers et ses stickers (#9141). Un pack non publié n’est servi qu’à son auteur et aux modérateurs.',
        summary: 'Get a sticker pack',
      },
      install: { description: 'Installe un pack de stickers publié (#9141).', summary: 'Install a sticker pack' },
      uninstall: { description: 'Retire un pack de stickers — intégré compris (#9141).', summary: 'Uninstall a sticker pack' },
    },
  });

  fastify.get(
    '/submissions',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Les packs proposés par l’appelant, du plus récent au plus ancien, avec leur état et le mot du modérateur (#9141).',
        tags: ['stickers'],
        summary: 'List my sticker pack submissions',
        response: { 200: envelope({ type: 'array', items: detailJsonSchema }), ...ERRORS },
      },
    },
    guarded('[GET /sticker-packs/submissions]', async (_request, reply, viewer) => sendSuccess(reply, await packs.submissions(viewer.userId))),
  );

  fastify.post(
    '/submissions',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          'Propose un pack de stickers (#9141) — multipart : champ `manifest` (JSON, `StickerPackManifest`) et un fichier ' +
          'par sticker, nommé comme son `asset`. Le manifeste est validé par `validateStickerPackManifest` (zones de texte ' +
          'des Instants comprises : le texte le plus long admis doit tenir) ; chaque image est ré-encodée et son genre ' +
          'confronté à son animation réelle. Le pack naît en attente de modération. 422 avec `problems` si le manifeste ' +
          'est refusé.',
        tags: ['stickers'],
        summary: 'Submit a sticker pack',
        consumes: ['multipart/form-data'],
        response: { 201: envelope(detailJsonSchema), 422: invalidPackJsonSchema, 409: errorResponseSchema, 413: errorResponseSchema, 415: errorResponseSchema, ...ERRORS },
      },
    },
    guarded('[POST /sticker-packs/submissions]', async (request, reply, viewer) => {
      if (!request.isMultipart()) return sendBadRequest(reply, 'Expected multipart/form-data', { code: 'VALIDATION_ERROR' });
      const submission = await readSubmission(request);
      if (submission === 'too-large') return sendPayloadTooLarge(reply, 'Sticker pack too large', { code: STICKER_PACK_ERROR_CODES.TOO_LARGE });
      if (submission === 'no-manifest') return sendBadRequest(reply, 'A JSON manifest is required', { code: 'VALIDATION_ERROR' });

      const outcome = await packs.submit(viewer.userId, submission.manifest, submission.assets);
      switch (outcome.kind) {
        case 'submitted':
          return sendSuccess(reply, outcome.pack, { statusCode: 201 });
        case 'invalid':
          return reply.status(422).send({
            success: false,
            error: 'Invalid sticker pack',
            message: 'Invalid sticker pack',
            code: STICKER_PACK_ERROR_CODES.INVALID,
            problems: outcome.problems,
          });
        case 'asset-refused':
          return sendUnsupportedMediaType(reply, `Sticker "${outcome.key}" refused: ${outcome.reason}`, {
            code: STICKER_PACK_ERROR_CODES.ASSET_REFUSED,
          });
        case 'slug-taken':
          return sendConflict(reply, 'This sticker pack name is taken', { code: STICKER_PACK_ERROR_CODES.SLUG_TAKEN });
        case 'too-many-pending':
          return sendConflict(reply, `At most ${STICKER_PACK_LIMITS.maxPendingPerAuthor} packs can wait for review`, {
            code: STICKER_PACK_ERROR_CODES.TOO_MANY_PENDING,
          });
      }
    }),
  );

  fastify.get(
    '/pending',
    {
      onRequest: [fastify.authenticate, requireModerator],
      schema: {
        description: 'La file de modération des packs de stickers, la plus ancienne proposition d’abord (#9141).',
        tags: ['stickers', 'admin'],
        summary: 'List sticker packs awaiting review',
        response: { 200: envelope({ type: 'array', items: detailJsonSchema }), ...ERRORS },
      },
    },
    guarded('[GET /sticker-packs/pending]', async (_request, reply, viewer) => sendSuccess(reply, await packs.pending(viewer.userId))),
  );

  fastify.post(
    '/:slug/review',
    {
      onRequest: [fastify.authenticate, requireModerator],
      schema: {
        description: 'Publie (`approve`) ou refuse (`reject`) un pack en attente, avec un mot facultatif pour son auteur (#9141).',
        tags: ['stickers', 'admin'],
        summary: 'Review a sticker pack',
        params: slugParamsJsonSchema,
        body: {
          type: 'object',
          required: ['decision'],
          properties: { decision: { type: 'string', enum: ['approve', 'reject'] }, note: { type: 'string', maxLength: STICKER_PACK_LIMITS.maxReviewNoteLength } },
        },
        response: { 200: envelope(detailJsonSchema), ...ERRORS },
      },
    },
    guarded('[POST /sticker-packs/:slug/review]', async (request: SlugRequest, reply, viewer) => {
      const body = reviewBodySchema.safeParse(request.body);
      if (!body.success) return sendBadRequest(reply, 'Invalid review', { code: 'VALIDATION_ERROR' });
      const pack = await packs.review(viewer.userId, request.params.slug, body.data.decision, body.data.note ?? null);
      if (!pack) return sendNotFound(reply, 'No sticker pack awaiting review under this name', { code: STICKER_PACK_ERROR_CODES.NOT_FOUND });
      return sendSuccess(reply, pack);
    }),
  );
}
