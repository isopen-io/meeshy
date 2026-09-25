/**
 * **UN LIEN MEESHY TOUCHÉ DANS L'APP S'OUVRE DANS L'APP** (#7849) — miroir de
 * `InAppLinks` côté iOS (#7808).
 *
 * Sans cette règle, `https://meeshy.me/u/alice` écrit dans un message partait
 * dans un nouvel onglet — et, dans la coque Capacitor, dans le NAVIGATEUR
 * EXTERNE : l'utilisateur quittait l'app pour y revenir par la page web.
 *
 * Une adresse est interne quand son HÔTE est celui de Meeshy (production,
 * staging, l'origine publique de l'environnement, l'origine de la page) ET
 * que son CHEMIN est servi par la table des routes. Un chemin inconnu (une
 * page statique, `/privacy`) reste un lien sortant : l'app n'a pas d'écran à
 * lui donner.
 */

const MEESHY_HOSTS = ['meeshy.me', 'www.meeshy.me', 'staging.meeshy.me'] as const;

export type InternalLinkContext = {
  /** Les origines supplémentaires tenues pour Meeshy (`https://…`). */
  readonly origins: readonly string[];
  /** Le chemin est-il servi par un écran de l'app ? */
  readonly isAppPath: (path: string) => boolean;
};

const hostOf = (origin: string): string | null => {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
};

/** Le chemin in-app (`/u/alice?x=1#y`) d'un lien Meeshy, ou `null` s'il sort. */
export function internalPathOf(href: string, context: InternalLinkContext): string | null {
  const parsed = (() => {
    try {
      return new URL(href);
    } catch {
      return null;
    }
  })();
  if (parsed === null || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return null;
  const hosts = new Set<string>([
    ...MEESHY_HOSTS,
    ...context.origins.flatMap((origin) => {
      const host = hostOf(origin);
      return host === null ? [] : [host];
    }),
  ]);
  if (!hosts.has(parsed.host.toLowerCase())) return null;
  if (!context.isAppPath(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
