import { actifsTempsReel } from '@/lib/actifs-rt';
import { adresseDuMessage, PARAM_DE_L_ANCRE, PARAM_DU_PLEIN } from '@/lib/api/adresses-du-fil';
import type { Lecteur } from '@/lib/api/compte';
import { accuseLecture, aAccuser, envoie, reagis, televerse, type Creance, type Fil } from '@/lib/api/fil';
import { baseDeLaPasserellePublique } from '@/lib/api/links';
import { FIL } from '@/lib/contenu/fil';

import { CHAMP_DE_LA_REACTION, CHAMP_DU_MESSAGE_CIBLE } from './fil-lignes';
import { CHAMP_DE_LA_PIECE, CHAMP_DU_MESSAGE, type TempsReel } from './fil-vue';
import { pieceEnPlein } from './plein-vue';

/**
 * CE QUE LES DEUX PORTES DU FIL PARTAGENT — la réponse, sa politique de cache,
 * ce que le module de participation doit savoir, le nom sous lequel le
 * lecteur se voit, et CE QU'UN FORMULAIRE POSTÉ FAIT. Écrit une fois :
 * `/chats/:cle` et `/chat/:lien` sont deux routes et un seul écran (conception
 * § 12.3).
 */

export const CACHE_PRIVE = 'no-store, private';

export const rendu = (html: string, statut = 200, entetes: Readonly<Record<string, string>> = {}): Response =>
  new Response(html, {
    status: statut,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': CACHE_PRIVE,
      'x-robots-tag': 'noindex, nofollow',
      ...entetes,
    },
  });

/**
 * Le temps réel se greffe sur une surface de PARTICIPATION — et seulement là
 * (§ 12.4). Le document reçoit l'origine que le NAVIGATEUR peut joindre et les
 * deux actifs à leur adresse hachée ; il ne reçoit rien d'autre du serveur.
 */
export const tempsReelDuDocument = (): TempsReel => ({
  passerelle: baseDeLaPasserellePublique(),
  actifs: actifsTempsReel(),
});

/** Le nom sous lequel le membre se reconnaît dans ses propres lignes — celui que la passerelle lui donne. */
export const nomDuLecteur = (lecteur: Lecteur | null): string =>
  lecteur?.nomAffiche ?? lecteur?.prenom ?? lecteur?.pseudonyme ?? 'Vous';

/** `?avant=<id>` — la page plus ancienne, sans JavaScript. */
export const curseurDemande = (requete: Request): string | null => {
  const valeur = new URL(requete.url).searchParams.get('avant');
  return valeur === null || valeur.trim() === '' ? null : valeur;
};

/**
 * `?media=<pièce>` — le PLEIN ÉCRAN, un ÉTAT de l'adresse hôte (§ 12.10.1). Il
 * est lu ICI, pour les DEUX portes : c'est ce qui garantit que `/chats/:cle` et
 * `/chat/:lien` ouvrent la même surimpression sur le même geste. Ce que la
 * chaîne désigne n'est pas cherché ici : la vue la résout contre ce qui est
 * SERVI (`app/connecte/plein-vue.ts`), donc sans une requête de plus.
 */
export const pleinDemande = (requete: Request): string | null => {
  const valeur = new URL(requete.url).searchParams.get(PARAM_DU_PLEIN);
  return valeur === null || valeur.trim() === '' ? null : valeur;
};

/**
 * `?autour=<message>` — LA TRANCHE, nommée par le message qu'elle doit
 * contenir (`around=` de la passerelle). C'est ce que porte le lien d'un média
 * et le retour de sa surimpression : la pièce d'un message vieux de mille
 * lignes s'ouvre alors comme celle d'hier, et fermer rend la même tranche.
 * Lue ICI pour les DEUX portes, comme `?avant=` et `?media=`.
 */
