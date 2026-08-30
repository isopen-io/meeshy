/**
 * Point d'entrée principal pour les routes d'attachments
 * Enregistre tous les sous-modules de routes
 */

import { apiPath } from '@meeshy/shared/api/prefix';
import { dateDeRetrait, depreciee } from '../../utils/deprecation';
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
 * ## Il DIT désormais qu'il est en sursis (#4324)
 *
 * Sa raison de vivre était écrite au site de montage : « des `fileUrl` de cette
 * forme sont persistées en base depuis des années ». La migration 013 les a
 * réécrites en clés de stockage — cette raison a disparu.
 *
 * Ce qui reste sont les notifications DÉJÀ LIVRÉES, qui portent des adresses de
 * cette forme et qu'aucun déploiement ne rattrape. L'alias ne se retire donc pas
 * aujourd'hui : il s'annonce, et son retrait se décidera sur le compteur d'accès
 * (#4275) plutôt que sur une revue de code.
 *
 * L'annonce est posée en `onRequest`, donc AVANT le handler : elle part même
 * quand le fichier est introuvable, parce que c'est l'ADRESSE qui est en sursis,
 * pas sa réponse de succès.
 *
 * @deprecated Chemin de compatibilité. La bascule en redirection 308 et la
 * fermeture du magasin public restent des chantiers séparés (`media.md`).
 */
export async function attachmentLegacyFileRoutes(fastify: FastifyInstance) {
  fastify.addHook(
    'onRequest',
    depreciee({
      depuis: DEPUIS_ALIAS_NON_VERSIONNE,
      // Le chemin RÉEL de l'appel, jamais un gabarit : le client doit pouvoir
      // suivre le `Link` tel quel. `request.url` porte ici le préfixe `/api` du
      // montage ; le retirer rend le chemin relatif que `apiPath` versionne.
      successeur: (request) =>
        apiPath(request.url.slice(LEGACY_UNVERSIONED_PREFIX.length).split('?')[0] ?? '/'),
      retraitLe: dateDeRetrait(DEPUIS_ALIAS_NON_VERSIONNE),
    })
  );
  registerFileStreamRoute(fastify);
}

const DEPUIS_ALIAS_NON_VERSIONNE = '2026-08-30';

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
