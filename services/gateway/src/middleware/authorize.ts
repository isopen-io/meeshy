import type { FastifyRequest, FastifyReply } from 'fastify';
import { UserRoleEnum } from '@meeshy/shared/types';
import { permissionsService, type AdminPermissions } from '../services/admin/permissions.service';
import type { UnifiedAuthRequest } from './auth';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'Authorize' });

/**
 * LE vocabulaire d'autorisation de l'administration — quatre verbes (#4153).
 *
 * ## Ce qu'il remplace
 *
 * TREIZE gardes locales, dont **sept nommées `requireAdmin`** appliquant
 * QUATRE lois différentes :
 *
 * | fichier | rôles réellement admis |
 * |---|---|
 * | `languages.ts`, `system-rankings.ts` | BIGBOSS, ADMIN, AUDIT, **ANALYST** |
 * | `anonymous-users.ts`, `messages.ts` | BIGBOSS, ADMIN, **MODERATOR**, AUDIT |
 * | `invitations.ts` | BIGBOSS, ADMIN |
 * | `posts.ts`, `content.ts` | `canAccessAdmin` de la matrice LOCALE |
 *
 * Six autres portaient d'autres noms pour le même office, et `agent.ts` /
 * `agent-topics.ts` en avaient DEUX COPIES divergentes.
 *
 * ## Le piège de l'homonymie
 *
 * `requireAnalyticsPermission` existait DEUX fois : ici, lisant la matrice, et
 * dans `analytics.ts`, rejouant la même liste en dur. Les deux admettaient les
 * mêmes rôles — et rien ne les tenait ensemble demain.
 *
 * > Un nom identique fait croire à une loi identique. La divergence ne se lit
 * > pas dans « qui appelle quoi » mais dans « qui appelle la MATRICE ».
 *
 * C'est la forme la plus coûteuse du défaut : elle ne produit aucun symptôme,
 * donc rien ne signale la dérive le jour où la matrice bouge.
 *
 * ## Une route nomme une PERMISSION, jamais des rôles
 *
 * Une liste de rôles est une loi écrite à l'endroit où on l'applique. Elle ne
 * peut pas être changée en un point, ne peut pas être relue en un point, et sa
 * divergence d'avec la matrice est invisible tant que personne ne compare.
 */

/** Le contexte d'un acteur d'administration, réduit à ce qui décide. */
type Acteur = { userId: string; role: UserRoleEnum } | null;

function acteur(request: FastifyRequest): Acteur {
  const ctx = (request as UnifiedAuthRequest).authContext;
  if (!ctx?.isAuthenticated || !ctx.registeredUser || ctx.isAnonymous) return null;
  return {
    userId: ctx.userId ?? ctx.registeredUser.id,
    role: (ctx.registeredUser.role ?? 'USER') as UserRoleEnum,
  };
}

function refuser(reply: FastifyReply, code: 401 | 403, message: string): void {
  reply.status(code).send({ success: false, error: message, message });
}

/**
 * Exige une PERMISSION nommée — le verbe ordinaire.
 *
 * Le message de refus NOMME la permission manquante. Un « Permission
 * insuffisante » nu, qui était le texte des treize gardes, oblige à lire le
 * code source pour savoir ce qui a manqué.
 */
export function requirePermission(permission: keyof AdminPermissions) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const moi = acteur(request);
    if (!moi) return refuser(reply, 401, 'Authentification requise');

    if (!permissionsService.hasPermission(moi.role, permission)) {
      return refuser(reply, 403, `Permission insuffisante : ${permission} requise`);
    }
  };
}

/**
 * Exige que l'acteur SURCLASSE sa cible — la garde de hiérarchie.
 *
 * Une permission dit ce qu'on peut faire ; elle ne dit pas SUR QUI. Sans cette
 * seconde question, un ADMIN peut agir sur un BIGBOSS dès lors qu'il porte
 * `canUpdateUsers` — la permission est vraie, et la cible est au-dessus de lui.
 *
 * L'identifiant de la cible se lit dans les paramètres de route : c'est le
 * seul endroit où il est déclaré, donc le seul où il ne peut pas manquer.
 */
