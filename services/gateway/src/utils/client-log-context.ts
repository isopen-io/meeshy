/**
 * **Ce que le journal d'une requête retient du client** (audit #9608, P5).
 *
 * Seulement ce que le client est seul à savoir : version et build de
 * l'application, plateforme, modèle, système, langue, fuseau. Le LIEU — pays,
 * ville, région — n'en fait plus partie : `X-Meeshy-Country` est la région
 * réglée dans iOS et les trois sont écrits par l'appelant ; seul le serveur
 * décide d'un lieu, depuis l'adresse attestée (#9608).
 */
const CLIENT_LOG_HEADERS = {
  appVersion: 'x-meeshy-version',
  appBuild: 'x-meeshy-build',
  platform: 'x-meeshy-platform',
  device: 'x-meeshy-device',
  osVersion: 'x-meeshy-os',
  locale: 'x-meeshy-locale',
  timezone: 'x-meeshy-timezone',
} as const;

export type ClientLogContext = Partial<Record<keyof typeof CLIENT_LOG_HEADERS, string>>;

export function clientLogContext(headers: Record<string, string | string[] | undefined>): ClientLogContext {
  return Object.fromEntries(
    Object.entries(CLIENT_LOG_HEADERS).flatMap(([field, header]) => {
      const value = headers[header];
      return typeof value === 'string' ? [[field, value]] : [];
    })
  );
}
