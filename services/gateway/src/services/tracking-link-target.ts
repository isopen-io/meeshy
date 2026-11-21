import { servedTrackingTarget } from '@meeshy/shared/utils/email-link-url';

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

/**
 * La destination d'un lien vers un contenu Meeshy (`targetType` autre qu'`EXTERNAL`) ne se
 * réécrit pas : l'application ouvre la cible déclarée, le web suit `originalUrl`, et les
 * partages du contenu RÉUTILISENT ce lien. Un ancien lien sans cible déclarée est externe.
 */
export const TRACKING_TARGET_IMMUTABLE = 'TRACKING_TARGET_IMMUTABLE';

export const hasImmutableTarget = (link: { readonly targetType?: string | null }): boolean =>
  link.targetType != null && link.targetType !== 'EXTERNAL';

/**
 * L'adresse que ce lien SERT (redirection, clic, résolution) : la
 * sérialisation WHATWG de sa cible — la forme jugée est la forme servie —, ou
 * `null` si elle ne se sert pas (secret d'e-mail, illisible, autre que http(s)).
 */
export function servedTrackingLinkTarget(originalUrl: string | null | undefined): string | null {
  return originalUrl === null || originalUrl === undefined ? null : servedTrackingTarget(originalUrl);
}

/** La cible d'un lien suivi peut-elle être mintée ou servie ? Un lien sans adresse n'a rien à refuser. */
export function isServableTrackingTarget(originalUrl: string | null | undefined): boolean {
  return originalUrl === null || originalUrl === undefined || servedTrackingTarget(originalUrl) !== null;
}
