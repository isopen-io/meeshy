/**
 * Ce qu'un client DÉCLARE de lui-même à l'ouverture et au rafraîchissement
 * d'une session — le contrat UNIQUE des trois clients (#9610).
 *
 * Tous les en-têtes sont FACULTATIFS. Un client qui n'en envoie aucun garde ce
 * que le serveur déduit de lui-même (agent utilisateur, adresse attestée par
 * le proxy) ; ce qu'il déclare ne fait qu'ajouter. Rien ici ne décide du LIEU
 * (pays, ville) : il se déduit de l'adresse que le proxy atteste (#9608).
 *
 * Une socket ne peut pas porter ces en-têtes — la liste des en-têtes admis par
 * le CORS de Socket.IO est fermée — : elle remet le même relevé, sous les MÊMES
 * noms de champs, dans `handshake.auth[CLIENT_SESSION_AUTH_KEY]`.
 *
 * @see schema.prisma — `UserSession.appVersion`, `appBuild`, `platform`,
 *      `deviceName`, `loginMethod`
 */

/** Les en-têtes HTTP, sous la casse publiée aux clients (Node les lit en minuscules). */
export const CLIENT_SESSION_HEADERS = {
  appVersion: 'X-Meeshy-Version',
  appBuild: 'X-Meeshy-Build',
  platform: 'X-Meeshy-Platform',
  deviceModel: 'X-Meeshy-Device',
  osVersion: 'X-Meeshy-OS',
  timezone: 'X-Meeshy-Timezone',
  deviceLocale: 'X-Device-Locale',
  deviceName: 'X-Meeshy-Device-Name',
} as const;

/** La clé de `socket.handshake.auth` sous laquelle une socket remet le même relevé. */
export const CLIENT_SESSION_AUTH_KEY = 'client' as const;

export const CLIENT_PLATFORMS = ['ios', 'web', 'pwa', 'android-shell'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

/**
 * Le moyen par lequel une session s'est ouverte, posé par le SERVEUR (jamais
 * déclaré par le client). `oauth` et `anonymous` n'ont pas encore de
 * producteur : une session anonyme vit sur `Participant`, pas sur
 * `UserSession`. Ils sont nommés pour que les clients sachent les dire le jour
 * où ils apparaissent.
 */
export const SESSION_LOGIN_METHODS = [
  'password',
  'two_factor',
  'magic_link',
  'registration',
  'email_verification',
  'oauth',
  'anonymous',
] as const;
export type SessionLoginMethod = (typeof SESSION_LOGIN_METHODS)[number];

/**
 * L'attribution que la licence CC-BY 4.0 de DB-IP Lite exige partout où un
 * lieu déduit de l'adresse est montré. `approximate` : une ville tirée d'une
 * adresse IP se dit « approximative », jamais comme un fait.
 */
export const GEOLOCATION_ATTRIBUTION = {
  provider: 'DB-IP',
  text: 'IP Geolocation by DB-IP',
  url: 'https://db-ip.com',
  license: 'CC-BY-4.0',
  approximate: true,
} as const;

export type ClientSessionInfo = {
  readonly appVersion: string | null;
  readonly appBuild: string | null;
  readonly platform: ClientPlatform | null;
  readonly deviceModel: string | null;
  readonly osVersion: string | null;
  readonly timezone: string | null;
  readonly deviceLocale: string | null;
  readonly deviceName: string | null;
};

export const EMPTY_CLIENT_SESSION_INFO: ClientSessionInfo = {
  appVersion: null,
  appBuild: null,
  platform: null,
  deviceModel: null,
  osVersion: null,
  timezone: null,
  deviceLocale: null,
  deviceName: null,
};

type FieldRule = { readonly max: number; readonly pattern?: RegExp };

const VERSION_LIKE = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/;

const FIELD_RULES: Readonly<Record<Exclude<keyof ClientSessionInfo, 'platform'>, FieldRule>> = {
  appVersion: { max: 32, pattern: VERSION_LIKE },
  appBuild: { max: 32, pattern: VERSION_LIKE },
  deviceModel: { max: 64 },
  osVersion: { max: 32, pattern: VERSION_LIKE },
  timezone: { max: 64, pattern: /^[A-Za-z][A-Za-z_]*(\/[A-Za-z0-9_+-]+)*$/ },
  deviceLocale: { max: 35, pattern: /^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$/ },
  deviceName: { max: 64 },
};

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;

function firstValue(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw;
}

function cleanText(raw: unknown, rule: FieldRule): string | null {
  const value = firstValue(raw);
  if (typeof value !== 'string') return null;
  const text = value.replace(CONTROL_CHARACTERS, '').trim().slice(0, rule.max).trim();
  if (text === '') return null;
  return rule.pattern === undefined || rule.pattern.test(text) ? text : null;
}

function cleanPlatform(raw: unknown): ClientPlatform | null {
  const value = firstValue(raw);
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  return CLIENT_PLATFORMS.find((platform) => platform === lowered) ?? null;
}

function readFields(lookup: (field: keyof ClientSessionInfo) => unknown): ClientSessionInfo {
  return {
    appVersion: cleanText(lookup('appVersion'), FIELD_RULES.appVersion),
    appBuild: cleanText(lookup('appBuild'), FIELD_RULES.appBuild),
    platform: cleanPlatform(lookup('platform')),
    deviceModel: cleanText(lookup('deviceModel'), FIELD_RULES.deviceModel),
    osVersion: cleanText(lookup('osVersion'), FIELD_RULES.osVersion),
    timezone: cleanText(lookup('timezone'), FIELD_RULES.timezone),
    deviceLocale: cleanText(lookup('deviceLocale'), FIELD_RULES.deviceLocale),
    deviceName: cleanText(lookup('deviceName'), FIELD_RULES.deviceName),
  };
}

/** Le relevé d'une requête HTTP — `headers` sous la forme de Node (clés en minuscules). */
export function readClientSessionHeaders(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
): ClientSessionInfo {
  return readFields((field) => headers[CLIENT_SESSION_HEADERS[field].toLowerCase()]);
}

/** Le relevé d'une socket — `handshake.auth`, valeur que le client écrit librement. */
export function readClientSessionAuth(auth: unknown): ClientSessionInfo {
  if (auth === null || typeof auth !== 'object') return EMPTY_CLIENT_SESSION_INFO;
  const declared: unknown = (auth as Record<string, unknown>)[CLIENT_SESSION_AUTH_KEY];
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) return EMPTY_CLIENT_SESSION_INFO;
  const fields = declared as Record<string, unknown>;
  return readFields((field) => fields[field]);
}

