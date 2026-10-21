/**
 * `GET /api/v1/pack-assets/:file` (#10157, L5, § 5.11) — le magasin ADRESSÉ PAR
 * CONTENU des packs officiels et intégrés, tous domaines : couvertures,
 * vignettes, atlas, contrats et chaînes, `<sha16>.<ext>`.
 *
 * PUBLIC par conception : un fichier adressé par son empreinte ne dit rien de
 * qui le demande, et le web le lit en `fetch(url, { mode: 'cors' })` sans
 * aucun en-tête (un en-tête personnalisé déclencherait un preflight). Ce qui
 * garde la porte est la LISTE BLANCHE, calculée une fois au démarrage par
 * `PackIndex` (registres courants, contrats lus, `retained.json`) : toute autre
 * forme — empreinte inconnue, majuscules, autre extension, `..` — répond 404,
 * même si le fichier est sur le disque. Aucune lecture de base par requête.
 *
 * Immuable (`max-age` d'un an) avec un ETag FORT égal à l'empreinte ;
 * `nosniff` ; `Cross-Origin-Resource-Policy: cross-origin` et
 * `Access-Control-Allow-Origin: *` posés par un hook `onSend` synchrone, comme
 * `routes/attachments/download.ts`, et DÉCLARÉS dans `PORTES_HORS_REGLE`.
 *
 * Un seau de débit PROPRE (`config.rateLimit`), monté par `@fastify/rate-limit`
 * à la place du plafond global : derrière un CGNAT mobile, les GET de
 * vignettes ne mangent pas le seau des appels d'API, et la route garde une
 * protection — jamais une exemption.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { CommunityAppearancePacks } from '../services/packs/CommunityAppearancePacks';
import { resolvePackAssetsDir, startupPackIndex, type PackIndex } from '../services/packs/PackIndex';
import { ifNoneMatchMatches } from '../utils/etag';
import { enhancedLogger } from '../utils/logger-enhanced';
import { sendNotFound } from '../utils/response';

const logger = enhancedLogger.child({ module: 'PackAssetsRoutes' });

export const PACK_ASSETS_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Par IP et par minute : une boutique ouverte demande une couverture par pack et quelques vignettes — généreux, jamais illimité. */
export const PACK_ASSETS_RATE_LIMIT_MAX = 600;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  webp: 'image/webp',
  png: 'image/png',
  json: 'application/json; charset=utf-8',
  woff2: 'font/woff2',
};

const NOT_FOUND_CODE = 'PACK_ASSET_NOT_FOUND';

/** Les contrats tiers sont des `<sha16>.json` en minuscules : toute autre forme ne touche jamais la base. */
const COMMUNITY_CONTRACT = /^[0-9a-f]{16}\.json$/;

export type PackAssetsRoutesOptions = {
  readonly index?: PackIndex;
  readonly assetsDir?: string;
  /** Les contrats des packs de vendeurs tiers PUBLIÉS (#10709) : la seule lecture de base de cette route, réservée à une empreinte `.json` hors liste blanche. */
  readonly community?: Pick<CommunityAppearancePacks, 'approvedContract'>;
};

type FileRequest = FastifyRequest<{ Params: { file: string } }>;

/** Les médias de pack sont EMBARQUÉS par le web depuis meeshy.me sur gate.meeshy.me — voir `PORTES_HORS_REGLE`. */
function crossOriginPackHeaders(_request: FastifyRequest, reply: FastifyReply, payload: unknown, done: (err: Error | null, payload?: unknown) => void) {
  reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
  reply.header('Access-Control-Allow-Origin', '*');
  done(null, payload);
}

const extensionOf = (file: string): string => file.slice(file.lastIndexOf('.') + 1);
const fingerprintOf = (file: string): string => file.slice(0, file.indexOf('.'));

export async function packAssetsRoutes(fastify: FastifyInstance, options: PackAssetsRoutesOptions = {}) {
  const index = options.index ?? startupPackIndex();
  const assetsDir = options.assetsDir ?? resolvePackAssetsDir();
  const community = options.community ?? new CommunityAppearancePacks({ prisma: fastify.prisma, index });

  fastify.get(
    '/:file',
    {
      onSend: crossOriginPackHeaders,
      schema: {
        description:
          'Un fichier d’un pack officiel ou intégré (#10157), adressé par son contenu : `<sha16>.webp|png|json|woff2`. Public, immuable, ETag fort égal à l’empreinte. 404 pour tout fichier hors de la liste blanche calculée au démarrage depuis les registres des packs.',
        tags: ['packs'],
        summary: 'Get a pack asset',
        params: { type: 'object', required: ['file'], properties: { file: { type: 'string', maxLength: 32 } } },
        response: {
          200: { description: 'Les octets du fichier, tels qu’adressés par leur empreinte', type: 'string', format: 'binary' },
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
      config: {
        rateLimit: {
          max: PACK_ASSETS_RATE_LIMIT_MAX,
          timeWindow: '1 minute',
          hook: 'onRequest' as const,
          skipOnError: true,
          keyGenerator: (request: FastifyRequest) => `pack-assets:ip:${request.ip}`,
          errorResponseBuilder: () => ({
            success: false,
            statusCode: 429,
            error: 'RATE_LIMIT_EXCEEDED',
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many pack asset requests. Please try again later.',
          }),
        },
      },
    },
    async (request: FileRequest, reply: FastifyReply) => {
      const { file } = request.params;
      if (!index.isServedAsset(file)) {
        const contract = COMMUNITY_CONTRACT.test(file) ? await community.approvedContract(file) : null;
        if (contract === null) return sendNotFound(reply, 'Pack asset not found', { code: NOT_FOUND_CODE });
        const communityEtag = `"${fingerprintOf(file)}"`;
        reply.header('ETag', communityEtag);
        reply.header('Cache-Control', PACK_ASSETS_CACHE_CONTROL);
        reply.header('X-Content-Type-Options', 'nosniff');
        if (ifNoneMatchMatches(request.headers['if-none-match'], communityEtag)) return reply.code(304).send();
        return reply.type(CONTENT_TYPES.json).send(contract);
      }
      const etag = `"${fingerprintOf(file)}"`;
      reply.header('ETag', etag);
      reply.header('Cache-Control', PACK_ASSETS_CACHE_CONTROL);
      reply.header('X-Content-Type-Options', 'nosniff');
      if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      const bytes = await readFile(join(assetsDir, file)).catch((error: unknown) => {
        logger.warn('Pack asset listed but unreadable', { file, error: error instanceof Error ? error.message : String(error) });
        return null;
      });
      if (bytes === null) {
        reply.removeHeader('ETag');
        reply.removeHeader('Cache-Control');
        return sendNotFound(reply, 'Pack asset not found', { code: NOT_FOUND_CODE });
      }
      return reply.type(CONTENT_TYPES[extensionOf(file)]).send(bytes);
    },
  );
}
