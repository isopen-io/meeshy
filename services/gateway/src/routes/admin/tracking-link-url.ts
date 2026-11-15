/**
 * L'adresse d'un lien de suivi telle que l'administration peut la SERVIR (#8876).
 *
 * `TrackingLinkService` crée un lien de suivi pour CHAQUE adresse brute d'un message,
 * d'une publication ou d'un commentaire. Une invitation collée dans une
 * conversation privée devient donc `https://meeshy.me/chat/<linkId>` — et `linkId`
 * est une clé de jointure (`SHARE_LINK_JOIN_KEY_COLUMNS`) que `POST /links/:key/members`
 * accepte sans créance. Servir cette adresse telle quelle distribue l'entrée de la
 * conversation à toute personne qui lit la console, MODERATOR et AUDIT compris.
 *
 * La console n'a besoin que de l'endroit où mène le lien : l'hôte et le chemin. Le
 * reste — requête, fragment, clé de jointure — n'est pas servi.
 */

const KEYED_PATH_PREFIXES: ReadonlySet<string> = new Set(['chat', 'join', 'l']);

export const REDACTED_KEY_SEGMENT = '…';

function redactPathname(pathname: string): string {
  const segments = pathname.split('/');
  return segments
    .map((segment, index) => {
      const previous = segments[index - 1];
      return previous !== undefined && KEYED_PATH_PREFIXES.has(previous.toLowerCase()) && segment !== ''
        ? REDACTED_KEY_SEGMENT
        : segment;
    })
    .join('/');
}

/** Origine + chemin, sans requête ni fragment, la clé d'un `/chat|join|l/<clé>` remplacée. Illisible ⇒ chaîne vide. */
export function redactTrackingUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.origin}${redactPathname(parsed.pathname)}`;
  } catch {
    return '';
  }
}

/** Le seul fragment de l'adresse qu'un classement lit : son hôte. */
export function trackingUrlHost(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : '';
  } catch {
    return '';
  }
}
