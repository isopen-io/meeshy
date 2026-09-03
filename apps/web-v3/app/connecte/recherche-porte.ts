import { jetonDuLecteur } from '@/app/session';
import { cherche, type Recuperateur } from '@/lib/api/recherche';
import { PARAMETRE_DE_RECHERCHE } from '@/lib/contenu/recherche';

import { CACHE_PRIVE, rendu } from './fil-porte';
import { documentDeLaRecherche } from './recherche-vue';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/search`.
 *
 * NI `/auth/me` NI `/conversations` — comme `/links`. Cet écran ne rend ni le
 * nom du lecteur ni ses conversations ; ses deux appels lui disent déjà si le
 * jeton vaut encore.
 *
 * ET SANS REQUÊTE, AUCUN APPEL DU TOUT. `q` est requis par
 * `/conversations/search` (`minLength: 1`) : ouvrir l'écran sans terme rendrait
 * un 400 au premier appel et n'aurait rien à montrer au second. L'écran s'ouvre
 * donc sur son invitation, en ZÉRO aller-retour — la page la plus rapide de la
 * v3 est celle qui ne demande rien.
 *
 * LA REQUÊTE VIENT DE L'ADRESSE, ET C'EST DÉLIBÉRÉ. Un `GET` de formulaire rend
 * le résultat rechargeable, partageable, retrouvable par le bouton
 * « précédent » — ce qu'un `POST` interdirait. La conséquence à assumer : le
 * terme cherché figure dans l'historique du navigateur et dans les journaux des
 * intermédiaires. C'est le contrat NORMAL d'une recherche (tous les moteurs le
 * font), et il ne porte ici ni identifiant ni secret : ce que le lecteur tape
 * est un nom qu'il connaît déjà.
 *
 * LES TROIS QUESTIONS SONT LES MÊMES : un jeton ? la passerelle l'accepte-t-elle ?
 * a-t-elle répondu ? Un 401 renvoie se connecter, un silence dessine la panne.
 */

const CHEMIN = '/search';

const versLaConnexion = (): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

/**
 * LE TERME EST BORNÉ AVANT D'ÊTRE ENVOYÉ. Un `?q=` de plusieurs kilo-octets est
 * gratuit à écrire et coûteux à servir ; la passerelle a ses propres gardes,
 * mais un client qui les laisse travailler pour lui a déjà envoyé la requête.
 * Cent vingt caractères tiennent tout nom de personne et tout titre de
 * conversation.
 */
const LONGUEUR_MAX = 120;

const termeDemande = (requete: Request): string =>
  (new URL(requete.url).searchParams.get(PARAMETRE_DE_RECHERCHE) ?? '').slice(0, LONGUEUR_MAX);

export const RECHERCHE_SERVIE = async (
  requete: Request,
  recuperer?: Recuperateur,
): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  const terme = termeDemande(requete);

  const trouvailles = await cherche({ jeton, requete: terme, recuperer });
  if (trouvailles.genre === 'session-expiree') return versLaConnexion();
  if (trouvailles.genre === 'panne') return rendu(documentDePanne(), 503);

  return rendu(
    documentDeLaRecherche({
      requete: terme,
      conversations: trouvailles.conversations,
      personnes: trouvailles.personnes,
      encoreDesPersonnes: trouvailles.encoreDesPersonnes,
    }),
  );
};
