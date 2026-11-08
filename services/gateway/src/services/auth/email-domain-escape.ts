/**
 * L'échappatoire de la garde de domaine d'e-mail (#16491), lue UNE fois au
 * chargement : `ALLOW_RESERVED_EMAIL_DOMAINS=true` — cette valeur exacte et
 * aucune autre — ouvre les adresses réservées et jetables (staging, dev,
 * tests). Absente, la garde est active.
 *
 * En PRODUCTION (`NODE_ENV=production` hors `MEESHY_ENV=staging`, le staging
 * tournant lui aussi en `NODE_ENV=production`), la variable est IGNORÉE : la
 * garde reste active et la passerelle le journalise en erreur au démarrage,
 * plutôt que de refuser de démarrer.
 *
 * Module à part pour qu'un témoin puisse couper l'échappatoire sans doubler la
 * garde elle-même.
 *
 * @module services/auth/email-domain-escape
 */

import { enhancedLogger } from '../../utils/logger-enhanced';
import { isStagingEnvironment } from '../email/staging-marker';

type EscapeEnv = {
  readonly NODE_ENV?: string;
  readonly MEESHY_ENV?: string;
  readonly ALLOW_RESERVED_EMAIL_DOMAINS?: string;
};

export function resolveReservedEmailDomainsAllowed(env: EscapeEnv, onIgnored: (message: string) => void): boolean {
  if (env.ALLOW_RESERVED_EMAIL_DOMAINS !== 'true') return false;
  if (env.NODE_ENV === 'production' && !isStagingEnvironment(env.MEESHY_ENV)) {
    onIgnored(
      'ALLOW_RESERVED_EMAIL_DOMAINS=true est posée en PRODUCTION : elle est ignorée, les adresses réservées et jetables restent refusées. Retirer la variable de cet environnement.',
    );
    return false;
  }
  return true;
}

export const RESERVED_EMAIL_DOMAINS_ALLOWED = resolveReservedEmailDomainsAllowed(process.env, (message) =>
  enhancedLogger.child({ module: 'EmailDomainEscape' }).error(message),
);
