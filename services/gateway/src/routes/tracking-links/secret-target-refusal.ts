import type { FastifyReply } from 'fastify';
import { TRACKING_TARGET_CARRIES_EMAIL_SECRET } from '../../services/tracking-link-target';
import { sendBadRequest } from '../../utils/response';

/**
 * Une cible porteuse d'un secret de lien d'e-mail (connexion, vérification,
 * réinitialisation…) est refusée en 400 typé (#10871). La réponse ne recopie
 * jamais l'adresse : elle porte le jeton.
 */
export const refuserCibleSecrete = (reply: FastifyReply) =>
  sendBadRequest(reply, 'Cette adresse ne peut pas être la cible d\'un lien suivi', {
    code: TRACKING_TARGET_CARRIES_EMAIL_SECRET
  });
