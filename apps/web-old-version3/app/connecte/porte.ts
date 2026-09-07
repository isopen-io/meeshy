import {
  conversations,
  liensDuLecteur,
  moi,
  sansArchivees,
  type Conversation,
  type Lecteur,
  type LiensDuLecteur,
  type Recuperateur,
} from '@/lib/api/compte';

import { jetonDuLecteur } from '@/app/session';

import { espaceDemande } from './espace-vue';
import { documentDePanne, documentDuTableau } from './vue';

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
 * LES APPELS PARTENT ENSEMBLE. `/auth/me`, `/conversations` et — pour le
 * tableau de bord seul — `/links` ne dépendent pas les uns des autres : les
 * enchaîner multiplierait la latence du seul aller-retour que cette page paie.
 *
 * `avecLiens` n'est pas un réglage d'affichage mais une décision de COÛT : la
 * liste des conversations ne rend aucune section « Mes liens », et lui faire
 * payer un troisième appel sur une 3G rurale serait une lenteur — c'est-à-dire
 * un bug, pas une dette.
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
  readonly liens: LiensDuLecteur;
};

/**
 * `requete` est passée à l'écran parce que la liste LIT son adresse : le chemin
 * sans JavaScript répond à un geste par une redirection (Post/Redirect/Get), et
 * `?fait=` est la seule voix qu'il a pour dire ce qui vient d'avoir lieu. Le
 * tableau de bord l'ignore — il ne répond à aucun geste.
 *
 * ASYNCHRONE parce que `/chats` a une SECONDE raison de parler à la
 * passerelle — le profil d'un participant (`?profil=`, § 12.10.3), une
 * requête de plus SEULEMENT quand elle est demandée. Le tableau de bord rend
 * toujours de façon synchrone ; `await` sur une valeur qui n'est pas une
 * promesse résout immédiatement, donc rien n'y change.
 */
/**
 * `recuperer` ARRIVE JUSQU'À L'ÉCRAN, et c'est ce qui rend ses propres appels
 * mesurables. Un écran ne se contente pas toujours de la charge commune : le
 * profil d'un participant (`?profil=`) et le carnet de la feuille de création
 * (`?nouvelle`) sont demandés PAR l'écran, dans leur état seulement. Sans ce
 * quatrième argument, ces appels-là échappaient à toute couture — un témoin
 * pouvait opposer un serveur à la porte, jamais à ce que l'écran demande
 * ensuite. Il n'est jamais fourni en production.
 */
export type Ecran = (
  charge: Charge,
  maintenant: number,
  requete: Request,
  recuperer?: Recuperateur,
) => string | Promise<string>;

/**
 * `recuperer` est la MÊME couture que celle de `connexion` / `conversations` :
 * elle laisse un témoin opposer un serveur à la porte sans lancer de serveur.
 * Elle n'est jamais fournie en production — la valeur par défaut est `fetch`.
 */
export const serviteurDe =
  ({
    chemin,
    ecran,
    avecLiens = false,
    recuperer,
    statut = 200,
  }: {
    readonly chemin: string;
    readonly ecran: Ecran;
    readonly avecLiens?: boolean;
    readonly recuperer?: Recuperateur;
    /**
     * LE STATUT DU DOCUMENT SERVI — 200 pour une lecture, autre chose quand ce
     * même document est la RÉPONSE À UN REFUS. `/chats` re-sert sa liste avec
     * la feuille de création et son alerte quand la passerelle refuse
     * (`CREE_UNE_CONVERSATION`) : le document est juste, l'écriture a échoué,
     * et un 200 le dirait réussi à tout ce qui lit les statuts. Il vaut mieux
     * un champ de plus ici qu'une seconde façon de charger la même page.
     */
    readonly statut?: number;
  }) =>
  async (requete: Request, recuperant?: Recuperateur): Promise<Response> => {
    // L'APPELANT L'EMPORTE SUR L'OPTION : un témoin oppose son serveur à la
    // porte sans reconstruire le serviteur, et la production n'en passe aucun.
    const recuperer_ = recuperant ?? recuperer;

    const jeton = jetonDuLecteur(requete);
    if (jeton === null) return versLaConnexion(chemin);

    const [identite, fil, liens] = await Promise.all([
      moi({ jeton, recuperer: recuperer_ }),
      conversations({ jeton, recuperer: recuperer_ }),
      avecLiens
        ? liensDuLecteur({ jeton, recuperer: recuperer_ })
        : Promise.resolve<LiensDuLecteur>({ genre: 'indisponible' }),
    ]);

    if (identite.genre === 'session-expiree' || fil.genre === 'session-expiree') {
      return versLaConnexion(chemin);
    }
    if (fil.genre === 'panne') return rendu(documentDePanne(), 503);

    return rendu(
      await ecran(
        {
          lecteur: identite.genre === 'lecteur' ? identite.lecteur : null,
          // LES ARCHIVÉES N'ATTEIGNENT AUCUN DES DEUX ÉCRANS. `GET
          // /conversations` les SERT (aucun `isArchived` dans son `whereClause`,
          // mesuré) : c'est ici, à l'UNIQUE endroit qui compose la charge des
          // deux écrans, qu'elles sortent. Sans cela, « Archiver » écrivait une
          // préférence que rien ne relisait.
          conversations: sansArchivees(fil.conversations),
          total: fil.total,
          liens,
        },
        Date.now(),
        requete,
        recuperer_,
      ),
      statut,
    );
  };

export const TABLEAU = serviteurDe({
  chemin: '/',
  avecLiens: true,
  // LE TABLEAU LIT SON ADRESSE DEPUIS QU'IL A UN ÉTAT. `?espace` ouvre la
  // feuille de l'espace membre — un état d'ADRESSE, comme `?profil=` sur la
  // liste : il se partage, il revient au « précédent », et il ne coûte pas un
  // octet de JavaScript. Le doc-comment de `Ecran` disait « le tableau de bord
  // l'ignore — il ne répond à aucun geste » : c'est resté vrai des GESTES (il
  // n'a toujours aucun POST), plus des états.
  ecran: (charge, maintenant, requete) =>
    documentDuTableau({ ...charge, maintenant, espace: espaceDemande(requete) }),
});

export { CACHE_PRIVE, rendu, versLaConnexion };
