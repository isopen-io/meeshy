/**
 * Point d'entrée principal pour les routes d'attachments
 * Enregistre tous les sous-modules de routes
 */

import type { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { AttachmentTranslateService } from '../../services/AttachmentTranslateService';
import { registerUploadRoutes } from './upload';
import { registerDownloadRoutes, registerFileStreamRoute } from './download';
import { registerMetadataRoutes } from './metadata';
import { registerTranslationRoutes } from './translation';

/**
 * Le préfixe NON VERSIONNÉ sous lequel des `fileUrl` sont persistées en base
 * depuis des années (`/api/attachments/file/…`) et voyagent dans des
 * notifications déjà livrées. Une URL en base ne se migre pas par un
 * déploiement : ce montage doit survivre — mais RIEN d'autre que la lecture
 * d'octets ne doit y survivre avec lui.
 */
const LEGACY_UNVERSIONED_PREFIX = '/api';

/**
 * L'ALIAS legacy, DÉCLARÉ : le seul couple encore servi sous `/api`.
 *
 * Même implémentation que sous `/api/v1` — `registerFileStreamRoute` est le
 * site unique du handler, jamais une copie. Ce plugin existe pour que le site
 * de montage puisse NOMMER ce qu'il monte ; `attachmentRoutes` s'y ramène de
 * lui-même (voir plus bas), de sorte que la restriction tienne quel que soit
 * le site de montage.
 *
 * @deprecated Chemin de compatibilité. La bascule de `file/*` en redirection
 * 308 vers `/api/v1`, la migration de la colonne `fileUrl` et la fermeture du
 * magasin public sont des chantiers séparés (`media.md`, étapes 3 à 6).
 */
export async function attachmentLegacyFileRoutes(fastify: FastifyInstance) {
  registerFileStreamRoute(fastify);
}

export async function attachmentRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  // Vérifier que prisma est bien défini
  if (!prisma) {
    throw new Error('[AttachmentRoutes] Prisma client is not available on fastify instance');
  }

  /**
   * Le montage non versionné n'expose QUE la lecture d'octets par chemin.
   *
   * Ce que le doublon coûtait : les dix couples d'`attachmentRoutes` étaient
   * servis DEUX fois — dont un `POST /attachments/upload` et un
   * `DELETE /attachments/:id`. Toute règle de proxy ou de WAF écrite pour
   * `/api/v1/attachments/*` ratait silencieusement `/api/attachments/*`, et une
   * garde posée d'un côté ne protégeait pas l'autre chemin.
   *
   * La restriction vit ICI, dans le plugin, et non au site de montage : le
   * doublon a précisément été créé par une ligne de `route-registration.ts`,
   * invisible à quiconque lisait ce module. Le module possède désormais sa
   * propre surface d'exposition — tout montage sous `/api`, présent ou futur,
   * d'où qu'il vienne, n'obtient que `file/*`.
   */
  if (fastify.prefix === LEGACY_UNVERSIONED_PREFIX) {
    await attachmentLegacyFileRoutes(fastify);
    return;
  }

  // Initialize translate service if ZMQ client is available via translationService
  let translateService: AttachmentTranslateService | null = null;
  const translationService = fastify.translationService;
  if (translationService) {
    const zmqClient = translationService.getZmqClient();
    if (zmqClient) {
      // Utiliser le cache multi-niveau partagé depuis le décorateur Fastify
      const jobMappingCache = fastify.jobMappingCache;

      translateService = new AttachmentTranslateService(
        prisma,
        zmqClient,
        jobMappingCache
      );
    }
  }

  // Middleware d'authentification optionnel (supporte JWT + Session anonyme)
  const authOptional = createUnifiedAuthMiddleware(prisma, {
    requireAuth: false,
    allowAnonymous: true
  });

  // Middleware d'authentification requise
  const authRequired = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Enregistrer tous les modules de routes en parallèle
  await Promise.all([
    registerUploadRoutes(fastify, authOptional, prisma),
    registerDownloadRoutes(fastify, prisma),
    registerMetadataRoutes(fastify, authRequired, authOptional, prisma),
    registerTranslationRoutes(fastify, authRequired, prisma, translateService),
  ]);
}

// Export des types pour utilisation externe
export * from './types';
