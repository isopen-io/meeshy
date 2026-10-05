import type { FastifyInstance } from 'fastify';
import { registerAuditLogRoutes } from './audit-logs';
import { registerCommunityOversightRoutes } from './communities-oversight';
import { registerMonitoringRoutes } from './monitoring';
import { registerTrackingLinkAdminRoutes } from './tracking-links';

/**
 * Le montage des surfaces de SUPERVISION de l'administration (#8876).
 *
 * Quatre modules, un seul enregistrement dans `ROUTE_TABLE` : la table dit
 * « une surface de supervision sous `/admin` », et le détail de ce qu'elle porte
 * vit ici. Chaque module déclare sa propre garde AU NIVEAU DE LA ROUTE — ce
 * fichier n'en décide aucune.
 */
export async function adminOversightRoutes(fastify: FastifyInstance): Promise<void> {
  registerAuditLogRoutes(fastify);
  registerTrackingLinkAdminRoutes(fastify);
  registerCommunityOversightRoutes(fastify);
  registerMonitoringRoutes(fastify);
}
