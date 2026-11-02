/**
 * Les packs de CADRES DE GLOIRE — `/packs/glory-frame` (#10148, LP0, § 5.10.4).
 *
 *   - `GET    /packs/glory-frame`                 la boutique, dans l'ordre éditorial ;
 *   - `GET    /packs/glory-frame/installed`       les packs installés ;
 *   - `GET    /packs/glory-frame/:slug`           un pack, son contrat et ses chaînes (masqué compris, en lecture) ;
 *   - `PUT    /packs/glory-frame/:slug/install`   l'installer ; `DELETE` le retirer (409 `PACK_NOT_REMOVABLE`).
 *
 * Produites par la fabrique commune (`registerPackRoutes`) sur la spec
 * `glory-frame` : aucune proposition par des tiers, donc ni `/submissions`,
 * ni `/pending`, ni `/:slug/review`. Le registre (`PackIndex`, lu au
 * démarrage) reste VIDE jusqu'au L3 : la boutique répond `[]` et toute
 * installation 404 — y compris `mee`, slug valide d'un AUTRE domaine.
 */
import type { FastifyInstance } from 'fastify';
import { PACK_LANGUAGES } from '@meeshy/shared/types/content-pack';

import { PackCatalog } from '../services/packs/PackCatalog';
import { startupPackIndex, type PackIndex } from '../services/packs/PackIndex';
import { gloryFramePackSpec, type FramePackDetail, type FramePackSummary } from '../services/packs/gloryFramePackSpec';
import { atmosphereRemovalGuard } from '../services/game/GamePhotoService';
import { packInstallationBroadcaster, packRouteGuard, registerPackRoutes } from './pack-routes';

export const PACK_ERROR_CODES = {
  NOT_FOUND: 'PACK_NOT_FOUND',
  NOT_REMOVABLE: 'PACK_NOT_REMOVABLE',
} as const;

const assetRefJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { src: { type: 'string' }, bytes: { type: 'integer' }, sha256: { type: 'string' } },
} as const;

const byLanguage = (value: object) => ({
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(PACK_LANGUAGES.map((language) => [language, value])),
});

/** L'union `FrameUsage` déclarée en SUR-ENSEMBLE : un champ absent d'une variante n'est pas fabriqué, un champ présent n'est jamais retiré. */
const frameUsageJsonSchema = {
  type: 'object',
  nullable: true,
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['free', 'rank', 'prestige', 'achievement', 'moment'] },
    surfaces: { type: 'array', items: { type: 'string' } },
    rank: { type: 'string' },
    division: { type: 'integer' },
    rarity: { type: 'string' },
    family: { type: 'string' },
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
  coverUrl: { type: 'string', nullable: true, description: 'Servi par GET /api/v1/pack-assets/<sha16>.<ext> (L5)' },
  installed: { type: 'boolean' },
  installCount: { type: 'integer' },
  domain: { type: 'string', enum: ['sticker', 'glory-frame', 'capture-frame'] },
  origin: { type: 'string', enum: ['builtin', 'official', 'community'] },
  version: { type: 'integer' },
  downloadBytes: {
    type: 'object',
    nullable: true,
    additionalProperties: false,
    properties: { story: { type: 'integer' }, square: { type: 'integer', nullable: true } },
  },
  removable: { type: 'boolean' },
  names: byLanguage({ type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, description: { type: 'string' } } }),
  preview: { ...assetRefJsonSchema, nullable: true },
  previewUrl: {
    type: 'string',
    nullable: true,
    description: 'L’atlas des vignettes du pack (#10275), servi par GET /api/v1/pack-assets/<sha16>.webp, immuable : le pack se montre sans s’installer. null sans atlas, ou au-delà de 256 Kio',
  },
  usage: frameUsageJsonSchema,
} as const;

export const framePackSummaryJsonSchema = { type: 'object', additionalProperties: false, properties: summaryProperties } as const;

export const framePackDetailJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...summaryProperties,
    contractSchema: { type: 'integer' },
    contract: assetRefJsonSchema,
    strings: byLanguage(assetRefJsonSchema),
    collections: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, properties: { slug: { type: 'string' }, usage: frameUsageJsonSchema } },
    },
  },
} as const;

export type GloryFramePacksRoutesOptions = {
  readonly catalog?: PackCatalog<FramePackSummary, FramePackDetail>;
  readonly index?: PackIndex;
};

export async function gloryFramePacksRoutes(fastify: FastifyInstance, options: GloryFramePacksRoutesOptions = {}) {
  const catalog =
    options.catalog ??
    new PackCatalog({
      prisma: fastify.prisma,
      // Le pack de l'atmosphère choisie ne se retire pas tant qu'elle l'est (#10162, PP7).
      spec: gloryFramePackSpec({ index: options.index ?? startupPackIndex(), removalGuard: atmosphereRemovalGuard(fastify.prisma) }),
      broadcast: packInstallationBroadcaster(fastify),
    });

  registerPackRoutes(fastify, {
    catalog,
    guard: packRouteGuard(fastify, { internalErrorMessage: 'Error handling frame packs' }),
    basePath: '/packs/glory-frame',
    tags: ['packs'],
    summaryJsonSchema: framePackSummaryJsonSchema,
    detailJsonSchema: framePackDetailJsonSchema,
    notFound: { message: 'Pack not found', code: PACK_ERROR_CODES.NOT_FOUND },
    notRemovable: { message: 'This pack cannot be removed', code: PACK_ERROR_CODES.NOT_REMOVABLE },
    texts: {
      list: {
        description:
          'La boutique des packs de cadres de gloire (#10148) : les packs officiels dans l’ordre éditorial, avec leur état d’installation, leur poids et l’usage de leurs cadres (rang, prestige, succès, moment).',
        summary: 'List glory frame packs',
      },
      installed: { description: 'Les packs de cadres de gloire installés par l’appelant (#10148), masqués compris.', summary: 'List my installed glory frame packs' },
      detail: {
        description:
          'Un pack de cadres de gloire (#10148) : son contrat et ses chaînes adressés par contenu, l’usage de chaque collection. Un pack masqué reste servi en lecture, pour qu’une photo gardée se reprenne.',
        summary: 'Get a glory frame pack',
      },
      install: { description: 'Installe un pack de cadres de gloire (#10148). 404 pour un pack inconnu ou masqué.', summary: 'Install a glory frame pack' },
      uninstall: {
        description:
          'Retire un pack de cadres de gloire (#10148). 409 `PACK_NOT_REMOVABLE` pour un pack non retirable, ou celui de l’atmosphère choisie (#10162).',
        summary: 'Uninstall a glory frame pack',
      },
    },
  });
}
