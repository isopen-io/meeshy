import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { sendSuccess, sendBadRequest, sendNotFound, sendError } from '../../utils/response';
import { toDTO, soundUploaderInclude } from './sounds';
import { loadSoundStats } from '../../services/posts/soundStats';
import {
  ALLOWED_AUDIO_EXT,
  EXT_TO_MIME,
  staticFileUrl,
  NOT_MUTED_WHERE,
} from '../../services/posts/soundFormats';
import { createSoundRouteRateLimitConfig } from '../../middleware/rate-limiter';

// Volume DÉDIÉ, servi uniquement par la route JWT `/static/:filename`.
// Surtout PAS sous UPLOAD_PATH : tout ce qui s'y trouve est exposé par
// `GET /attachments/file/*` (sans authentification, download.ts:256) et par le
// montage nginx en lecture seule sur `static.<domaine>`, en cache immutable un an.
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/sounds';

const ListQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function registerStoryAudioRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // #4190 — `POST /stories/audio` a été RETIRÉE : orpheline sur les trois
  // clients, et la plus coûteuse du module — `toBuffer()` matérialisait tout
  // l'envoi en MÉMOIRE, d'où la borne de 100 Mo qui part avec elle. `GET
  // /stories/audio` ci-dessous reste vivante (iOS `SoundLibraryService`) : le
  // couple est homonyme, seul le verbe distingue la route morte de la vivante.

  // GET /stories/audio — Liste bibliothèque publique (triée par popularité)
  fastify.get('/stories/audio', {
    preValidation: [requiredAuth],
    config: { rateLimit: createSoundRouteRateLimitConfig('list') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    }

    const { q, limit } = parsed.data;
    // `mutedAt` retire de la DÉCOUVERTE en plus d'arrêter la diffusion.
    // Composé en AND : le prédicat porte son propre OR, et la recherche
    // ci-dessous en ajoute un second — deux clés `OR` au même niveau,
    // la seconde écraserait la première.
    const where: any = { isPublic: true, AND: [NOT_MUTED_WHERE] };
    if (q) {
      // Titre OU pseudo de l'uploadeur. Un son CAPTURÉ naît sans titre — le
      // libellé « Son original » est composé par le client dans sa langue —
      // donc chercher le titre seul rendrait introuvable tout ce que la
      // bibliothèque produit d'elle-même.
      where.AND.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { uploader: { username: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    const audios = await prisma.sound.findMany({
      where,
      orderBy: { usageCount: 'desc' },
      take: limit,
      include: soundUploaderInclude,
    });

    // Le tri reste sur `usageCount` (pistes) — c'est un classement interne.
    // Les compteurs AFFICHÉS sortent d'ailleurs et comptent des publications :
    // cf. `soundStats.ts` pour pourquoi les deux ne peuvent pas être le même
    // nombre.
    const stats = await loadSoundStats(prisma, audios.map((a) => a.id));

    return sendSuccess(reply, audios.map((a) => toDTO(a as unknown as Record<string, unknown>, stats.get(a.id))));
  });

  // GET /static/:filename — Serve uploaded story audio files (JWT-protected)
  fastify.get<{ Params: { filename: string } }>('/static/:filename', {
    preValidation: [requiredAuth],
    // already-compressed audio binary — never recompressed (Traefik excludedContentTypes)
    // Généreux : une story enchaîne plusieurs pistes, et le client ne met en
    // cache que `private, max-age=3600`.
    config: { rateLimit: createSoundRouteRateLimitConfig('stream') },
  }, async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
    const { filename } = request.params;

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_AUDIO_EXT.has(ext)) {
      return sendBadRequest(reply, 'Invalid file type', { code: 'INVALID_FILE_TYPE' });
    }

    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safeName);

    // LIMITE ASSUMÉE : le PostMedia SOURCE reste servi par `/attachments/file/*`
    // (sans authentification) et par nginx en cache immutable. Couper un son
    // arrête la copie de bibliothèque, pas l'original du post. Le retrait
    // complet suppose de supprimer le média source — lot 2.
    // `mutedAt` doit arrêter la DIFFUSION, pas seulement masquer la métadonnée.
    //
    // ÉGALITÉ, pas `endsWith` : le suffixe n'est pas indexable et faisait un
    // SCAN DE COLLECTION à chaque lecture audio. Les deux chemins de création
    // (upload manuel et capture) écrivent `fileUrl` via `staticFileUrl`, donc
    // l'URL exacte se reconstruit ici — et `@@index([fileUrl])` la sert.
    let muted: { id: string } | null = null;
    try {
      muted = await prisma.sound.findFirst({
        where: { fileUrl: staticFileUrl(safeName), mutedAt: { not: null } },
        select: { id: true },
      });
    } catch (err) {
      // ÉCHEC FERMÉ, et assumé : `mutedAt` est un interrupteur DMCA/modération.
      // Servir le fichier parce que la base n'a pas répondu diffuserait
      // précisément ce qu'un ayant droit a fait couper. 503 explicite plutôt
      // qu'une 500 anonyme — et la route n'est de toute façon atteignable que
      // si l'authentification a abouti.
      request.log.error({ err, filename: safeName }, 'static: mute lookup failed');
      return sendError(reply, 503, 'Sound availability cannot be verified', { code: 'SOUND_LOOKUP_FAILED' });
    }
    if (muted) {
      return sendError(reply, 410, 'Sound is no longer available', { code: 'SOUND_MUTED' });
    }

    try {
      await fs.access(filePath);
    } catch {
      return sendNotFound(reply, 'Audio file not found', { code: 'FILE_NOT_FOUND' });
    }

    const contentType = EXT_TO_MIME[ext] ?? 'application/octet-stream';
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(await fs.readFile(filePath));
  });
}
