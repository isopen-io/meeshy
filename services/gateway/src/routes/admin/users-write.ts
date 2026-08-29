import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { UserRoleEnum, UserAuditAction, type AuditChange } from '@meeshy/shared/types';
import { updateUserProfileValidationSchema } from '@meeshy/shared/types/validation/admin-user';
import type { UserManagementService } from '../../services/admin/user-management.service';
import type { UserAuditService } from '../../services/admin/user-audit.service';
import { sanitizationService } from '../../services/admin/user-sanitization.service';
import { permissionsService } from '../../services/admin/permissions.service';
import { requireHierarchy } from '../../middleware/authorize';
import { requireUserModifyAccess } from '../../middleware/admin-user-auth.middleware';
import { UnifiedAuthContext, UnifiedAuthRequest, authUserCacheKey } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { sendSuccess, sendNotFound, sendForbidden, sendBadRequest, sendInternalError } from '../../utils/response';
import { evaluerLoiDesChamps, champsDeLaFamille } from './user-field-law';

/**
 * Les écritures d'un compte administré, gouvernées par la loi de leur CHAMP (#4154).
 *
 * ## Ce que ce fichier remplace
 *
 * Dix routes qui posaient chacune SA garde, et trois familles de champs
 * réparties sur trois adresses (`PATCH /:id`, `/:id/role`, `/:id/status`) dont
 * la loi était celle de la ROUTE — si bien qu'un champ ajouté à l'une héritait
 * de la loi de sa route, jamais de la sienne.
 *
 * Ici, quatre adresses — profil+rôle+statut fusionnés, sécurité, vérifications,
 * consentements — et **aucune ne décide** : elles présentent leurs champs à
 * {@link evaluerLoiDesChamps}, qui applique la carte `LOI_PAR_CHAMP`. Un champ
 * sans loi est REFUSÉ, jamais écrit sous une loi par défaut.
 *
 * ## Deux questions, deux mécanismes
 *
 * - « ce RÔLE a-t-il le droit d'écrire ce CHAMP ? » → la carte des champs.
 * - « a-t-il le RANG pour agir sur CETTE cible ? » → `requireHierarchy()`,
 *   posé en `preHandler` sur les quatre routes **sans exception à énumérer**.
 *   C'est l'absence d'exception qui ferme la classe : #4144 avait corrigé les
 *   trois cas connus (`unlock`, `enable-2fa`, `disable-2fa`), ce qui laissait
 *   la onzième écriture à écrire sans garde.
 *
 * Le rôle porte une TROISIÈME question, que lui seul pose : le rang du rôle
 * VISÉ (`canChangeRole`) — sans elle, un ADMIN promeut un USER en BIGBOSS.
 *
 * ## Pourquoi les handlers prennent leur corps en PARAMÈTRE
 *
 * Les adresses historiques restent servies (les consoles déjà installées les
 * appellent), et elles sont de VRAIS alias : elles TRADUISENT leur corps
 * d'époque vers le vocabulaire des champs et passent par la même loi. Un alias
 * qui rejouerait le handler porterait une seconde loi — le défaut même que
 * cette issue ferme.
 */

type Deps = {
  userManagementService: UserManagementService;
  userAuditService: UserAuditService;
};

type Corps = Record<string, unknown>;

/**
 * Ce qu'une adresse HISTORIQUE doit rendre, à l'identique de son époque.
 *
 * Un alias existe pour qu'une console déjà installée continue de fonctionner ;
 * une console qui lit `data.message` ou affiche `message` casse si l'alias
 * rend autre chose. La traduction porte donc sur les DEUX sens — le corps reçu
 * ET la réponse servie —, sinon ce n'est pas un alias mais une route voisine.
 */
type Rendu = (contexte: { servi: unknown; corps: Corps }) => { data: unknown; message: string };

function acteurDe(request: FastifyRequest): { id: string; role: UserRoleEnum } {
  const ctx = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
  return {
    id: ctx.registeredUser!.id,
    role: ctx.registeredUser!.role as UserRoleEnum,
  };
}

function motifDe(corps: Corps): string | undefined {
  const brut = corps.reason;
  return typeof brut === 'string' && brut.trim().length > 0 ? brut.trim() : undefined;
}

/**
 * Les champs PRÉSENTÉS par l'appelant, `reason` exclu — c'est un méta-champ.
 *
 * Une valeur `undefined` ne compte pas : en JSON elle n'existe pas, et les
 * alias historiques la produisent en traduisant un corps d'époque qui ne
 * portait pas le champ. La compter ferait « écrire » un champ que personne n'a
 * envoyé — donc passer une loi pour rien, et rendre 200 sans rien faire.
 */
