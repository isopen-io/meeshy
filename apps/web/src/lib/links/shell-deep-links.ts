/**
 * **UN LIEN MEESHY OUVERT SUR ANDROID OUVRE L'APP SUR SON ÉCRAN** (#5819) —
 * la moitié « entrée système » du lien profond, dont #5812 (D-27) a réparé
 * l'autre moitié (une WebView pointée sur `/c/<id>` rend le fil).
 *
 * La coque déclare les App Links de `meeshy.me` et le schéma court
 * `meeshy://` (`AndroidManifest.xml`) ; `MeeshyLinksPlugin.java` relaie
 * chaque intent reçu — lancement à froid compris, l'événement étant RETENU
 * jusqu'à ce que cet écouteur s'abonne — par l'événement `appUrlOpen`. Ici,
 * l'adresse devient un chemin du routeur, avec la même loi que les liens
 * touchés dans un message (`internal-link.ts`, #7849) : un chemin que l'app
 * ne sert pas ne navigue pas.
 */
import { internalPathOf } from '@/lib/links/internal-link';
import type { CoqueNative } from '@/lib/native-shell';

export const PONT_LIENS = 'MeeshyLinks';
const EVENEMENT = 'appUrlOpen';
const SCHEMA_COURT = 'meeshy:';

const lire = (href: string): URL | null => {
  try {
    return new URL(href);
  } catch {
    return null;
  }
};

/**
 * `meeshy://c/abc` — l'hôte est le premier segment, comme le lit
 * `DeepLinkRouter.swift` côté iOS : l'adresse équivalente est `/c/abc`.
 */
const cheminDuSchemaCourt = (url: URL, isAppPath: (path: string) => boolean): string | null => {
  const pathname = `/${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  return isAppPath(pathname) ? `${pathname}${url.search}${url.hash}` : null;
};

/** Le chemin in-app d'un lien reçu par la coque, ou `null` s'il ne mène à aucun écran. */
export function cheminDuLienEntrant(href: string, isAppPath: (path: string) => boolean): string | null {
  const url = lire(href);
  if (url === null) return null;
  if (url.protocol === SCHEMA_COURT) return cheminDuSchemaCourt(url, isAppPath);
  return internalPathOf(href, { origins: [], isAppPath });
}

const urlDe = (donnees: unknown): string | null => {
  const url = (donnees as { readonly url?: unknown } | null)?.url;
  return typeof url === 'string' ? url : null;
};

/**
 * Abonne le routeur aux liens reçus par la coque. Rend `false` quand l'hôte
 * n'est pas une coque qui déclare le pont — un navigateur, ou une coque
 * construite avant lui.
 */
export function ecouterLiensEntrants(
  coque: CoqueNative | undefined,
  hote: { readonly isAppPath: (path: string) => boolean; readonly navigate: (chemin: string) => void },
): boolean {
  const declare = coque?.PluginHeaders?.some((header) => header.name === PONT_LIENS) === true;
  const addListener = coque?.addListener;
  if (!declare || typeof addListener !== 'function') return false;
  addListener(PONT_LIENS, EVENEMENT, (donnees) => {
    const href = urlDe(donnees);
    const chemin = href === null ? null : cheminDuLienEntrant(href, hote.isAppPath);
    if (chemin !== null) hote.navigate(chemin);
  });
  return true;
}
