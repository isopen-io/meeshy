/**
 * LE REGISTRE DES MÉDIAS ABSENTS (#7022) — la mémoire, à l'échelle de la
 * SESSION, des références dont on a MESURÉ qu'elles ne rendent aucun octet.
 *
 * CE QU'IL FERME. 8 fichiers sur 2912 sont réellement absents du volume de
 * production (mesuré le 2026-09-18 dans `meeshy-gateway`, boucle sur
 * `filePath`) et ils le resteront. Chacun produit aujourd'hui un 404 par
 * MONTAGE de la surface qui le porte — et une surface virtualisée remonte à
 * chaque passage du défilement. Le symptôme visible est une cascade d'erreurs
 * en console et un trou dans l'interface ; le symptôme invisible est une
 * requête réseau que rien n'arrête.
 *
 * POURQUOI UN MODULE, ET PAS UN ÉTAT DE COMPOSANT. Le dépôt retient déjà cet
 * échec — trois fois, et trois fois LOCALEMENT : `mediaFailed` dans
 * `story.tsx`, `errored` dans `scene-object-media.tsx`, et le
 * `currentTarget.style.display = 'none'` au `onError` d'`Avatar`. Un état local
 * meurt avec son composant. La connaissance « ce fichier n'existe pas »
 * n'appartient pas à une rangée : c'est une propriété de la RÉFÉRENCE, et elle
 * vaut pour toutes les surfaces qui la portent — story, post et message.
 *
 * CE QU'IL NE FAIT PAS. Il ne met aucun octet en cache, ne retente rien, ne
 * parle à aucune couche réseau. Il retient des ÉCHECS, et c'est le seul savoir
 * qu'aucune autre couche ne conserve : un 404 n'entre ni dans le cache HTTP
 * utile, ni dans le seau `medias` du service worker.
 *
 * SON VERDICT N'EST JAMAIS SPÉCULATIF. Une source qu'il ne connaît pas n'est
 * pas absente — il ne répond que sur ce qu'un `onError` lui a APPRIS. C'est ce
 * qui le rend sans risque : au pire il ignore une absence, jamais il ne cache
 * un média qui existe.
 */

/**
 * LE PLAFOND (dimension 3 — « aucun cache non borné »). Un fil infini
 * parcouru une heure ferait sinon croître ce registre sans fin. 256 est large
 * devant les 8 absences réelles de la production, et l'éviction est la PLUS
 * ANCIENNE : oublier une absence coûte UNE requête de plus, une fuite mémoire
 * coûte l'onglet.
 */
export const ABSENT_MEDIA_CAPACITY = 256;

/**
 * `Map` et non `Set` pour l'INTENTION : l'ordre d'insertion d'une `Map` est sa
 * file d'éviction, et `keys().next()` en donne la tête sans parcourir.
 */
const absent = new Map<string, true>();

/** Un aperçu LOCAL — la pièce choisie, pas encore envoyée (`attachmentPreviewOf`). */
const LOCAL_OBJECT_URL = /^(blob:|data:)/i;

/**
 * Enregistre une source dont le chargement vient d'ÉCHOUER.
 *
 * Deux sources ne sont jamais retenues, pour la même raison — leur adresse
 * n'apprend rien sur un fichier :
 * - la chaîne VIDE, qui ne désigne rien et n'a produit aucune requête ;
 * - `blob:` / `data:`, uniques par session et RÉVOQUÉES à la fin de l'envoi.
 *   Les retenir remplirait le plafond d'adresses qui ne reviendront jamais, en
 *   évinçant les absences réelles.
 */
export function noteMediaAbsent(src: string): void {
  if (src === '' || LOCAL_OBJECT_URL.test(src)) return;
  if (absent.has(src)) return;

  if (absent.size >= ABSENT_MEDIA_CAPACITY) {
    const plusAncienne = absent.keys().next();
    if (plusAncienne.done !== true) absent.delete(plusAncienne.value);
  }
  absent.set(src, true);
}

/**
 * La source a-t-elle DÉJÀ échoué dans cette session ?
 *
 * Une surface l'interroge AVANT de poser son `src` : vrai ⇒ elle rend son état
 * dessiné sans jamais monter l'élément, donc sans requête et sans 404 de plus.
 */
export function isMediaAbsent(src: string): boolean {
  return absent.has(src);
}

/** Pour les témoins uniquement — un registre de module survit d'un test à l'autre. */
export function resetAbsentMedia(): void {
  absent.clear();
}
