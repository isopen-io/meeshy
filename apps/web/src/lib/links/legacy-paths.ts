/**
 * **LES ANCIENNES ADRESSES DE MEESHY MÈNENT À LEUR ÉCRAN** (#10881) — le
 * miroir des redirections 308 de `nginx.conf`, motif et cible recopiés tels
 * quels (`legacy-paths.test.ts` les confronte).
 *
 * Le site redirige `/join/<id>`, `/p/<id>`, `/s/<id>`… avant que l'app ne
 * charge ; un lien touché dans l'app, ou reçu par la coque Android, n'y passe
 * jamais. Sans ce miroir, la coque rendait ces liens au navigateur, quand
 * l'iPhone les ouvre dans l'app (`DeepLinkRouter.swift`).
 */
export const LEGACY_PATH_ALIASES: readonly (readonly [pattern: string, target: string])[] = [
  ['^/join/(.+)$', '/chat/$1'],
  ['^/conversations/(?!new/?$)([^/]+)/?$', '/c/$1'],
  ['^/conversation/([^/]+)/?$', '/c/$1'],
  ['^/p/(.+)$', '/feeds/post/$1'],
  ['^/s/(.+)$', '/story/$1'],
  ['^/users/(.+)$', '/u/$1'],
];

const ALIASES = LEGACY_PATH_ALIASES.map(([pattern, target]) => [new RegExp(pattern, 'u'), target] as const);

/** La forme canonique d'un chemin : sa cible quand c'est une ancienne adresse, lui-même sinon. */
export const canonicalAppPath = (pathname: string): string => {
  const alias = ALIASES.find(([pattern]) => pattern.test(pathname));
  return alias === undefined ? pathname : pathname.replace(alias[0], alias[1]);
};
