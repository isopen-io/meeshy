/**
 * Le segment de service, SANS préfixe versionné (#4324).
 *
 * Il valait `/api/v1/attachments/file/` : une version en dur, qui faisait rendre
 * `null` à `relativePathFromUrl` pour toute autre forme — donc pour les 514
 * attachements stockés en CLÉ NUE, dont `deleteMedia` ne supprimait alors rien,
 * en silence. Chercher le segment SEUL accepte les trois adresses que la
 * passerelle sert (`/api/v1/…`, `/api/…`, et toute version future) sans qu'aucune
 * ne soit écrite ici.
 */
const ATTACHMENTS_FILE_SEGMENT = '/attachments/file/';

/**
 * La clé de stockage d'une adresse de média, sous les trois formes que la base
 * porte (clé nue, `/api[/vN]/attachments/file/<clé encodée>`, adresse absolue).
 * `null` quand la valeur ne désigne aucun de nos fichiers.
 */
export function storageKeyFromMediaUrl(fileUrl: string): string | null {
  let pathname = fileUrl;
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    try {
      pathname = new URL(fileUrl).pathname;
    } catch {
      return null;
    }
  }

  const idx = pathname.indexOf(ATTACHMENTS_FILE_SEGMENT);
  if (idx === -1) {
    // Pas de segment de service : c'est peut-être la CLÉ DE STOCKAGE elle-même,
    // la seule forme que la base doive porter. Une clé n'a ni schéma ni barre
    // initiale — ce qui la distingue d'un chemin étranger comme `/media/x.jpg`,
    // dont on ne sait pas s'il désigne un de nos fichiers.
    const estUneCle =
      fileUrl.length > 0 && !fileUrl.startsWith('/') && !fileUrl.includes('://');
    return estUneCle ? fileUrl : null;
  }

  const encoded = pathname.slice(idx + ATTACHMENTS_FILE_SEGMENT.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}
