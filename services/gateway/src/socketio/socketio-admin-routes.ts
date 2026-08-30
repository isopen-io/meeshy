/**
 * Les deux gestes d'administration Socket.IO — statistiques et déconnexion
 * forcée — déclarés comme un PLUGIN Fastify, montable par qui de droit.
 *
 * ## Pourquoi ils ont quitté `MeeshySocketIOHandler`
 *
 * Ils y étaient déclarés en ligne, au milieu de `setupSocketIO()`, sur
 * l'instance racine que `server.ts` lui remet. Cette méthode est appelée par
 * `MeeshyServer.start()` AVANT `setupRoutes()`, donc HORS de
 * `registerAllRoutes` — le seul graphe que `route-manifest/collect.ts` monte.
 * Résultat : quatre routes SERVIES en production et absentes du manifeste
 * (#4276), du catalogue client qui en dérive (#4280) et de tout audit qui s'y
 * appuie. Le cliquet du manifeste ne pouvait rien y voir : il compare
 * l'artefact commité à une régénération fraîche, et les deux sortent du MÊME
 * montage incomplet — deux mesures d'accord, aveugles au même endroit (#4376).
 *
 * Le correctif n'est pas de recopier ces déclarations dans le collecteur :
 * deux montages jetables divergent tôt ou tard, et c'est la classe de défaut
 * que `collect.ts` existe précisément pour fermer (voir sa note de module).
 * Il est d'en faire UN plugin, que le serveur de production et le collecteur
 * montent tous les deux — un seul site à changer, donc aucun à oublier.
 *
 * ## Pourquoi le manager arrive par une FONCTION, jamais par une valeur
 *
 * En production, le plugin est monté par `setupSocketIO()` juste après la
 * construction du manager ; le collecteur, lui, n'en a aucun et n'appellera
 * jamais un handler — il ne lit que la table des routes. Un accesseur
 * (`() => manager | null`) sert les deux sans que le second ait à fabriquer un
 * faux manager, et sans figer la référence au moment du montage.
 *
 * Le TYPE est STRUCTUREL, et c'est délibéré : importer `MeeshySocketIOManager`
 * ici ferait entrer tout son graphe (ZMQ, Redis, Firebase, ~119 Ko) dans le
 * collecteur, qui tourne aussi bien sous `tsx` (le script de génération) que
 * sous Jest (le cliquet). Ce plugin n'a besoin que de deux méthodes.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { apiPath } from '@meeshy/shared/api/prefix';
import { requireAdmin } from '../middleware/auth';
import { depreciee, dateDeRetrait } from '../utils/deprecation';
import { logger } from '../utils/logger';

/**
 * Le jour où l'adresse versionnée devient LA surface des deux gestes
 * d'administration Socket.IO.
 */
export const DEPUIS_SOCKETIO_NON_VERSIONNE = '2026-08-30';

/**
 * Les deux gestes, déclarés UNE fois : le relatif, dont l'adresse canonique et
 * l'alias dérivent tous les deux.
 *
 * L'adresse canonique passe par `apiPath()` — source unique du préfixe — parce
 * que la version d'API est une CONFIGURATION : elle peut devenir `/api/v2`, ou
 * se déplacer vers `api.domaine.tld/v2/`. Ces deux routes portaient leur chemin
 * EN DUR, sans version : sur les seize routes du dépôt hors `/api/v1`, treize
 * sont des alias dépréciés qui annoncent leur successeur et deux sont des
 * sondes d'infrastructure (`/health`, `/info`) légitimement hors version.
 * Celles-ci n'étaient ni l'un ni l'autre.
 */
export const GESTES_SOCKETIO = {
  stats: '/socketio/stats',
  disconnectUser: '/socketio/disconnect-user',
} as const;

/**
 * L'ancienne adresse reste servie et l'ANNONCE, plutôt que de disparaître.
 *
 * Aucun client ne l'appelle — mesuré sur les quatre surfaces. Ce n'est pas une
 * raison suffisante : le dépôt ne retire pas une adresse sur une revue de code
 * client, mais sur un compteur d'accès nul (#4275). Une console
 * d'administration tierce, un signet, un script d'exploitation ne sont dans
 * aucun `grep`.
 */
function aliasNonVersionne(relatif: string) {
  return depreciee({
    depuis: DEPUIS_SOCKETIO_NON_VERSIONNE,
    successeur: apiPath(relatif),
    retraitLe: dateDeRetrait(DEPUIS_SOCKETIO_NON_VERSIONNE),
  });
}

/**
 * Ce que ces deux gestes exigent du manager — rien de plus.
 *
 * Contrat de COMPORTEMENT (deux verbes), donc `interface` et non `type` :
 * `MeeshySocketIOManager` le satisfait structurellement, sans le déclarer ni
 * être importé ici.
 */
export interface SocketIOAdminManager {
  getStats(): Record<string, unknown>;
  disconnectUser(userId: string): boolean;
}

export interface SocketIOAdminRoutesOptions {
  /** Le manager COURANT — `null` tant qu'aucun n'est construit (le collecteur de manifeste n'en a jamais). */
  readonly getManager: () => SocketIOAdminManager | null;
}

/**
 * Monte les deux gestes, chacun sous son adresse canonique et son alias
 * déprécié. Le corps de chaque geste est écrit UNE fois — les deux adresses le
 * partagent, pour qu'un correctif ne puisse pas n'atteindre qu'une des deux.
 */
export async function socketIOAdminRoutes(
  fastify: FastifyInstance,
  options: SocketIOAdminRoutesOptions
): Promise<void> {
  const gardesAdmin = [
    (req: FastifyRequest, rep: FastifyReply) => fastify.authenticate(req, rep),
    requireAdmin,
  ];

  const servirStats = async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = options.getManager().getStats();
      reply.send({
        success: true,
        data: {
          ...stats,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Erreur récupération stats Socket.IO:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur serveur lors de la récupération des statistiques',
      });
    }
  };

  fastify.get(apiPath(GESTES_SOCKETIO.stats), { preHandler: gardesAdmin }, servirStats);
  fastify.get('/api' + GESTES_SOCKETIO.stats, {
    onRequest: aliasNonVersionne(GESTES_SOCKETIO.stats),
    preHandler: gardesAdmin,
  }, servirStats);

  const servirDeconnexion = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.body as { userId: string };

      if (!userId) {
        return reply.status(400).send({
          success: false,
          error: 'userId requis',
        });
      }

      const manager = options.getManager();
      if (manager) {
        const disconnected = manager.disconnectUser(userId);
        if (disconnected) {
          reply.send({
            success: true,
            message: `Utilisateur ${userId} déconnecté`,
          });
        } else {
          reply.status(404).send({
            success: false,
            error: `Utilisateur ${userId} non trouvé ou non connecté`,
          });
        }
      } else {
        reply.status(500).send({
          success: false,
          error: 'Socket.IO non initialisé',
        });
      }
    } catch (error) {
      logger.error('Erreur déconnexion utilisateur:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur serveur lors de la déconnexion',
      });
    }
  };

  fastify.post(apiPath(GESTES_SOCKETIO.disconnectUser), { preHandler: gardesAdmin }, servirDeconnexion);
  fastify.post('/api' + GESTES_SOCKETIO.disconnectUser, {
    onRequest: aliasNonVersionne(GESTES_SOCKETIO.disconnectUser),
    preHandler: gardesAdmin,
  }, servirDeconnexion);
}
