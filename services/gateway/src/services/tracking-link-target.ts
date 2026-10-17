import { urlCarriesEmailLinkSecret } from '@meeshy/shared/utils/email-link-secret';

/**
 * UN LIEN SUIVI NE VISE JAMAIS UN LIEN À JETON D'E-MAIL (#10871). Connexion
 * magique, vérification, réinitialisation, révocation : au bout d'un `/l/<jeton>`
 * créé par un autre, ces liens connecteraient le lecteur au compte du créateur.
 * Ni mintés (création, édition, suivi automatique des URL d'un contenu), ni
 * servis (redirection, clic, résolution) — les liens déjà créés compris. Le
 * message ne nomme jamais l'adresse : elle porte le secret.
 */
export class TrackingTargetCarriesEmailSecretError extends Error {
  constructor() {
    super('Tracking target carries an email link secret');
    this.name = 'TrackingTargetCarriesEmailSecretError';
  }
}

/** Le code d'erreur typé que les routes servent pour ce refus. */
export const TRACKING_TARGET_CARRIES_EMAIL_SECRET = 'TRACKING_TARGET_CARRIES_EMAIL_SECRET';

/** La cible d'un lien suivi peut-elle être servie ? Non, si elle porte un secret d'e-mail. */
export function isServableTrackingTarget(originalUrl: string | null | undefined): boolean {
  return originalUrl === null || originalUrl === undefined || !urlCarriesEmailLinkSecret(originalUrl);
}
