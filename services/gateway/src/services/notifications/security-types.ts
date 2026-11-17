/**
 * Les types de notification qui sont une VRAIE alerte de sécurité du compte
 * (connexion, mot de passe, 2FA, verrouillage…). Site UNIQUE de la liste.
 *
 * Deux règles en dépendent, et elles se tiennent ensemble :
 *  - l'e-mail hors ligne : seau de limitation propre (un e-mail social ne peut
 *    jamais en retenir un de sécurité) et gabarit de sécurité ;
 *  - « Ne pas déranger » : il décide si l'appareil SONNE, jamais si la victime
 *    d'une intrusion saura qu'elle a eu lieu. Ces types franchissent la
 *    fenêtre (la ligne in-app, le socket, l'e-mail) ; seul le push y reste
 *    soumis (`isPushAllowed`) (#18910).
 */
export const SECURITY_EMAIL_NOTIFICATION_TYPES: ReadonlySet<string> = new Set<string>([
  'login_new_device',
  'login_suspicious',
  'suspicious_activity',
  'password_changed',
  'two_factor_enabled',
  'two_factor_disabled',
  'account_locked',
  'security_alert',
]);

export const isSecurityEmailType = (type: string): boolean => SECURITY_EMAIL_NOTIFICATION_TYPES.has(type);