export const ancreDemandee = (requete: Request): string | null => {
  const valeur = new URL(requete.url).searchParams.get(PARAM_DE_L_ANCRE);
  return valeur === null || valeur.trim() === '' ? null : valeur;
};

/** Le formulaire posté, ou `null` — un corps illisible n'est pas une exception. */
export const lisLeFormulaire = async (requete: Request): Promise<FormData | null> =>
  requete.formData().catch(() => null);

/** Ce que le formulaire a posté sous `nom`, ou `null`. */
export const champDuFormulaire = async (requete: Request, nom: string): Promise<string | null> => {
  const brut = (await lisLeFormulaire(requete))?.get(nom);
  return typeof brut === 'string' ? brut : null;
};

/**
 * CE QU'UN FORMULAIRE DU FIL DEMANDE — une réaction (la pastille d'une ligne)
 * ou un message (le composeur, avec ou sans pièce). Lu UNE fois pour les deux
 * portes : le nom des champs est celui que `fil-lignes.ts` et `fil-vue.ts`
 * écrivent.
 */
export type SoumissionDuFil =
  | { readonly genre: 'reaction'; readonly messageId: string; readonly emoji: string }
  | { readonly genre: 'message'; readonly texte: string; readonly fichiers: readonly File[] };

const texteDe = (formulaire: FormData, nom: string): string => {
  const brut = formulaire.get(nom);
  return typeof brut === 'string' ? brut.trim() : '';
};

export const soumissionDuFil = (formulaire: FormData | null): SoumissionDuFil => {
  if (formulaire === null) return { genre: 'message', texte: '', fichiers: [] };
  const emoji = texteDe(formulaire, CHAMP_DE_LA_REACTION);
  const messageId = texteDe(formulaire, CHAMP_DU_MESSAGE_CIBLE);
  if (emoji !== '' && messageId !== '') return { genre: 'reaction', messageId, emoji };
  const fichiers = formulaire
    .getAll(CHAMP_DE_LA_PIECE)
    .filter((valeur): valeur is File => valeur instanceof File && valeur.size > 0 && valeur.name !== '');
  return { genre: 'message', texte: texteDe(formulaire, CHAMP_DU_MESSAGE), fichiers };
};

/** Ce qu'une soumission produit : un rechargement qui CADRE la ligne concernée, ou une erreur à peindre avec le brouillon. */
export type IssueDeSoumission =
  | { readonly genre: 'redirection'; readonly vers: string }
  | { readonly genre: 'erreur'; readonly message: string; readonly brouillon: string; readonly statut: number };

/** Post/Redirect/Get vers la porte, le FRAGMENT désignant la ligne à cadrer — jamais l'adresse nue, qui laissait la bulle envoyée hors champ. */
export const redirection = (vers: string, entetes: Readonly<Record<string, string>> = {}): Response =>
  new Response(null, { status: 303, headers: { location: vers, 'cache-control': CACHE_PRIVE, ...entetes } });

/**
 * L'ENVOI PAR FORMULAIRE : la pièce d'abord (`POST /attachments/upload`), puis
 * le message avec ses `attachmentIds` (`POST /conversations/:id/messages`) ;
 * le refus de l'une ou de l'autre est SERVI avec le texte saisi, jamais perdu.
 * Un 401 est rendu tel quel : c'est la porte qui sait quoi en faire.
 */
const envoieLeMessage = async ({
  creance,
  conversation,
  adresse,
  texte,
  fichiers,
}: {
  readonly creance: Creance;
  readonly conversation: string;
  readonly adresse: string;
  readonly texte: string;
  readonly fichiers: readonly File[];
}): Promise<IssueDeSoumission> => {
  if (texte === '' && fichiers.length === 0) return { genre: 'erreur', message: FIL.messageVide, brouillon: '', statut: 400 };

  const pieces = fichiers.length === 0 ? null : await televerse({ creance, fichiers });
  if (pieces?.genre === 'refus') return { genre: 'erreur', message: pieces.message, brouillon: texte, statut: pieces.statut ?? 400 };

  const envoi = await envoie({ cle: conversation, creance, texte, pieces: pieces?.identifiants });
  if (envoi.genre === 'refus') return { genre: 'erreur', message: envoi.message, brouillon: texte, statut: envoi.statut ?? 400 };

  return { genre: 'redirection', vers: envoi.id === null ? adresse : adresseDuMessage(adresse, envoi.id) };
};

