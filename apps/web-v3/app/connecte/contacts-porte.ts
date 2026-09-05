import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { actifsTempsReel } from '@/lib/actifs-rt';
import { moi } from '@/lib/api/compte';
import { baseDeLaPasserellePublique } from '@/lib/api/links';
import {
  carnetDuLecteur,
  repondreALaDemande,
  type Geste,
  type Recuperateur,
} from '@/lib/api/contacts';

import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import { documentDesContacts } from './contacts-vue';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/contacts` — la même loi que la zone connectée, et un appel de
 * moins.
 *
 * `app/connecte/porte.ts` demande TOUJOURS `/conversations` : c'est juste pour
 * le tableau de bord et pour `/chats`, qui les rendent. Cet écran n'en rend
 * aucune. Lui faire payer un aller-retour de plus sur une 3G rurale serait une
 * lenteur, c'est-à-dire un bug — le même raisonnement que `/notifications`.
 *
 * `/auth/me` N'EST PAS FACULTATIF ICI, ET CE N'EST PAS POUR LE CHROME. Le SENS
 * d'une demande se lit en comparant `senderId` à l'identité du lecteur : sans
 * elle, aucune ligne ne peut être classée, et un « Accepter » posé sur sa
 * propre demande serait un contrôle qui ment. L'identité est donc chargée
 * d'abord, et le carnet ensuite — l'un dépend de l'autre, la parallélisation
 * n'est pas possible et l'imiter fabriquerait un classement au petit bonheur.
 *
 * LES TROIS QUESTIONS SONT LES MÊMES, dans le même ordre : un jeton ? la
 * passerelle l'accepte-t-elle ? a-t-elle répondu ? Un 401 renvoie se
 * connecter — c'est le cas NOMINAL d'un retour après quelques jours — et un
 * silence dessine la panne plutôt qu'une page blanche.
 */

const CHEMIN = '/contacts';

const versLaConnexion = (): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

/**
 * Les témoins sont posés par la REDIRECTION du POST, jamais par le lecteur :
 * c'est le Post/Redirect/Get qui porte le compte rendu de l'action. Un
 * rechargement ne rejoue donc rien.
 */
const TEMOINS = { acceptee: 'acceptee', refusee: 'refusee', echouee: 'echouee' } as const;

type Avis = keyof typeof TEMOINS;

const avisDeLURL = (requete: Request): Avis | null => {
  const parametres = new URL(requete.url).searchParams;
  const trouve = (Object.keys(TEMOINS) as readonly Avis[]).find((avis) => parametres.has(avis));
  return trouve ?? null;
};

/**
 * LE SOCLE DU MODULE DE PARTICIPATION (#4921) — `null` tant que l'actif
 * compilé est absent : le Post/Redirect/Get reste alors le seul chemin, ce qui
 * est toujours correct (§ 12.4). Sans socket, comme `/feed` : accepter et
 * refuser sont des allers simples.
 */
const moduleDeParticipation = (): { readonly module: string; readonly passerelle: string } | null => {
  const actifs = actifsTempsReel();
  if (actifs.contacts.corps === '') return null;
  return { module: actifs.contacts.url, passerelle: baseDeLaPasserellePublique() };
};

const sert = async ({
  jeton,
  avis,
  recuperer,
}: {
  readonly jeton: string;
  readonly avis: Avis | null;
  readonly recuperer?: Recuperateur;
}): Promise<Response> => {
  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return versLaConnexion();
  if (identite.genre === 'panne') return rendu(documentDePanne(), 503);

  const moiId = identite.lecteur.id;
  // SANS IDENTIFIANT, AUCUN CLASSEMENT. `/auth/me` peut répondre sans `id` —
  // la charge le déclare, rien ne le garantit —, et deviner le sens d'une
  // demande vaudrait moins que de dire l'incident.
  if (moiId === null) return rendu(documentDePanne(), 503);

  const carnet = await carnetDuLecteur({ jeton, moiId, recuperer });
  if (carnet.genre === 'session-expiree') return versLaConnexion();
  if (carnet.genre === 'panne') return rendu(documentDePanne(), 503);

  return rendu(
    documentDesContacts({
      demandesRecues: carnet.demandesRecues,
      demandesEnvoyees: carnet.demandesEnvoyees,
      contacts: carnet.contacts,
      maintenant: Date.now(),
      avis,
      tempsReel: moduleDeParticipation(),
    }),
  );
};

export const CARNET = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  return sert({ jeton, avis: avisDeLURL(requete), recuperer });
};

const GESTES: Readonly<Record<string, Geste>> = { accepter: 'accepter', refuser: 'refuser' };

/**
 * RÉPONDRE À UNE DEMANDE — et la RÉPONSE est une redirection, pas un document.
 *
 * Post/Redirect/Get : sans lui, un rechargement REJOUERAIT l'action sur une
 * demande déjà répondue, et le bouton « précédent » ramènerait à un formulaire
 * déjà soumis.
 *
 * L'ORIGINE EST VÉRIFIÉE AVANT TOUT. Un POST déclenché depuis un autre site
 * ferait accepter une demande d'ami à l'insu du lecteur — c'est-à-dire lui
 * ferait donner sa présence et son fil à quelqu'un qu'il n'a pas choisi. La
 * garde est celle que les autres surfaces d'écriture de la v3 emploient déjà
 * (`app/provenance.ts`), jamais une jumelle.
 *
 * UN ÉCHEC LE DIT. La passerelle refuse une demande déjà répondue ou disparue
 * (404, 409) ; l'écran re-sert la liste avec le témoin `?echouee`, jamais avec
 * celui du succès. Les lignes que le lecteur relit sont alors la vérité.
 *
 * UN CORPS ILLISIBLE NE VAUT PAS UNE PANNE. Un POST sans `demande` ni `geste`
 * n'a rien demandé : on re-sert la liste, sans témoin — il n'y a rien à
 * raconter.
 */
export const REPONDRE = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  const formulaire = await requete.formData().catch(() => null);
  const demandeId = formulaire?.get('demande');
  const geste = GESTES[String(formulaire?.get('geste') ?? '')];

  if (typeof demandeId !== 'string' || demandeId === '' || geste === undefined) {
    return sert({ jeton, avis: null, recuperer });
  }

  const issue = await repondreALaDemande({ jeton, demandeId, geste, recuperer });
  if (issue === 'session-expiree') return versLaConnexion();

  const temoin =
    issue === 'panne' ? TEMOINS.echouee : geste === 'accepter' ? TEMOINS.acceptee : TEMOINS.refusee;

  return redirection(`${CHEMIN}?${temoin}`, { 'cache-control': CACHE_PRIVE });
};
