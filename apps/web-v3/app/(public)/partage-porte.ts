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
  partageLu,
  voisinage,
  type Recuperateur,
} from '@/lib/api/publication';
import { type GenreServi } from '@/lib/contenu/partage';

import {
  adresseDuPartage,
  CHAMP_DE_L_AIME,
  CHAMP_DE_LA_REPONSE,
  documentDeLInvitation,
  documentDuPartage,
  documentIndisponible,
} from '@/app/(public)/partage-vue';

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
 * pourquoi `lib/api/publication.ts` sépare `chargeDeLaStory` de `partageLu`.
 *
 * `recuperer` est la MÊME couture que celle du tableau de bord : elle laisse un
 * témoin opposer un serveur à la porte sans lancer de serveur. Elle n'est
 * jamais fournie en production.
 */

type Demande = {
  /**
   * LE GENRE SERVI. Cette porte s'appelait `stories/[id]/porte.ts` et posait
   * `STORY` partout : servir un réel ou une humeur aurait demandé de la
   * recopier deux fois, avec deux occasions de diverger. Le genre porte le
   * vocabulaire, le préfixe d'adresse et le fait que le contenu se PARCOURE —
   * c'est tout ce qui sépare les trois écrans (#4929).
   */
  readonly genre: GenreServi;
  readonly requete: Request;
  readonly id: string;
  readonly recuperer?: Recuperateur;
  /** L'horloge, injectable : une story EXPIRE, et un témoin qui lit l'heure
   *  réelle devient rouge à la date de sa fixture — sans qu'aucune ligne ait
   *  changé (leçon 234i, l'horloge après la locale). */
  readonly maintenant?: number;
};

const invitation = (genre: GenreServi, id: string): Response => rendu(documentDeLInvitation({ genre, id }));

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
const charge = async ({ genre, requete, id, recuperer, maintenant = Date.now() }: Demande): Promise<Charge> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return { genre: 'reponse', reponse: invitation(genre, id) };

  const [identite, chargee, visibles] = await Promise.all([
    moi({ jeton, recuperer }),
    chargeDeLaStory({ id, jeton, recuperer }),
    // LE VOISINAGE N'EST DEMANDÉ QUE S'IL SE REND. Un réel et une humeur se
    // lisent seuls : appeler `/social/posts` pour composer une barre que
    // l'écran ne pose pas serait une requête payée par le lecteur pour rien
    // (dimension 2), sur des réseaux où elle se compte.
    genre.avecSegments ? storiesVisibles({ jeton, recuperer }) : Promise.resolve([]),
  ]);

  if (chargee.genre === 'session-expiree' || identite.genre === 'session-expiree') {
    return { genre: 'reponse', reponse: invitation(genre, id) };
  }
  if (chargee.genre === 'introuvable') return { genre: 'reponse', reponse: rendu(documentIndisponible(genre), 404) };
  if (chargee.genre === 'panne') return { genre: 'reponse', reponse: rendu(documentDePanne(), 503) };

  const lecteur: Lecteur | null = identite.genre === 'lecteur' ? identite.lecteur : null;
  const story = partageLu({
    genre: genre.type,
    brut: chargee.brut,
    langues: languesDuLecteur(lecteur ?? {}),
    langueDemandee: langueDemandee(requete),
    maintenant,
    origine: baseDeLaPasserellePublique(),
  });
  if (story === null) return { genre: 'reponse', reponse: rendu(documentIndisponible(genre), 404) };

  return {
    genre: 'story',
    html: ({ erreur, brouillon, confirmation }) =>
      documentDuPartage({
        genre,
        story,
        voisinage: voisinage({ story, visibles }),
        maintenant,
        confirmation,
        erreur,
        brouillon,
      }),
  };
};

export const lisLePartage = async (demande: Demande): Promise<Response> => {
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
const versLePartage = (genre: GenreServi, id: string, confirme: boolean): Response =>
  new Response(null, {
    status: 303,
    headers: {
      location: `${adresseDuPartage(genre, id)}${confirme ? '?repondu=1' : ''}`,
      'cache-control': CACHE_PRIVE,
    },
  });

export const soumetsAuPartage = async (demande: Demande): Promise<Response> => {
  // Un formulaire venu d'un autre site ne poste RIEN : la garde précède la
  // lecture du corps, comme sur la porte de l'invité (leçon 451).
  if (origineEtrangere(demande.requete)) return refusDOrigine(demande.requete);

  const jeton = jetonDuLecteur(demande.requete);
  if (jeton === null) return invitation(demande.genre, demande.id);

  const formulaire = await champs(demande.requete);
  const brouillon = texteDe(formulaire, CHAMP_DE_LA_REPONSE);
  const bascule = texteDe(formulaire, CHAMP_DE_L_AIME);

  const issue =
    bascule === ''
      ? brouillon === ''
        ? ({ genre: 'refus', message: demande.genre.copie.vide, statut: 400 } as const)
        : await reponds({ id: demande.id, jeton, texte: brouillon, recuperer: demande.recuperer })
      : await aime({ id: demande.id, jeton, pose: bascule === '1', recuperer: demande.recuperer });

  if (issue.genre === 'fait') return versLePartage(demande.genre, demande.id, bascule === '');
  if (issue.statut === 401) return invitation(demande.genre, demande.id);

  const lue = await charge(demande);
  if (lue.genre === 'reponse') return lue.reponse;
  return rendu(lue.html({ erreur: issue.message, brouillon, confirmation: false }), issue.statut);
};