/**
 * Pourquoi une session s'est fermée, en clair — pour l'export RGPD, qui
 * s'adresse à une personne et pas à un écran. Les codes sont ceux qu'écrit la
 * passerelle (`UserSession.invalidatedReason`). L'administrateur n'est jamais
 * nommé : une fermeture décidée par l'administration se dit « par l'équipe
 * Meeshy ».
 */
const CLOSURE_REASON_TEXT: Readonly<Record<string, { readonly fr: string; readonly en: string }>> = {
  logout: { fr: 'Déconnexion', en: 'Signed out' },
  expired: { fr: 'Arrivée à échéance', en: 'Expired' },
  admin_revoke: { fr: 'Fermée par l’équipe Meeshy', en: 'Closed by the Meeshy team' },
  user_revoked: { fr: 'Fermée depuis un autre appareil', en: 'Closed from another device' },
  user_revoked_all: { fr: 'Toutes les autres sessions ont été fermées', en: 'All other sessions were closed' },
  email_revoke_all: { fr: 'Fermée depuis le lien d’un e-mail de sécurité', en: 'Closed from a security email link' },
  logout_all_devices: { fr: 'Toutes les sessions ont été fermées', en: 'All sessions were closed' },
  password_reset: { fr: 'Mot de passe réinitialisé', en: 'Password reset' },
  password_changed: { fr: 'Mot de passe changé', en: 'Password changed' },
  deactivation: { fr: 'Compte désactivé', en: 'Account deactivated' },
  deletion: { fr: 'Compte supprimé', en: 'Account deleted' },
  security_breach: { fr: 'Fermée pour raison de sécurité', en: 'Closed for security reasons' },
  security_concern: { fr: 'Fermée par précaution', en: 'Closed as a precaution' },
  session_limit_exceeded: { fr: 'Trop de sessions ouvertes', en: 'Too many open sessions' },
};

export function sessionClosureReasonText(code: string | null | undefined, language: string): string | null {
  if (code === null || code === undefined || code === '') return null;
  const text = CLOSURE_REASON_TEXT[code] ?? CLOSURE_REASON_TEXT[code.toLowerCase()];
  const french = language.toLowerCase().startsWith('fr');
  if (text !== undefined) return french ? text.fr : text.en;
  return french ? `Fermée (${code})` : `Closed (${code})`;
}