function champsPresentes(corps: Corps): string[] {
  return Object.keys(corps).filter((c) => c !== 'reason' && corps[c] !== undefined);
}

function corpsDe(request: FastifyRequest): Corps {
  const brut = request.body;
  return brut && typeof brut === 'object' ? (brut as Corps) : {};
}

/**
 * Rend le refus au bon code : un champ INCONNU est une requête malformée
 * (400), un champ connu refusé est une question d'autorisation (403). Les
 * confondre ferait lire « tu n'as pas le droit » à qui a fait une faute de
 * frappe, et l'inverse.
 */
function refuserSelonLaLoi(
  reply: FastifyReply,
  role: UserRoleEnum,
  champs: readonly string[],
  motif: string | undefined
): boolean {
  const refus = evaluerLoiDesChamps({ role, champs, motif });
  if (!refus) return false;

  if (refus.cause === 'inconnu' || refus.cause === 'motif') {
    sendBadRequest(reply, refus.message);
    return true;
  }
  sendForbidden(reply, refus.message, { message: refus.message });
  return true;
}

const roleSchema = z.object({ role: z.string().min(1) });
const consentSchema = z.object({
  voiceProfile: z.boolean().optional(),
  voiceData: z.boolean().optional(),
  dataProcessing: z.boolean().optional(),
  voiceCloning: z.boolean().optional(),
  reason: z.string().min(10),
});
const securitySchema = z.object({
  unlock: z.literal(true).optional(),
  twoFactorEnabled: z.boolean().optional(),
  reason: z.string().optional(),
});
const verificationsSchema = z.object({
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  ageVerified: z.boolean().optional(),
  reason: z.string().optional(),
});

const CONSENTEMENTS = {
  voiceProfile: 'voiceProfileConsentAt',
  voiceData: 'voiceDataConsentAt',
  dataProcessing: 'dataProcessingConsentAt',
  voiceCloning: 'voiceCloningEnabledAt',
} as const;

function servir(
  reply: FastifyReply,
  role: UserRoleEnum,
  servi: unknown,
  corps: Corps,
  rendu: Rendu | undefined,
  messageParDefaut: string
): void {
  const sanitise = sanitizationService.sanitizeUser(servi as never, role);
  if (!rendu) {
    sendSuccess(reply, sanitise, { message: messageParDefaut });
    return;
  }
  const legacy = rendu({ servi: sanitise, corps });
  sendSuccess(reply, legacy.data, { message: legacy.message });
}

async function oublierLeCache(userId: string): Promise<void> {
  try {
    await getCacheStore().del(authUserCacheKey(userId));
  } catch {
    /* best-effort : le rôle servi par le cache expire de lui-même */
  }
}

function rendreErreur(
  fastify: FastifyInstance,
  reply: FastifyReply,
  error: unknown,
  message: string
): void {
  if (error instanceof z.ZodError) {
    sendBadRequest(reply, 'Invalid input data');
    return;
  }
  fastify.log.error({ err: error }, message);
  sendInternalError(reply, 'Internal server error', { message });
}

