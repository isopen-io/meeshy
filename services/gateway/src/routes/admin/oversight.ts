import type { FastifyInstance } from 'fastify';

/**
 * Le montage des surfaces de SUPERVISION de l'administration (#8876).
 *
 * Quatre modules, un seul enregistrement dans `ROUTE_TABLE` : la table dit
 * « une surface de supervision sous `/admin` », et le détail de ce qu'elle porte
 * vit ici. Chaque module déclare sa propre garde AU NIVEAU DE LA ROUTE — ce
 * fichier n'en décide aucune.
 */
export async function adminOversightRoutes(_fastify: FastifyInstance): Promise<void> {
  // Les quatre modules s'enregistrent ici, un par un, au fil de leur livraison.
}
