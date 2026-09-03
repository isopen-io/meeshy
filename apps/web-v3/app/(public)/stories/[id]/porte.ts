import { CACHE_PRIVE, rendu } from '@/app/connecte/fil-porte';
import { documentDePanne } from '@/app/connecte/vue';
import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { moi, type Lecteur } from '@/lib/api/compte';
import { languesDuLecteur } from '@/lib/api/fil';
import { baseDeLaPasserellePublique } from '@/lib/api/passerelle';
import {
  aime,
  chargeDeLaStory,
  reponds,
  storiesVisibles,
  storyLue,
  voisinage,
  type Recuperateur,
} from '@/lib/api/publication';
import { STORY } from '@/lib/contenu/story';

import {
  adresseDeLaStory,
  CHAMP_DE_L_AIME,
  CHAMP_DE_LA_REPONSE,
  documentDeLInvitation,
  documentDeLaStory,
  documentIndisponible,
} from './story-vue';

/**
 * LA PORTE DE `/stories/:id` — trois questions, dans cet ordre, et l'ordre est
 * le fond (même forme que `app/connecte/porte.ts`).
 *
 *   1. **Le lecteur tient-il un jeton ?** Non ⇒ l'INVITATION, et AUCUN appel à
 *      la passerelle : `GET /posts/:postId` est en `requiredAuth`
 *      (`routes/posts/core.ts:460-461`), donc un appel sans créance ne rendrait
 *      qu'un 401 — et le témoin qui compte les appels est ce qui prouve que
 *      rien du contenu ne part avant la connexion (décision du porteur,
 *      2026-09-02).
 *   2. **La passerelle l'accepte-t-elle ?** Non (401) ⇒ l'invitation encore :
 *      sur l'adresse d'un contenu PARTAGÉ, une redirection vers `/login`
 *      perdrait la moitié du soin — le lecteur qui ouvre un lien reçu doit
 *      comprendre où il est arrivé et pourquoi on lui demande un compte.
 *   3. **La story se sert-elle ?** Absente, supprimée, échue, hors audience :
 *      la MÊME réponse (§ 5.1), jamais un 403 qui confirmerait l'existence.
 *
 * LES TROIS APPELS PARTENT ENSEMBLE. `/auth/me` (les langues du Prisme), la
 * story et le voisinage ne dépendent pas les uns des autres : les enchaîner
 * multiplierait par trois la latence du seul aller-retour que cet écran paie
 * sur une 3G rurale. Le Prisme se descend APRÈS, sur la charge brute — c'est
 * pourquoi `lib/api/publication.ts` sépare `chargeDeLaStory` de `storyLue`.
 *
 * `recuperer` est la MÊME couture que celle du tableau de bord : elle laisse un
 * témoin opposer un serveur à la porte sans lancer de serveur. Elle n'est
 * jamais fournie en production.
 *
 * **`maintenant` EST LA SECONDE COUTURE, ET POUR LA MÊME RAISON.** Une story a
 * une ÉCHÉANCE (`expiresAt`) : la porte décide donc de ce qu'elle sert en
 * lisant une horloge, et une horloge lue par `Date.now()` au fond du module est
 * une entrée que le témoin ne peut pas fixer. Ses fixtures dataient — la suite
 * a viré au rouge le 2026-09-03 à 05:00 UTC, sur un code que personne n'avait
 * touché. Un témoin qui dépend du JOUR où on le rejoue ne garde rien : il
 * annonce vert jusqu'à l'heure où il annonce rouge.
 *
 * Le défaut de ce genre ne se voit pas dans un diff, seulement dans le
 * CALENDRIER — la couture est ce qui le rend impossible.
 */

type Demande = {
  readonly requete: Request;
  readonly id: string;
  readonly recuperer?: Recuperateur;
  /** L'horloge de la décision — injectée par les témoins, `Date.now()` en production.
   *  Une story EXPIRE : un témoin qui lit l'heure réelle devient rouge à la date de
   *  sa fixture sans qu'aucune ligne n'ait changé (#5021). */
  readonly maintenant?: number;
};

const invitation = (id: string): Response => rendu(documentDeLInvitation({ id }));

const langueDemandee = (requete: Request): string | null => {
  const valeur = new URL(requete.url).searchParams.get('lang');
  return valeur === null || valeur.trim() === '' ? null : valeur.trim();
};

const aRepondu = (requete: Request): boolean => new URL(requete.url).searchParams.get('repondu') === '1';

