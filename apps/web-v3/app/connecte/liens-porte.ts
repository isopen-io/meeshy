import { jetonDuLecteur } from '@/app/session';
import { carnetDeLiens, type Recuperateur } from '@/lib/api/compte';

import { CACHE_PRIVE, rendu } from './fil-porte';
import { documentDesLiens } from './liens-vue';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/links` — un seul appel, et c'est tout ce dont l'écran a besoin.
 *
 * NI `/auth/me` NI `/conversations`. La zone connectée demande toujours les
 * deux ; cet écran ne rend ni le nom du lecteur ni ses conversations, et son
 * unique appel lui dit déjà tout — y compris si le jeton vaut encore. Deux
 * aller-retours économisés sur une 3G rurale, sur un écran qui n'aurait rien su
 * en faire.
 *
 * C'est le même raisonnement que `/notifications` et `/contacts`, poussé d'un
 * cran : là-bas `/auth/me` restait nécessaire — pour le chrome de la boîte,
 * pour CLASSER les demandes des contacts. Ici, rien.
 *
 * LES TROIS QUESTIONS SONT LES MÊMES, dans le même ordre : un jeton ? la
 * passerelle l'accepte-t-elle ? a-t-elle répondu ? Un 401 renvoie se
 * connecter — le cas NOMINAL d'un retour après quelques jours — et un silence
 * dessine la panne plutôt qu'une page blanche.
 */

const CHEMIN = '/links';

const versLaConnexion = (): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

export const CARNET_DE_LIENS = async (
  requete: Request,
  recuperer?: Recuperateur,
): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  const carnet = await carnetDeLiens({ jeton, recuperer });
  if (carnet.genre === 'session-expiree') return versLaConnexion();
  if (carnet.genre === 'panne') return rendu(documentDePanne(), 503);

  return rendu(documentDesLiens({ liens: carnet.liens, actifs: carnet.actifs }));
};
