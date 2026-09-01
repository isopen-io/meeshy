import {
  conversations,
  moi,
  type Conversation,
  type Lecteur,
  type Recuperateur,
} from '@/lib/api/compte';

import { jetonDuLecteur } from '@/app/session';

import { documentDePanne, documentDesChats, documentDuTableau } from './vue';

/**
 * LA PORTE DE LA ZONE CONNECTÉE — une seule, pour les deux écrans.
 *
 * Elle répond à trois questions dans cet ordre, et l'ordre est le fond :
 *
 *   1. **Y a-t-il un jeton ?** Non ⇒ `/login`, avec le chemin demandé en
 *      `returnUrl` pour y revenir après. Ce n'est pas une garde de sécurité —
 *      c'est un aiguillage : la vraie garde est la passerelle.
 *   2. **La passerelle l'accepte-t-elle ?** Non (401/403) ⇒ `/login` aussi. Une
 *      session expirée est le cas NOMINAL d'un retour après quelques jours ; la
 *      traiter en erreur ferait lire « une erreur est survenue » à qui doit
 *      simplement se reconnecter.
 *   3. **A-t-elle répondu ?** Non ⇒ l'écran de panne, DESSINÉ. Un écran blanc
 *      et un écran d'erreur ne coûtent pas le même effort au lecteur.
 *
 * LES DEUX APPELS PARTENT ENSEMBLE. `/auth/me` et `/conversations` ne dépendent
 * pas l'un de l'autre : les enchaîner doublerait la latence du seul
 * aller-retour que cette page paie.
 */

const CACHE_PRIVE = 'no-store, private';

const versLaConnexion = (chemin: string): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(chemin)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

const rendu = (html: string, statut = 200): Response =>
  new Response(html, {
    status: statut,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // La page porte les conversations d'UNE personne : ni un intermédiaire ni
      // le bouton « précédent » ne doivent la resservir à la suivante.
      'cache-control': CACHE_PRIVE,
      'x-robots-tag': 'noindex, nofollow',
    },
  });

export type Charge = {
  readonly lecteur: Lecteur | null;
  readonly conversations: readonly Conversation[];
  readonly total: number;
};

export type Ecran = (charge: Charge, maintenant: number) => string;

/**
 * `recuperer` est la MÊME couture que celle de `connexion` / `conversations` :
 * elle laisse un témoin opposer un serveur à la porte sans lancer de serveur.
 * Elle n'est jamais fournie en production — la valeur par défaut est `fetch`.
 */
export const serviteurDe =
  (chemin: string, ecran: Ecran, recuperer?: Recuperateur) =>
  async (requete: Request): Promise<Response> => {
    const jeton = jetonDuLecteur(requete);
    if (jeton === null) return versLaConnexion(chemin);

    const [identite, fil] = await Promise.all([
      moi({ jeton, recuperer }),
      conversations({ jeton, recuperer }),
    ]);

    if (identite.genre === 'session-expiree' || fil.genre === 'session-expiree') {
      return versLaConnexion(chemin);
    }
    if (fil.genre === 'panne') return rendu(documentDePanne(), 503);

    return rendu(
      ecran(
        {
          lecteur: identite.genre === 'lecteur' ? identite.lecteur : null,
          conversations: fil.conversations,
          total: fil.total,
        },
        Date.now(),
      ),
    );
  };

export const TABLEAU = serviteurDe('/', (charge, maintenant) =>
  documentDuTableau({ ...charge, maintenant }),
);

export const LISTE_DES_CHATS = serviteurDe('/chats', (charge, maintenant) =>
  documentDesChats({ conversations: charge.conversations, maintenant }),
);
