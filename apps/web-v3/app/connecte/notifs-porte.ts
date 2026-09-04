import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { actifsTempsReel } from '@/lib/actifs-rt';
import { moi } from '@/lib/api/compte';
import { baseDeLaPasserellePublique } from '@/lib/api/links';
import { boiteDuLecteur, toutMarquerLu, type Recuperateur } from '@/lib/api/notifications';

import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import { documentDesNotifs, type EtatDesNotifs } from './notifs-vue';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/notifications` — la même loi que la zone connectée, et un
 * appel de moins.
 *
 * `app/connecte/porte.ts` demande TOUJOURS `/conversations` : c'est juste pour
 * le tableau de bord et pour `/chats`, qui les rendent. Cet écran n'en rend
 * aucune, et son doc-comment tient déjà le raisonnement pour `/links` — « une
 * décision de COÛT, pas un réglage d'affichage ». Lui faire payer un
 * troisième aller-retour sur une 3G rurale serait une lenteur, c'est-à-dire un
 * bug. La porte vit donc ici, avec SES appels : `/auth/me` et
 * `/notifications`, ensemble.
 *
 * LES TROIS QUESTIONS SONT LES MÊMES, dans le même ordre : un jeton ? la
 * passerelle l'accepte-t-elle ? a-t-elle répondu ? Un 401 renvoie se
 * connecter — c'est le cas NOMINAL d'un retour après quelques jours, pas une
 * erreur — et un silence dessine la panne plutôt qu'une page blanche.
 */

const CHEMIN = '/notifications';

const versLaConnexion = (): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

/**
 * `?tout-lu` est posé par la REDIRECTION du POST, jamais par le lecteur : c'est
 * le Post/Redirect/Get qui porte le compte rendu de l'action. Un rechargement
 * ne rejoue donc rien, et le bouton « précédent » ne remarque pas deux fois
 * « tout est lu ».
 */
const TEMOIN_DE_L_ACTION = 'tout-lu';

const aToutLu = (requete: Request): boolean =>
  new URL(requete.url).searchParams.has(TEMOIN_DE_L_ACTION);

/**
 * LE SOCLE DU MODULE DE PARTICIPATION (#4898) — `null` tant que l'actif
 * compilé est absent (tests, avant le premier `bun build`) : le chemin SANS
 * JavaScript reste alors le SEUL chemin, ce qui est toujours correct
 * (amélioration progressive, jamais une condition, § 12.4). Contrairement au
 * fil social, cet écran a besoin du SOCKET : les événements `notification:*`
 * arrivent par la room personnelle du lecteur.
 */
const moduleDeParticipation = (): EtatDesNotifs['tempsReel'] => {
  const actifs = actifsTempsReel();
  if (actifs.notifs.corps === '') return null;
  return { module: actifs.notifs.url, socket: actifs.socket.url, passerelle: baseDeLaPasserellePublique() };
};

const sert = async ({
  jeton,
  toutLu,
  recuperer,
}: {
  readonly jeton: string;
  readonly toutLu: boolean;
  readonly recuperer?: Recuperateur;
}): Promise<Response> => {
  const [identite, boite] = await Promise.all([
    moi({ jeton, recuperer }),
    boiteDuLecteur({ jeton, recuperer }),
  ]);

  if (identite.genre === 'session-expiree' || boite.genre === 'session-expiree') {
    return versLaConnexion();
  }
  if (boite.genre === 'panne') return rendu(documentDePanne(), 503);

  return rendu(
    documentDesNotifs({
      notifications: boite.notifications,
      nonLues: boite.nonLues,
      maintenant: Date.now(),
      toutLu,
      tempsReel: moduleDeParticipation(),
    }),
  );
};

export const BOITE = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  return sert({ jeton, toutLu: aToutLu(requete), recuperer });
};

/**
 * « TOUT LIRE » — et sa RÉPONSE est une redirection, pas un document.
 *
 * Post/Redirect/Get : sans lui, un rechargement REJOUERAIT le POST, et le
 * bouton « précédent » ramènerait à un formulaire déjà soumis. Le témoin
 * `?tout-lu` voyage dans la redirection pour que l'écran DISE ce qu'il vient de
 * faire — une action muette laisse le doute exactement là où elle prétendait
 * le lever.
 *
 * L'ORIGINE EST VÉRIFIÉE AVANT TOUT. Un POST déclenché depuis un autre site
 * marquerait la boîte du lecteur comme lue à son insu : la garde est celle que
 * les autres surfaces d'écriture de la v3 emploient déjà (`app/provenance.ts`),
 * jamais une jumelle.
 *
 * UN ÉCHEC NE MENT PAS. Si la passerelle refuse, on re-sert la boîte SANS le
 * témoin : le lecteur voit ses non-lues intactes, ce qui est la vérité, plutôt
 * qu'un « tout est lu » que rien n'a fait.
 */
export const TOUT_LIRE = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  const issue = await toutMarquerLu({ jeton, recuperer });
  if (issue === 'session-expiree') return versLaConnexion();
  if (issue === 'panne') return sert({ jeton, toutLu: false, recuperer });

  return redirection(`${CHEMIN}?${TEMOIN_DE_L_ACTION}`, { 'cache-control': CACHE_PRIVE });
};
