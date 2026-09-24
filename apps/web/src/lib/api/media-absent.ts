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
 *
 * DEUX FAÇONS DONT CE VERDICT MENTAIT (#7022 suivi — revue adversariale
 * 2026-09-18), toutes deux corrigées ICI plutôt que chez chaque surface :
 *
 * 1. HORS LIGNE, `onError` NE PROUVE RIEN. `<img onError>` tire pour un 404
 *    exactement comme pour un 401/403, un 5xx, un CORS refusé ou une antenne
 *    coupée. Défiler un fil hors-ligne échouait donc CHAQUE image, la gravait
 *    absente, et au retour du réseau elles restaient toutes « indisponibles »
 *    jusqu'à un rechargement complet — alors que leurs octets n'avaient jamais
 *    bougé. `navigator.onLine === false` (`lib/net/online.ts`) est le seul
 *    signal FIABLE dont dispose ce module : il ne garantit jamais qu'une
 *    requête passerait, mais son absence dit qu'aucune n'avait de sens à
 *    retenir.
 * 2. LE REGISTRE SURVIVAIT AU CHANGEMENT DE COMPTE. A ouvre une publication
 *    dont un média lui est REFUSÉ (403) → la source est gravée absente ; A se
 *    déconnecte, B se connecte dans le MÊME onglet (SPA, pas de rechargement)
 *    → B, qui a le DROIT de voir ce média, hérite du verdict de A pour toute
 *    sa session. Un registre de MODULE ne connaît que des ÉCHECS DE
 *    CHARGEMENT, jamais une identité — le vider au changement d'identité est
 *    donc à `createAppQueryClient` (`lib/api/query-client.ts`), au même site
 *    que `reactionStore`, pas ici : ce module reste agnostique de la session.
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
 * ATTACHE LE RÉ-ARMEMENT AU RETOUR DE RÉSEAU. Lazy — jamais au chargement du
 * module — parce qu'un `window.addEventListener` posé au TOP-LEVEL courrait
 * avant l'enregistrement du DOM sous certains harnais de test (happy-dom
 * s'enregistre en `beforeAll`, après que les imports statiques du fichier ont
 * déjà évalué ce module) ; en production, `window` existe toujours dès le
 * premier appel de `noteMediaAbsent`/`isMediaAbsent`, donc l'attache a lieu de
 * toute façon avant la première absence réelle. Le rendu SERVEUR
 * (préchauffage institutionnel) n'a ni l'un ni l'autre — `typeof window ===
 * 'undefined'` y rend l'attache un no-op permanent, sans jamais lever.
 *
 * APPELÉ À CHAQUE FOIS, SANS DRAPEAU « déjà fait » (#7022 suivi — revue
 * adversariale 2026-09-18 : un premier jet posait un booléen module-level, et
 * il restait vrai pour rien). `addEventListener` avec la MÊME référence de
 * fonction est idempotent par la spécification DOM — l'attacher deux fois ne
 * la fait pas tirer deux fois (mesuré : trois appels, un seul déclenchement) —
 * donc l'appeler à chaque `noteMediaAbsent`/`isMediaAbsent` ne coûte rien en
 * production. Et c'est ce qui rend le module ROBUSTE à un `window` qui perd
 * ses écouteurs sans changer d'IDENTITÉ : sous `bun test`, `GlobalRegistrator`
 * (`happy-dom`) réutilise le MÊME objet `window` d'un `register()` à l'autre,
 * mais son `unregister()` vide sa table d'écouteurs — un drapeau « déjà
 * attaché » ou une comparaison d'identité de fenêtre restaient donc tous deux
 * vrais après un cycle `beforeAll`/`afterAll` d'un AUTRE fichier de témoins
 * (état happy-dom STATIQUE, partagé par tout le process — voir
 * `test-support/happy-dom-environment.ts`), pendant que l'écouteur réel avait
 * disparu. Réattacher sans condition ferme ce trou sans y penser.
 */
const assurerÉcouteRéseau = (): void => {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', resetAbsentMedia);
};

/**
 * Enregistre une source dont le chargement vient d'ÉCHOUER.
 *
 * Trois sources ne sont jamais retenues :
 * - la chaîne VIDE, qui ne désigne rien et n'a produit aucune requête ;
 * - `blob:` / `data:`, uniques par session et RÉVOQUÉES à la fin de l'envoi.
 *   Les retenir remplirait le plafond d'adresses qui ne reviendront jamais, en
 *   évinçant les absences réelles ;
 * - TOUTE source quand `navigator.onLine === false` (#7022 suivi) : hors
 *   ligne, `onError` ne distingue pas un fichier mort d'une antenne coupée, et
 *   graver l'absence masquerait un média parfaitement vivant jusqu'au
 *   rechargement de la page.
 */
export function noteMediaAbsent(src: string): void {
  assurerÉcouteRéseau();
  if (src === '' || LOCAL_OBJECT_URL.test(src)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
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
  assurerÉcouteRéseau();
  return absent.has(src);
}

/** Pour les témoins uniquement — un registre de module survit d'un test à l'autre. */
export function resetAbsentMedia(): void {
  absent.clear();
}
