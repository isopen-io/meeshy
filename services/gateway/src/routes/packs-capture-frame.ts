/**
 * Les packs de CADRES DE CAPTURE — `/packs/capture-frame` (#10169, lot LC, PP4).
 *
 *   - `GET    /packs/capture-frame`                 la boutique des douze ambiances, dans l'ordre du catalogue ;
 *   - `GET    /packs/capture-frame/installed`       les ambiances installées (toutes, tant qu'aucune n'est retirée) ;
 *   - `GET    /packs/capture-frame/:slug`           une ambiance, son contrat adressé par contenu ;
 *   - `PUT    /packs/capture-frame/:slug/install`   la réinstaller ; `DELETE` la retirer (sa puce se cache).
 *
 * Produites par la fabrique commune (`registerPackRoutes`) sur la spec
 * `capture-frame` : un montage PAR DOMAINE, jamais un `:domain`. Aucune
 * proposition par des tiers (#10186), donc ni `/submissions`, ni `/pending`,
 * ni `/:slug/review`. Installer ne télécharge rien (#10187) : les cadres sont
 * embarqués dans chaque client. Les réponses partagent le schéma des packs de
 * cadres (`framePackSummaryJsonSchema`), l'usage y étant libre (`free`).
 */
import type { FastifyInstance } from 'fastify';

import { PackCatalog } from '../services/packs/PackCatalog';
import { startupPackIndex, type PackIndex } from '../services/packs/PackIndex';
import { captureFramePackSpec } from '../services/packs/captureFramePackSpec';
import type { FramePackDetail, FramePackSummary } from '../services/packs/gloryFramePackSpec';
import { packInstallationBroadcaster, packRouteGuard, registerPackRoutes } from './pack-routes';
import { PACK_ERROR_CODES, framePackDetailJsonSchema, framePackSummaryJsonSchema } from './packs-glory-frame';

export type CaptureFramePacksRoutesOptions = {
  readonly catalog?: PackCatalog<FramePackSummary, FramePackDetail>;
  readonly index?: PackIndex;
};

export async function captureFramePacksRoutes(fastify: FastifyInstance, options: CaptureFramePacksRoutesOptions = {}) {
  const catalog =
    options.catalog ??
    new PackCatalog({
      prisma: fastify.prisma,
      spec: captureFramePackSpec({ index: options.index ?? startupPackIndex() }),
      broadcast: packInstallationBroadcaster(fastify),
    });

  registerPackRoutes(fastify, {
    catalog,
    guard: packRouteGuard(fastify, { internalErrorMessage: 'Error handling capture frame packs' }),
    basePath: '/packs/capture-frame',
    tags: ['packs'],
    summaryJsonSchema: framePackSummaryJsonSchema,
    detailJsonSchema: framePackDetailJsonSchema,
    notFound: { message: 'Pack not found', code: PACK_ERROR_CODES.NOT_FOUND },
    notRemovable: { message: 'This pack cannot be removed', code: PACK_ERROR_CODES.NOT_REMOVABLE },
    texts: {
      list: {
        description:
          'La boutique des ambiances de cadres de capture (#10169) : douze packs intégrés, installés d’office et retirables, avec l’usage de leurs cadres (appel vidéo, photo, vidéo). Rien à télécharger.',
        summary: 'List capture frame packs',
      },
      installed: { description: 'Les ambiances de cadres de capture installées par l’appelant (#10169) : celles dont les puces se proposent.', summary: 'List my installed capture frame packs' },
      detail: { description: 'Une ambiance de cadres de capture (#10169) : son contrat (le fichier d’ambiance) adressé par contenu.', summary: 'Get a capture frame pack' },
      install: { description: 'Réinstalle une ambiance de cadres de capture (#10169) : ses puces se proposent de nouveau. 404 pour une ambiance inconnue.', summary: 'Install a capture frame pack' },
      uninstall: {
        description: 'Retire une ambiance de cadres de capture (#10169) : ses puces se cachent ; un cadre choisi par un pair ou porté par un brouillon se rend encore.',
        summary: 'Uninstall a capture frame pack',
      },
    },
  });
}
