/**
 * LA VITRINE UNIQUE — `GET /packs/shop` (#10632, § 4.4) : une seule boutique,
 * filtrable par domaine (`?domains=wallpaper,banner`, absent = tous les
 * domaines servis). Elle AGRÈGE les `catalogue(userId)` des domaines montés,
 * dans l'ordre de `PACK_DOMAINS`, sans logique propre, et ajoute le solde de
 * Meeshes (lu au registre) pour afficher « 12 Meeshes » sans second appel.
 *
 * Un domaine inconnu de `domains` est IGNORÉ, jamais un 400 : un client plus
 * récent ne casse pas un serveur plus ancien. Un ancien serveur répond 404 ici,
 * et les clients retombent sur les boutiques par domaine.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { PACK_DOMAINS, isPackDomain, type PackDomain } from '@meeshy/shared/types/content-pack';
import { isCommunityAppearanceDomain } from '@meeshy/shared/types/community-appearance-pack';

import { MeeshSpend } from '../services/game/MeeshSpend';
import { PackCatalog } from '../services/packs/PackCatalog';
import { prismaCommunityAppearanceStore } from '../services/packs/CommunityAppearancePacks';
import { startupPackIndex, type PackIndex } from '../services/packs/PackIndex';
import { appearancePackSpec, APPEARANCE_PACK_DOMAINS } from '../services/packs/appearancePackSpec';
import { gloryFramePackSpec } from '../services/packs/gloryFramePackSpec';
import { captureFramePackSpec } from '../services/packs/captureFramePackSpec';
import { stickerPackSpec } from '../services/packs/stickerPackSpec';
import { builtinStickerPackNames } from '../services/packs/stickerPackNames';
import { sendSuccess } from '../utils/response.js';
import { packEnvelope, packRouteGuard } from './pack-routes';
import { lensPackCatalog } from './packs-lens';

export type ShopCatalog = { catalogue(userId: string): Promise<readonly object[]> };

export type PacksShopRoutesOptions = {
  readonly catalogs?: Readonly<Partial<Record<PackDomain, ShopCatalog>>>;
  readonly balance?: (userId: string) => Promise<number>;
  readonly index?: PackIndex;
};

const shopResponseJsonSchema = packEnvelope({
  type: 'object',
  properties: {
    domains: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          domain: { type: 'string' },
          packs: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
    },
    balance: { type: 'number' },
  },
});

/** Un pack de stickers INTÉGRÉ est inclus : jamais retirable, et nommé dans les sept langues (#10738). */
const includedStickerPack = (domain: PackDomain, pack: object): Record<string, unknown> => {
  const { slug, builtin } = pack as { readonly slug?: string; readonly builtin?: boolean };
  if (domain !== 'sticker' || builtin !== true || slug === undefined) return {};
  const names = builtinStickerPackNames(slug);
  return { removable: false, ...(names === null ? {} : { names }) };
};

export const parseShopDomains = (raw: string | undefined): readonly PackDomain[] | null => {
  if (raw === undefined || raw.trim() === '') return null;
  return raw.split(',').map((part) => part.trim()).filter(isPackDomain);
};

export async function packsShopRoutes(fastify: FastifyInstance, options: PacksShopRoutesOptions = {}) {
  const index = options.index ?? startupPackIndex();
  const defaults = (): Readonly<Partial<Record<PackDomain, ShopCatalog>>> => ({
    sticker: new PackCatalog({ prisma: fastify.prisma, spec: stickerPackSpec(fastify.prisma) }),
    'glory-frame': new PackCatalog({ prisma: fastify.prisma, spec: gloryFramePackSpec({ index }) }),
    'capture-frame': new PackCatalog({ prisma: fastify.prisma, spec: captureFramePackSpec({ index }) }),
    ...Object.fromEntries(
      APPEARANCE_PACK_DOMAINS.map((domain) => [
        domain,
        new PackCatalog({ prisma: fastify.prisma, spec: appearancePackSpec({ index, domain, ...(isCommunityAppearanceDomain(domain) ? { community: prismaCommunityAppearanceStore(fastify.prisma, domain) } : {}) }) }),
      ]),
    ),
    lens: lensPackCatalog(fastify).catalog,
  });
  const catalogs = options.catalogs ?? defaults();
  const balance = options.balance ?? ((userId: string) => new MeeshSpend(fastify.prisma).balance(userId));
  const guard = packRouteGuard(fastify, { internalErrorMessage: 'Error handling the pack shop' });

  fastify.get<{ Querystring: { domains?: string } }>(
    '/',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'La vitrine unique (#10632) : les boutiques de tous les domaines servis, filtrables par `domains`, avec le solde de Meeshes.',
        tags: ['packs'],
        summary: 'The unified pack shop',
        querystring: { type: 'object', properties: { domains: { type: 'string', maxLength: 200 } } },
        response: { 200: shopResponseJsonSchema, 401: errorResponseSchema, 403: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    guard('[GET /packs/shop]', async (request: FastifyRequest<{ Querystring: { domains?: string } }>, reply, viewer) => {
      const wanted = parseShopDomains(request.query.domains);
      const served = PACK_DOMAINS.filter((domain) => catalogs[domain] !== undefined && (wanted === null || wanted.includes(domain)));
      const [packs, solde] = await Promise.all([
        Promise.all(served.map(async (domain) => ({ domain, packs: (await (catalogs[domain] as ShopCatalog).catalogue(viewer.userId)).map((pack) => ({ domain, ...pack, ...includedStickerPack(domain, pack) })) }))),
        balance(viewer.userId),
      ]);
      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, { domains: packs, balance: solde });
    }),
  );
}