/**
 * LA BASCULE D'UNE RÉACTION, sans JavaScript. La liste ne dit pas si la
 * pastille est la mienne ; la passerelle, si : `POST /reactions` rend 201
 * quand elle vient d'être posée et 200 — `unchanged` — quand elle l'était
 * déjà (`routes/reactions.ts:180-188`). Dans ce second cas, le geste voulait
 * la retirer.
 */
const basculeLaReaction = async ({
  creance,
  adresse,
  messageId,
  emoji,
}: {
  readonly creance: Creance;
  readonly adresse: string;
  readonly messageId: string;
  readonly emoji: string;
}): Promise<IssueDeSoumission> => {
  const posee = await reagis({ creance, messageId, emoji, retirer: false });
  if (posee.genre === 'refus') return { genre: 'erreur', message: posee.message, brouillon: '', statut: posee.statut ?? 400 };
  if (posee.dejaLa) {
    const retiree = await reagis({ creance, messageId, emoji, retirer: true });
    if (retiree.genre === 'refus') return { genre: 'erreur', message: retiree.message, brouillon: '', statut: retiree.statut ?? 400 };
  }
  return { genre: 'redirection', vers: adresseDuMessage(adresse, messageId) };
};

export const traiteLaSoumission = ({
  soumission,
  creance,
  conversation,
  adresse,
}: {
  readonly soumission: SoumissionDuFil;
  readonly creance: Creance;
  readonly conversation: string;
  readonly adresse: string;
}): Promise<IssueDeSoumission> =>
  soumission.genre === 'reaction'
    ? basculeLaReaction({ creance, adresse, messageId: soumission.messageId, emoji: soumission.emoji })
    : envoieLeMessage({ creance, conversation, adresse, texte: soumission.texte, fichiers: soumission.fichiers });

/**
 * CE QUI EST AFFICHÉ EST LU — dit à la passerelle par la porte qui a servi le
 * document, sans attendre sa réponse : le chemin sans JavaScript doit faire
 * retomber le compteur de non-lus comme l'autre, et le module de participation
 * n'accuse que ce qui ARRIVE ensuite (jamais deux accusés pour une même
 * ouverture). Une passerelle muette n'est pas une panne de l'écran.
 *
 * ET UN FIL RECOUVERT N'EST PAS AFFICHÉ. Le plein écran d'un média est un ÉTAT
 * de cette adresse : ouvrir une photo est une navigation entière, la refermer
 * une seconde, et chacune re-postait l'accusé de lecture de la MÊME tranche —
 * regarder trois photos coûtait six écritures pour rien. Or la surimpression
 * est OPAQUE et pleine page (`plein-feuille.ts`) et le `<main>` qu'elle
 * recouvre est `inert` : le lecteur regarde le média, pas le fil. La règle ne
 * s'affaiblit pas, elle s'APPLIQUE — c'est la FERMETURE qui découvre le fil, et
 * c'est elle qui accuse.
 */
export const accuseCeQuiEstServi = ({
  fil,
  creance,
  plein = null,
}: {
  readonly fil: Fil;
  readonly creance: Creance;
  /** `?media=` — la pièce que l'adresse ouvre. Résolue ICI, comme la vue la résout : une seule règle. */
  readonly plein?: string | null;
}): void => {
  if (pieceEnPlein(fil, plein) !== null) return;
  void accuseLecture({ cle: fil.id, creance, messageIds: aAccuser(fil.messages) });
};
