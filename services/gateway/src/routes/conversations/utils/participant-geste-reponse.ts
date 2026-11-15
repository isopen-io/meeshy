import type { FastifyReply } from 'fastify';
import { sendBadRequest, sendForbidden, sendNotFound } from '../../../utils/response';
import type { RefusDeGeste, StatutDeRefus } from './participant-geste-verdict';

/**
 * **La traduction d'un refus de noyau en réponse HTTP** — le seul endroit du
 * dépôt qui la fait, pour les quatre gestes (#4713).
 *
 * Chaque gestionnaire pourrait l'écrire lui-même en quatre lignes ; quatre
 * copies d'une table statut → aide seraient quatre occasions de servir un jour
 * un 403 là où la route en servait un 404. C'est la règle « une seule source de
 * vérité » appliquée à ce qui reste, précisément, la seule chose que les quatre
 * gestionnaires ont encore en commun.
 *
 * ─── La table est construite À L'APPEL, pas au chargement du module ──────────
 *
 * Sept suites du dépôt remplacent `utils/response` par un double
 * (`jest.mock`). Figer les trois aides dans une constante de module capturerait
 * la valeur au chargement ; les relire ici lit la liaison VIVANTE, quelle que
 * soit la façon dont la suite a posé son double.
 *
 * ─── L'arité est reproduite, pas normalisée ─────────────────────────────────
 *
 * Un refus sans code appelle l'aide à DEUX arguments, exactement comme le
 * gestionnaire le faisait ; les suites qui observent `toHaveBeenCalledWith`
 * comptent les arguments.
 */
type AideDeRefus = (
  reply: FastifyReply,
  error: string,
  options?: { readonly code?: string },
) => void;

export function repondreAuRefus(reply: FastifyReply, verdict: RefusDeGeste): void {
  const aides: Readonly<Record<StatutDeRefus, AideDeRefus>> = {
    400: sendBadRequest,
    403: sendForbidden,
    404: sendNotFound,
  };
  const envoyer = aides[verdict.statut];

  if (verdict.code === undefined) {
    envoyer(reply, verdict.message);
    return;
  }
  envoyer(reply, verdict.message, { code: verdict.code });
}