export function requireHierarchy(options: { param?: string } = {}) {
  const nomDuParametre = options.param ?? 'userId';

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const moi = acteur(request);
    if (!moi) return refuser(reply, 401, 'Authentification requise');

    const cibleId = (request.params as Record<string, string> | undefined)?.[nomDuParametre];
    if (!cibleId) return refuser(reply, 403, 'Cible non nommée');

    // Agir sur SOI ne demande aucune hiérarchie : personne ne se surclasse.
    if (cibleId === moi.userId) return;

    const cible = await (request.server as unknown as {
      prisma: { user: { findUnique: (a: unknown) => Promise<{ role: string } | null> } };
    }).prisma.user.findUnique({ where: { id: cibleId }, select: { role: true } });

    // Une cible introuvable ne se laisse pas comparer : fail-CLOSED. Le 403
    // plutôt qu'un 404 — dire « ce compte n'existe pas » à qui n'a pas le droit
    // d'agir dessus est déjà une information.
    if (!cible) return refuser(reply, 403, 'Hiérarchie insuffisante');

    if (!permissionsService.canManageUser(moi.role, cible.role as UserRoleEnum)) {
      return refuser(reply, 403, 'Hiérarchie insuffisante');
    }
  };
}

/**
 * Exige le rang SOUVERAIN — BIGBOSS, et lui seul.
 *
 * Réservé à ce qu'aucune permission ne doit pouvoir déléguer : la
 * configuration du système lui-même. Ce n'est pas `canAccessAdmin` avec un
 * seuil plus haut, c'est une question différente — « qui possède ce service »
 * plutôt que « qui l'administre ».
 */
export function requireSovereign() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const moi = acteur(request);
    if (!moi) return refuser(reply, 401, 'Authentification requise');
    if (moi.role !== UserRoleEnum.BIGBOSS) {
      return refuser(reply, 403, 'Rang souverain requis');
    }
  };
}

/**
 * Écrit la trace d'un geste d'administration — APRÈS qu'il a réussi.
 *
 * Ce n'est pas une garde : elle n'admet ni ne refuse. Elle vit dans ce fichier
 * parce que la trace est le pendant de l'autorisation — savoir QUI a le droit
 * ne sert à rien si l'on ne sait pas qui s'en est SERVI.
 *
 * Best-effort et jamais bloquante : le geste est déjà committé quand elle
 * s'exécute, et une écriture de journal qui échoue ne doit pas transformer une
 * action réussie en 500. Son échec est journalisé, pas avalé.
 */
export async function withAudit(
  request: FastifyRequest,
  entree: {
    action: string;
    entity?: string;
    entityId: string;
    userId?: string;
    reason?: string;
    changes?: unknown;
  }
): Promise<void> {
  const moi = acteur(request);
  if (!moi) return;

  try {
    await (request.server as unknown as {
      prisma: { adminAuditLog: { create: (a: unknown) => Promise<unknown> } };
    }).prisma.adminAuditLog.create({
      data: {
        adminId: moi.userId,
        userId: entree.userId ?? entree.entityId,
        action: entree.action,
        entity: entree.entity ?? 'User',
        entityId: entree.entityId,
        changes: entree.changes ? JSON.stringify(entree.changes) : undefined,
        // Le modèle n'a pas de colonne `reason` : il a `metadata`, un JSON
        // libre. Y écrire la raison plutôt que d'ajouter une colonne garde le
        // schéma stable pour une donnée que rien n'interroge par elle-même.
        metadata: entree.reason ? JSON.stringify({ reason: entree.reason }) : undefined,
        ipAddress: request.ip,
        userAgent: typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent']
          : undefined,
      },
    });
  } catch (error) {
    logger.warn('audit trail write failed', { action: entree.action, error });
  }
}