type Charge =
  | { readonly genre: 'reponse'; readonly reponse: Response }
  | {
      readonly genre: 'story';
      readonly html: (options: { readonly erreur: string | null; readonly brouillon: string; readonly confirmation: boolean }) => string;
    };

/**
 * CE QUE LES DEUX GESTES PARTAGENT : lire la story pour la SERVIR. Le GET la
 * rend telle quelle ; le POST la rend avec le refus PEINT et le texte saisi,
 * jamais perdu.
 */
const charge = async ({ requete, id, recuperer, maintenant = Date.now() }: Demande): Promise<Charge> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return { genre: 'reponse', reponse: invitation(id) };

  const [identite, chargee, visibles] = await Promise.all([
    moi({ jeton, recuperer }),
    chargeDeLaStory({ id, jeton, recuperer }),
    storiesVisibles({ jeton, recuperer }),
  ]);

  if (chargee.genre === 'session-expiree' || identite.genre === 'session-expiree') {
    return { genre: 'reponse', reponse: invitation(id) };
  }
  if (chargee.genre === 'introuvable') return { genre: 'reponse', reponse: rendu(documentIndisponible(), 404) };
  if (chargee.genre === 'panne') return { genre: 'reponse', reponse: rendu(documentDePanne(), 503) };

  const lecteur: Lecteur | null = identite.genre === 'lecteur' ? identite.lecteur : null;
  const story = storyLue({
    brut: chargee.brut,
    langues: languesDuLecteur(lecteur ?? {}),
    langueDemandee: langueDemandee(requete),
    maintenant,
    origine: baseDeLaPasserellePublique(),
  });
  if (story === null) return { genre: 'reponse', reponse: rendu(documentIndisponible(), 404) };

  return {
    genre: 'story',
    html: ({ erreur, brouillon, confirmation }) =>
      documentDeLaStory({
        story,
        voisinage: voisinage({ story, visibles }),
        maintenant,
        confirmation,
        erreur,
        brouillon,
      }),
  };
};

export const lisLaStory = async (demande: Demande): Promise<Response> => {
  const lue = await charge(demande);
  if (lue.genre === 'reponse') return lue.reponse;

  return rendu(lue.html({ erreur: null, brouillon: '', confirmation: aRepondu(demande.requete) }));
};

/** Le formulaire posté, ou `null` — un corps illisible n'est pas une exception. */
const champs = async (requete: Request): Promise<FormData | null> => requete.formData().catch(() => null);

const texteDe = (formulaire: FormData | null, nom: string): string => {
  const brut = formulaire?.get(nom);
  return typeof brut === 'string' ? brut.trim() : '';
};

/**
 * POST/REDIRECT/GET. Sans la redirection, un rechargement reposterait le
 * commentaire — et le navigateur demanderait « voulez-vous renvoyer le
 * formulaire ? » sur un écran où la réponse « oui » duplique une parole.
 */
const versLaStory = (id: string, confirme: boolean): Response =>
  new Response(null, {
    status: 303,
    headers: {
      location: `${adresseDeLaStory(id)}${confirme ? '?repondu=1' : ''}`,
      'cache-control': CACHE_PRIVE,
    },
  });

export const soumetsALaStory = async (demande: Demande): Promise<Response> => {
  // Un formulaire venu d'un autre site ne poste RIEN : la garde précède la
  // lecture du corps, comme sur la porte de l'invité (leçon 451).
  if (origineEtrangere(demande.requete)) return refusDOrigine(demande.requete);

  const jeton = jetonDuLecteur(demande.requete);
  if (jeton === null) return invitation(demande.id);

  const formulaire = await champs(demande.requete);
  const brouillon = texteDe(formulaire, CHAMP_DE_LA_REPONSE);
  const bascule = texteDe(formulaire, CHAMP_DE_L_AIME);

  const issue =
    bascule === ''
      ? brouillon === ''
        ? ({ genre: 'refus', message: STORY.vide, statut: 400 } as const)
        : await reponds({ id: demande.id, jeton, texte: brouillon, recuperer: demande.recuperer })
      : await aime({ id: demande.id, jeton, pose: bascule === '1', recuperer: demande.recuperer });

  if (issue.genre === 'fait') return versLaStory(demande.id, bascule === '' );
  if (issue.statut === 401) return invitation(demande.id);

  const lue = await charge(demande);
  if (lue.genre === 'reponse') return lue.reponse;
  return rendu(lue.html({ erreur: issue.message, brouillon, confirmation: false }), issue.statut);
};
