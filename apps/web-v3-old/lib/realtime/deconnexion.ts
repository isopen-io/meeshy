import { effaceToutesLesPlaces } from '@/lib/api/guest-session';
import { effaceLaSessionLegacy, lisLeJetonDeSession } from '@/lib/api/session-legacy';
import { SIGNAL_DE_DECONNEXION } from '@/lib/sw/signal';

/**
 * LA SORTIE, CÔTÉ NAVIGATEUR — l'amélioration progressive du formulaire de
 * l'espace membre (#5095, § E5 de la spécification). Le chemin SANS JavaScript
 * reste le formulaire lui-même : `POST /deconnexion` expire déjà les deux
 * cookies du membre et chaque place invitée présentée
 * (`app/authentification/deconnexion-porte.ts`). Ce module ajoute ce qu'un
 * `Set-Cookie` ne peut pas faire — relayer le jeton de session, vider
 * `localStorage`, prévenir le travailleur de zone —, et RIEN D'AUTRE.
 *
 * DEUX HÔTES SERVENT CE FORMULAIRE, PAS UN : `feuilleDeLEspace` est composée
 * par `app/connecte/vue.ts` (le TABLEAU DE BORD, `/?espace`) ET par
 * `app/connecte/liste-vue.ts` (`/chats?espace`). Le tableau de bord n'expédie
 * PAS le module de participation (`vue.ts:99` : « il ne paie pas des fentes
 * que rien ne remplit ») — n'armer que depuis `liste.ts` laissait donc la
 * sortie du tableau de bord SANS purge : session legacy conservée, places
 * invitées conservées, caches de zone conservés, jeton de session jamais
 * relayé. L'armement se fait donc DEPUIS CHAQUE MODULE que ces documents
 * servent — `liste.ts` et `navigateur.ts` — et cette fonction est IDEMPOTENTE
 * pour que les deux ensemble ne posent qu'un seul écouteur.
 *
 * L'ÉCOUTEUR EST DÉLÉGUÉ SUR LE DOCUMENT, jamais posé sur le formulaire : la
 * surimpression de l'espace est rendue HORS de `<main>` (`app/enveloppe/vue.ts:198`)
 * et le navigateur de zone échange `<main>` — un écouteur posé sur un nœud
 * précis ne survivrait ni à l'échange ni à un formulaire arrivé après
 * l'armement.
 *
 * `preventDefault` N'EST JAMAIS APPELÉ. La soumission native part TOUJOURS :
 * c'est elle qui porte l'effet serveur (les cookies), ce module n'est qu'un
 * geste supplémentaire posé AVANT qu'elle parte. Chaque étape est
 * BEST-EFFORT — une exception dans l'une n'empêche jamais les suivantes, ni la
 * soumission elle-même.
 */

/** L'adresse de la sortie, telle que `formulaireDeSortie()` l'écrit. */
const ACTION_DE_SORTIE = '/deconnexion';

/** Le marqueur d'idempotence — porté par le DOCUMENT, seul terrain que deux modules ES partagent. */
const MARQUEUR = 'meeshyDeconnexionArmee';

const essaie = (etape: () => void): void => {
  try {
    etape();
  } catch {
    // best-effort — voir le doc-comment ci-dessus.
  }
};

/** Le champ caché `session` — rempli depuis le détenteur, pour que le formulaire relaie le jeton de session à la porte. */
const remplitLeChampDeSession = (formulaire: HTMLFormElement): void => {
  const champ = formulaire.elements.namedItem('session');
  if (!(champ instanceof HTMLInputElement)) return;
  champ.value = lisLeJetonDeSession() ?? '';
};

/**
 * Prévient le travailleur de zone — LE CONTRÔLEUR D'ABORD, SYNCHRONEMENT.
 *
 * `getRegistrations()` rend une PROMESSE, et sa suite s'exécute dans une
 * micro-tâche : la soumission native est déjà partie, et rien ne garantit que
 * le document vive encore quand elle arrive. Le signal — donc la purge, donc
 * le critère 3 — se perdrait alors en silence, exactement le défaut qu'on
 * corrige. `navigator.serviceWorker.controller` est disponible IMMÉDIATEMENT
 * dès que la page est contrôlée (`/chats` l'est : elle est dans `V3_SW_PORTEES`)
 * : on l'utilise en premier, sans attendre.
 *
 * Le balayage asynchrone reste, pour les documents que le worker ne contrôle
 * PAS encore (première visite, portée voisine) : deux messages au même
 * travailleur ne coûtent qu'une seconde purge, sans effet — l'inverse coûte le
 * cache d'un compte laissé sur un appareil partagé.
 */
const previensLeTravailleur = (): void => {
  const conteneur = navigator.serviceWorker;
  if (conteneur === undefined) return;

  conteneur.controller?.postMessage({ type: SIGNAL_DE_DECONNEXION });

  conteneur
    .getRegistrations()
    .then((registrations) => {
      for (const registration of registrations) {
        registration.active?.postMessage({ type: SIGNAL_DE_DECONNEXION });
      }
    })
    .catch(() => {
      // best-effort — un worker qui ne répond pas laisse ses entrées
      // segmentées par jeton (§ 9, Q2 de la spécification).
    });
};

/**
 * Arme la sortie pour TOUT le document — appelable depuis chaque module, au
 * plus un écouteur posé.
 */
export const armeLaDeconnexion = (racine: Document = document): void => {
  const porteur = racine.documentElement;
  if (porteur === null) return;
  if (porteur.dataset[MARQUEUR] === '1') return;
  porteur.dataset[MARQUEUR] = '1';

  racine.addEventListener('submit', (evenement) => {
    const formulaire = evenement.target;
    if (!(formulaire instanceof HTMLFormElement)) return;
    if (formulaire.getAttribute('action') !== ACTION_DE_SORTIE) return;

    essaie(() => remplitLeChampDeSession(formulaire));
    essaie(effaceLaSessionLegacy);
    essaie(effaceToutesLesPlaces);
    essaie(previensLeTravailleur);
  });
};