export function registerUserWriteRoutes(fastify: FastifyInstance, deps: Deps): void {
  const { userManagementService, userAuditService } = deps;

  /** La garde commune : la porte, puis le RANG. La loi du champ suit, en corps. */
  const gardes = [fastify.authenticate, requireUserModifyAccess, requireHierarchy({ param: 'userId' })];

  async function tracer(
    request: FastifyRequest,
    entree: {
      cible: string;
      action: UserAuditAction;
      changes: Record<string, AuditChange>;
      motif?: string;
    }
  ): Promise<void> {
    const moi = acteurDe(request);
    await userAuditService.createAuditLog({
      userId: entree.cible,
      adminId: moi.id,
      action: entree.action,
      entityId: entree.cible,
      changes: entree.changes,
      metadata: entree.motif ? { reason: entree.motif } : null,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  /** La montée d'un handler : la loi des champs, puis la cible. */
  async function admettre(
    request: FastifyRequest,
    reply: FastifyReply,
    corps: Corps
  ): Promise<{ moi: { id: string; role: UserRoleEnum }; motif?: string; cible: Awaited<ReturnType<UserManagementService['getUserById']>> } | null> {
    const moi = acteurDe(request);
    const motif = motifDe(corps);
    const champs = champsPresentes(corps);

    if (champs.length === 0) {
      sendBadRequest(reply, 'Aucun champ à écrire');
      return null;
    }
    if (refuserSelonLaLoi(reply, moi.role, champs, motif)) return null;

    const cible = await userManagementService.getUserById((request.params as { userId: string }).userId);
    if (!cible) {
      sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });
      return null;
    }
    return { moi, motif, cible };
  }

  /**
   * Profil, rôle et statut — UNE écriture, une loi par champ.
   *
   * Le refus est GLOBAL : on n'écrit pas la moitié autorisée d'un lot dont
   * l'autre moitié est refusée. Un lot à moitié appliqué est plus difficile à
   * défaire qu'un lot refusé.
   */
  async function ecrireCompte(request: FastifyRequest, reply: FastifyReply, corps: Corps, rendu?: Rendu): Promise<void> {
    try {
      const admis = await admettre(request, reply, corps);
      if (!admis) return;
      const { moi, motif, cible } = admis;
      const userId = (request.params as { userId: string }).userId;

      const champsProfil = champsDeLaFamille('profil').filter((c) => c in corps);
      const veutStatut = 'isActive' in corps;

      // La TROISIÈME question du rôle : le rang VISÉ. Posée avant toute
      // écriture, comme les deux autres.
      let nouveauRole: UserRoleEnum | undefined;
      if ('role' in corps) {
        nouveauRole = roleSchema.parse({ role: corps.role }).role as UserRoleEnum;
        if (!permissionsService.canChangeRole(moi.role, cible!.role as UserRoleEnum, nouveauRole)) {
          sendForbidden(reply, 'Insufficient permissions to change user role', { message: 'Access denied' });
          return;
        }
      }

      let servi = cible!;

      if (champsProfil.length > 0) {
        const profil = updateUserProfileValidationSchema.parse(
          Object.fromEntries(champsProfil.map((c) => [c, corps[c]]))
        );
        const changes: Record<string, AuditChange> = {};
        for (const champ of champsProfil) {
          const avant = (cible as unknown as Record<string, unknown>)[champ];
          const apres = (profil as Record<string, unknown>)[champ];
          if (avant !== apres) changes[champ] = { before: avant, after: apres };
        }
        servi = await userManagementService.updateUser(userId, profil, moi.id);
        await tracer(request, { cible: userId, action: UserAuditAction.UPDATE_PROFILE, changes, motif });
      }

      if (nouveauRole) {
        const avant = cible!.role;
        servi = await userManagementService.updateRole(userId, { role: nouveauRole }, moi.id);
        await oublierLeCache(userId);
        await tracer(request, {
          cible: userId,
          action: UserAuditAction.UPDATE_ROLE,
          changes: { role: { before: avant, after: nouveauRole } },
          motif,
        });
      }

      if (veutStatut) {
        const isActive = z.boolean().parse(corps.isActive);
        const avant = cible!.isActive;
        servi = await userManagementService.updateStatus(userId, { isActive }, moi.id);
        await oublierLeCache(userId);
        await tracer(request, {
          cible: userId,
          action: isActive ? UserAuditAction.ACTIVATE_USER : UserAuditAction.DEACTIVATE_USER,
          changes: { isActive: { before: avant, after: isActive } },
          motif,
        });
      }

      servir(reply, moi.role, servi, corps, rendu, 'User updated successfully');
    } catch (error) {
      rendreErreur(fastify, reply, error, 'Failed to update user');
    }
  }

  /**
   * Déverrouillage et double authentification.
   *
   * Le désarmement de la 2FA d'un compte que l'on ne surclasse pas est le
   * maillon d'une escalade complète (désarmer, puis réinitialiser le mot de
   * passe) : sa garde de hiérarchie n'est pas une politesse.
   */
  async function ecrireSecurite(request: FastifyRequest, reply: FastifyReply, corps: Corps, rendu?: Rendu): Promise<void> {
    try {
      const admis = await admettre(request, reply, corps);
      if (!admis) return;
      const { moi, motif, cible } = admis;
      const userId = (request.params as { userId: string }).userId;
      const valide = securitySchema.parse(corps);

      let servi = cible!;

      if (valide.unlock) {
        servi = await userManagementService.unlockAccount(userId, moi.id);
        await tracer(request, {
          cible: userId,
          action: UserAuditAction.UNLOCK_ACCOUNT,
          changes: { unlock: { before: cible!.lockedUntil ?? null, after: null } },
          motif,
        });
      }

      if (valide.twoFactorEnabled !== undefined) {
        const avant = cible!.twoFactorEnabledAt ?? null;
        servi = valide.twoFactorEnabled
          ? await userManagementService.enable2FA(userId, moi.id)
          : await userManagementService.disable2FA(userId, moi.id);
        await tracer(request, {
          cible: userId,
          action: valide.twoFactorEnabled ? UserAuditAction.ENABLE_2FA : UserAuditAction.DISABLE_2FA,
          changes: { twoFactorEnabled: { before: avant !== null, after: valide.twoFactorEnabled } },
          motif,
        });
      }

      servir(reply, moi.role, servi, corps, rendu, 'Security settings updated');
    } catch (error) {
      rendreErreur(fastify, reply, error, 'Failed to update security settings');
    }
  }

  /** E-mail, téléphone, âge — les trois preuves qu'un administrateur peut poser. */
  async function ecrireVerifications(request: FastifyRequest, reply: FastifyReply, corps: Corps, rendu?: Rendu): Promise<void> {
    try {
      const admis = await admettre(request, reply, corps);
      if (!admis) return;
      const { moi, motif, cible } = admis;
      const userId = (request.params as { userId: string }).userId;
      const valide = verificationsSchema.parse(corps);

      let servi = cible!;

      if (valide.emailVerified !== undefined) {
        servi = await userManagementService.verifyEmail(userId, valide.emailVerified, moi.id);
        await tracer(request, {
          cible: userId,
          action: UserAuditAction.VERIFY_EMAIL,
          changes: { emailVerified: { before: cible!.emailVerifiedAt !== null, after: valide.emailVerified } },
          motif,
        });
      }

      if (valide.phoneVerified !== undefined) {
        servi = await userManagementService.verifyPhone(userId, valide.phoneVerified, moi.id);
        await tracer(request, {
          cible: userId,
          action: UserAuditAction.VERIFY_PHONE,
          changes: { phoneVerified: { before: cible!.phoneVerifiedAt !== null, after: valide.phoneVerified } },
          motif,
        });
      }

      if (valide.ageVerified !== undefined) {
        servi = await userManagementService.verifyAge(userId, valide.ageVerified, moi.id);
        await tracer(request, {
          cible: userId,
          action: UserAuditAction.VERIFY_AGE,
          changes: { ageVerified: { before: null, after: valide.ageVerified } },
          motif,
        });
      }

      servir(reply, moi.role, servi, corps, rendu, 'Verifications updated');
    } catch (error) {
      rendreErreur(fastify, reply, error, 'Failed to update verifications');
    }
  }

  /**
   * La preuve légale d'un consentement — rang SOUVERAIN (S6) et motif écrit.
   *
   * Poser au nom d'autrui qu'il a consenti à l'usage de sa VOIX fabrique une
   * pièce que rien ne distingue d'un consentement donné. C'était, avant cette
   * issue, un `POST` ouvert à tout ADMIN, sans motif, journalisé en
   * « UPDATE_PROFILE » — la ligne d'audit ne disait donc même pas quel geste
   * avait eu lieu. Le rang et le motif viennent de la carte des champs ; cette
   * fonction ne les répète pas.
   */
  async function ecrireConsentements(request: FastifyRequest, reply: FastifyReply, corps: Corps, rendu?: Rendu): Promise<void> {
    try {
      const admis = await admettre(request, reply, corps);
      if (!admis) return;
      const { moi, motif, cible } = admis;
      const userId = (request.params as { userId: string }).userId;
      const valide = consentSchema.parse(corps);

      let servi = cible!;
      const changes: Record<string, AuditChange> = {};

      for (const consentement of Object.keys(CONSENTEMENTS) as Array<keyof typeof CONSENTEMENTS>) {
        const voulu = valide[consentement];
        if (voulu === undefined) continue;
        changes[consentement] = {
          before: (cible as unknown as Record<string, unknown>)[CONSENTEMENTS[consentement]] ?? null,
          after: voulu,
        };
        servi = await userManagementService.toggleVoiceConsent(userId, consentement, voulu, moi.id);
      }

      await tracer(request, {
        cible: userId,
        action: UserAuditAction.UPDATE_CONSENT,
        changes,
        motif,
      });

      servir(reply, moi.role, servi, corps, rendu, 'Consents updated');
    } catch (error) {
      rendreErreur(fastify, reply, error, 'Failed to update consents');
    }
  }

  // — Les quatre adresses de la loi —

  fastify.patch('/admin/users/:userId', { preHandler: gardes }, (request, reply) =>
    ecrireCompte(request, reply, corpsDe(request))
  );
  fastify.patch('/admin/users/:userId/security', { preHandler: gardes }, (request, reply) =>
    ecrireSecurite(request, reply, corpsDe(request))
  );
  fastify.patch('/admin/users/:userId/verifications', { preHandler: gardes }, (request, reply) =>
    ecrireVerifications(request, reply, corpsDe(request))
  );
  fastify.patch('/admin/users/:userId/consents', { preHandler: gardes }, (request, reply) =>
    ecrireConsentements(request, reply, corpsDe(request))
  );

  // — Les adresses HISTORIQUES, traduites vers les mêmes champs —
  //
  // Elles restent servies pour les consoles déjà installées. Chacune n'est
  // qu'une TRADUCTION de son corps d'époque : aucune ne porte de garde propre,
  // donc aucune ne peut diverger de la loi.

  const messageSeul = (message: string): Rendu => () => ({ data: { message }, message });

  fastify.patch('/admin/users/:userId/role', { preHandler: gardes }, (request, reply) => {
    const corps = corpsDe(request);
    return ecrireCompte(request, reply, { role: corps.role, reason: corps.reason }, ({ servi, corps: c }) => ({
      data: servi,
      message: `User role updated to ${String(c.role)}`,
    }));
  });

  fastify.patch('/admin/users/:userId/status', { preHandler: gardes }, (request, reply) => {
    const corps = corpsDe(request);
    return ecrireCompte(request, reply, { isActive: corps.isActive, reason: corps.reason }, ({ servi, corps: c }) => ({
      data: servi,
      message: c.isActive ? 'User activated' : 'User deactivated',
    }));
  });

  fastify.post('/admin/users/:userId/unlock', { preHandler: gardes }, (request, reply) =>
    ecrireSecurite(
      request,
      reply,
      { unlock: true, reason: corpsDe(request).reason },
      messageSeul('Account unlocked successfully')
    )
  );

  fastify.post('/admin/users/:userId/enable-2fa', { preHandler: gardes }, (request, reply) =>
    ecrireSecurite(
      request,
      reply,
      { twoFactorEnabled: true, reason: corpsDe(request).reason },
      messageSeul('2FA enabled successfully')
    )
  );

  fastify.post('/admin/users/:userId/disable-2fa', { preHandler: gardes }, (request, reply) =>
    ecrireSecurite(
      request,
      reply,
      { twoFactorEnabled: false, reason: corpsDe(request).reason },
      messageSeul('2FA disabled successfully')
    )
  );

  fastify.post('/admin/users/:userId/verify-email', { preHandler: gardes }, (request, reply) => {
    const corps = corpsDe(request);
    return ecrireVerifications(
      request,
      reply,
      { emailVerified: corps.verified, reason: corps.reason },
      ({ servi, corps: c }) => ({ data: servi, message: c.emailVerified ? 'Email verified' : 'Email unverified' })
    );
  });

  fastify.post('/admin/users/:userId/verify-phone', { preHandler: gardes }, (request, reply) => {
    const corps = corpsDe(request);
    return ecrireVerifications(
      request,
      reply,
      { phoneVerified: corps.verified, reason: corps.reason },
      ({ servi, corps: c }) => ({ data: servi, message: c.phoneVerified ? 'Phone verified' : 'Phone unverified' })
    );
  });

  fastify.post('/admin/users/:userId/verify-age', { preHandler: gardes }, (request, reply) => {
    const corps = corpsDe(request);
    return ecrireVerifications(
      request,
      reply,
      { ageVerified: corps.verified, reason: corps.reason },
      ({ servi, corps: c }) => ({ data: servi, message: c.ageVerified ? 'Age verified' : 'Age unverified' })
    );
  });

  /**
   * L'adresse historique du consentement PASSE par la loi souveraine.
   *
   * C'est le seul alias dont le contrat CHANGE : un ADMIN qui posait ce champ
   * hier reçoit désormais 403, et un appel sans motif reçoit 400. C'est
   * l'intention de #4154 — l'alias existe pour ne pas rendre 404, pas pour
   * conserver une porte que l'issue ferme.
   */
  fastify.post('/admin/users/:userId/voice-consent', { preHandler: gardes }, (request, reply) => {
    const corps = corpsDe(request);
    const type = typeof corps.consentType === 'string' ? corps.consentType : '__inconnu__';
    return ecrireConsentements(
      request,
      reply,
      { [type]: corps.enabled, reason: corps.reason },
      ({ servi }) => ({ data: servi, message: `${type} ${corps.enabled ? 'enabled' : 'disabled'}` })
    );
  });
}
