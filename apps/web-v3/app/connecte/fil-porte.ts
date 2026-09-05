import { actifsTempsReel } from '@/lib/actifs-rt';
import {
  adresseDuLienCree,
  adresseDuMessage,
  PARAM_DE_L_ANCRE,
  PARAM_DE_LA_MODIFICATION,
  PARAM_DE_LA_REPONSE,
  PARAM_DU_LIEN,
  PARAM_DU_LIEN_CREE,
  PARAM_DU_PLEIN,
} from '@/lib/api/adresses-du-fil';
import { creeUnLien, type Lecteur, type Recuperateur } from '@/lib/api/compte';
import { envoie, televerse, type Creance, type Fil } from '@/lib/api/fil';
import { accuseLecture, aAccuser, modifie, peutModifier, reagis, retire } from '@/lib/api/fil-mutations';
import { baseDeLaPasserellePublique } from '@/lib/api/links';
import { FIL } from '@/lib/contenu/fil';

import { CHAMP_DE_LA_REACTION, CHAMP_DU_MESSAGE_CIBLE } from './fil-lignes';
import {
  CHAMP_DE_LA_MODIFICATION,
  CHAMP_DE_LA_PIECE,
  CHAMP_DE_LA_REPONSE,
  CHAMP_DE_L_ORIGINAL,
  CHAMP_DU_MESSAGE,
  CHAMP_DU_NOUVEAU_LIEN,
  type ContexteDuComposeur,
  type TempsReel,
} from './fil-vue';
import { champsCommuns, saisieSoumise } from './nouveau-lien-porte';
import type { SaisieDuLien } from './nouveau-lien-vue';
import { pieceEnPlein, piecesDuFil } from './plein-vue';

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

/**
 * `?repondre=<id>` / `?modifier=<id>` — LES DEUX ÉTATS D'ADRESSE DU FIL
 * (§ 12.10.1, issue #5163). Lus ICI, comme `?media=` et `?autour=` : les deux
 * portes en tirent la même TRANCHE (§ 9 Q2, la loi de `?media=` appliquée à
 * un troisième état — jamais `avant` ET l'un des deux à la fois) et le même
 * contexte de composeur (`EtatDuFil.contexte`, `fil-vue.ts`).
 */
export const reponseDemandee = (requete: Request): string | null => {
  const valeur = new URL(requete.url).searchParams.get(PARAM_DE_LA_REPONSE);
  return valeur === null || valeur.trim() === '' ? null : valeur;
};

export const modificationDemandee = (requete: Request): string | null => {
  const valeur = new URL(requete.url).searchParams.get(PARAM_DE_LA_MODIFICATION);
  return valeur === null || valeur.trim() === '' ? null : valeur;
};

/**
 * `?lien` — LA FEUILLE « NOUVEAU LIEN DE PARTAGE », OUVERTE DEPUIS LE FIL
 * (#5034, § 12.10.5). Lue ICI, comme `?media=`, `?profil=`, `?autour=` :
 * membre SEUL (`app/chats/[cle]/route.ts` — l'invité de `/chat/:lien` ne
 * l'appelle jamais).
 */
export const feuilleDeLienDemandee = (requete: Request): boolean => new URL(requete.url).searchParams.has(PARAM_DU_LIEN);

/** `?cree=<identifiant>` — le compte rendu du Post/Redirect/Get qui vient de créer un lien. */
export const lienCreeDemande = (requete: Request): string | null => {
  const valeur = new URL(requete.url).searchParams.get(PARAM_DU_LIEN_CREE);
  return valeur === null || valeur.trim() === '' ? null : valeur;
};

/**
 * LE CONTEXTE DU COMPOSEUR, RÉSOLU CONTRE CE QUI EST SERVI — le site UNIQUE
 * des deux portes (issue #5163). `idReponse` et `idModification` ne naviguent
 * pas seuls : leur cible doit être une ligne PRÉSENTE dans la tranche (jamais
 * un identifiant deviné), et un composeur FERMÉ (lien clos, droit retiré)
 * n'arme rien — « Répondre » n'existe pas sur un fil qu'on ne peut pas
 * écrire. `?modifier=` porte de plus la garde de la fenêtre de 24 h et le
 * régime 3 de l'invité : hors de ces conditions, l'état est IGNORÉ — le
 * composeur reste NOMINAL, jamais un contrôle inerte (charte règle 7, § 9 Q8
 * de la spécification).
 *
 * PURE, DÉLIBÉRÉMENT : les identifiants sont lus PAR L'APPELANT — depuis
 * l'adresse au chargement normal (`reponseDemandee`/`modificationDemandee`),
 * depuis la SOUMISSION refusée sur un rechargement d'erreur (§ 9 Q2 : « le
 * contexte armé est conservé » — la requête POST ne porte jamais ces
 * paramètres, elle poste vers l'adresse NUE).
 */
export const resoutLeContexte = ({
  idReponse,
  idModification,
  fil,
  maintenant,
  composeurOuvert,
  estInvite,
}: {
  readonly idReponse: string | null;
  readonly idModification: string | null;
  readonly fil: Fil;
  readonly maintenant: number;
  readonly composeurOuvert: boolean;
  readonly estInvite: boolean;
}): ContexteDuComposeur => {
  if (!composeurOuvert) return null;

  if (idReponse !== null) {
    const cible = fil.messages.find((m) => m.id === idReponse && !m.systeme && !m.supprime && !m.protege);
    if (cible !== undefined) return { genre: 'reponse', cible };
  }

  if (idModification !== null && !estInvite) {
    const cible = fil.messages.find((m) => m.id === idModification);
    if (
      cible !== undefined &&
      peutModifier({ deMoi: cible.deMoi, systeme: cible.systeme, supprime: cible.supprime, protege: cible.protege, ecritA: cible.ecritA, maintenant })
    ) {
      return { genre: 'modification', cible };
    }
  }

  return null;
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
/**
 * CE QU'UN FORMULAIRE DU FIL DEMANDE — cinq genres depuis l'issue #5163 :
 * une réaction, un message NU, une RÉPONSE (`replyToId` porté par le champ
 * caché `reponseA` du composeur armé), une MODIFICATION (`modifie`, le champ
 * caché du composeur armé en mode édition) ou un RETRAIT (le bouton
 * `name="retirer"` du menu d'une ligne, posté seul). Lus UNE fois pour les
 * deux portes.
 */
export type SoumissionDuFil =
  | { readonly genre: 'reaction'; readonly messageId: string; readonly emoji: string }
  | { readonly genre: 'message'; readonly texte: string; readonly fichiers: readonly File[] }
  | { readonly genre: 'reponse'; readonly texte: string; readonly replyToId: string; readonly fichiers: readonly File[] }
  | { readonly genre: 'modification'; readonly messageId: string; readonly texte: string; readonly texteOriginal: string }
  | { readonly genre: 'retrait'; readonly messageId: string };

const texteDe = (formulaire: FormData, nom: string): string => {
  const brut = formulaire.get(nom);
  return typeof brut === 'string' ? brut.trim() : '';
};

/** Le nom du bouton `retirer` du menu d'une ligne — posté SEUL, jamais avec les champs du composeur (§ 12.10.1). */
const CHAMP_DU_RETRAIT = 'retirer';

/**
 * L'ORDRE DE LECTURE (§ 4 étape 2 de la spécification #5163) : `retirer` →
 * `modifie` → `reaction`+`message` → `reponse`/`message`. Un formulaire ne
 * porte qu'UN de ces cinq genres à la fois — le menu d'une ligne, le
 * composeur et la pastille de réaction sont trois formulaires distincts.
 */
export const soumissionDuFil = (formulaire: FormData | null): SoumissionDuFil => {
  if (formulaire === null) return { genre: 'message', texte: '', fichiers: [] };

  const aRetirer = texteDe(formulaire, CHAMP_DU_RETRAIT);
  if (aRetirer !== '') return { genre: 'retrait', messageId: aRetirer };

  const aModifier = texteDe(formulaire, CHAMP_DE_LA_MODIFICATION);
  if (aModifier !== '')
    return {
      genre: 'modification',
      messageId: aModifier,
      texte: texteDe(formulaire, CHAMP_DU_MESSAGE),
      texteOriginal: texteDe(formulaire, CHAMP_DE_L_ORIGINAL),
    };

  const emoji = texteDe(formulaire, CHAMP_DE_LA_REACTION);
  const messageId = texteDe(formulaire, CHAMP_DU_MESSAGE_CIBLE);
  if (emoji !== '' && messageId !== '') return { genre: 'reaction', messageId, emoji };

  const fichiers = formulaire
    .getAll(CHAMP_DE_LA_PIECE)
    .filter((valeur): valeur is File => valeur instanceof File && valeur.size > 0 && valeur.name !== '');
  const texte = texteDe(formulaire, CHAMP_DU_MESSAGE);

  const reponseA = texteDe(formulaire, CHAMP_DE_LA_REPONSE);
  if (reponseA !== '') return { genre: 'reponse', texte, replyToId: reponseA, fichiers };

  return { genre: 'message', texte, fichiers };
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
  replyToId,
}: {
  readonly creance: Creance;
  readonly conversation: string;
  readonly adresse: string;
  readonly texte: string;
  readonly fichiers: readonly File[];
  readonly replyToId?: string;
}): Promise<IssueDeSoumission> => {
  if (texte === '' && fichiers.length === 0) return { genre: 'erreur', message: FIL.messageVide, brouillon: '', statut: 400 };

  const pieces = fichiers.length === 0 ? null : await televerse({ creance, fichiers });
  if (pieces?.genre === 'refus') return { genre: 'erreur', message: pieces.message, brouillon: texte, statut: pieces.statut ?? 400 };

  const envoi = await envoie({ cle: conversation, creance, texte, pieces: pieces?.identifiants, replyToId });
  if (envoi.genre === 'refus') return { genre: 'erreur', message: envoi.message, brouillon: texte, statut: envoi.statut ?? 400 };

  return { genre: 'redirection', vers: envoi.id === null ? adresse : adresseDuMessage(adresse, envoi.id) };
};

/**
 * MODIFIER ET RETIRER SONT FAIL-CLOSED CÔTÉ INVITÉ (régime 3, § 2 de la
 * spécification #5163) : les quatre portes du gateway (`PUT`/`DELETE
 * /messages/:id`, `message:edit`/`message:delete`) refusent un anonyme. La
 * v3 ne paie pas une 401 en 3G — le refus est rendu SANS qu'aucune requête
 * ne parte.
 */
const modifieLeMessage = async ({
  creance,
  adresse,
  messageId,
  texte,
  texteOriginal,
}: {
  readonly creance: Creance;
  readonly adresse: string;
  readonly messageId: string;
  readonly texte: string;
  /** Le texte SERVI, porté par le champ caché `original` (`fil-vue.ts`) — défaut #5163 §8. */
  readonly texteOriginal: string;
}): Promise<IssueDeSoumission> => {
  if (creance.genre === 'invite') return { genre: 'erreur', message: FIL.refuse, brouillon: texte, statut: 403 };
  // RIEN N'A CHANGÉ : aucune requête — la passerelle marquerait sinon le
  // message « modifié » pour tous et effacerait ses traductions pour un texte
  // identique (même défaut que le chemin avec JavaScript, `composeur.ts`).
  if (texte === texteOriginal) return { genre: 'redirection', vers: adresseDuMessage(adresse, messageId) };
  const issue = await modifie({ creance, messageId, texte });
  if (issue.genre === 'refus') return { genre: 'erreur', message: issue.message, brouillon: texte, statut: issue.statut ?? 400 };
  return { genre: 'redirection', vers: adresseDuMessage(adresse, messageId) };
};

const retireLeMessage = async ({
  creance,
  adresse,
  messageId,
}: {
  readonly creance: Creance;
  readonly adresse: string;
  readonly messageId: string;
}): Promise<IssueDeSoumission> => {
  if (creance.genre === 'invite') return { genre: 'erreur', message: FIL.refuse, brouillon: '', statut: 403 };
  const issue = await retire({ creance, messageId });
  if (issue.genre === 'refus') return { genre: 'erreur', message: issue.message, brouillon: '', statut: issue.statut ?? 400 };
  return { genre: 'redirection', vers: adresseDuMessage(adresse, messageId) };
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
}): Promise<IssueDeSoumission> => {
  if (soumission.genre === 'reaction') {
    return basculeLaReaction({ creance, adresse, messageId: soumission.messageId, emoji: soumission.emoji });
  }
  if (soumission.genre === 'reponse') {
    return envoieLeMessage({ creance, conversation, adresse, texte: soumission.texte, fichiers: soumission.fichiers, replyToId: soumission.replyToId });
  }
  if (soumission.genre === 'modification') {
    return modifieLeMessage({ creance, adresse, messageId: soumission.messageId, texte: soumission.texte, texteOriginal: soumission.texteOriginal });
  }
  if (soumission.genre === 'retrait') {
    return retireLeMessage({ creance, adresse, messageId: soumission.messageId });
  }
  return envoieLeMessage({ creance, conversation, adresse, texte: soumission.texte, fichiers: soumission.fichiers });
};

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
  if (pieceEnPlein(piecesDuFil(fil), plein) !== null) return;
  void accuseLecture({ cle: fil.id, creance, messageIds: aAccuser(fil.messages) });
};

/**
 * CRÉER UN LIEN DE PARTAGE DEPUIS CE FIL (#5034, § 12.10.5) — reconnaît le
 * formulaire de la feuille (`CHAMP_DU_NOUVEAU_LIEN`) et `null` sinon, pour
 * que l'appelant enchaîne sur SA propre lecture du MÊME `FormData` (le
 * composeur, une réaction) — le patron de `traiteLActionDeProfil`
 * (`profil-porte.ts`), qui distingue de la MÊME façon un formulaire du sien.
 *
 * `conversation` VIENT DES PARAMS DE L'ADRESSE (`cle`), JAMAIS DU CHAMP CACHÉ
 * DE LA FEUILLE — même si un formulaire forgé à la main portait un autre
 * identifiant, c'est TOUJOURS la conversation que la porte sert qui reçoit le
 * lien : la vue verrouille déjà ce champ, cette lecture est la garde qui ne
 * fait confiance à AUCUN appelant (la même prudence que `surimpressionDuLien`
 * côté vue).
 *
 * TROIS ISSUES, comme `traiteLaSoumission` : une redirection (`?cree=`, PRG),
 * un refus À RE-SERVIR sur LE FIL (jamais une redirection qui perdrait la
 * saisie), une session expirée.
 */
export type IssueDeLaCreationDuLien =
  | { readonly genre: 'redirection'; readonly vers: string }
  | { readonly genre: 'erreur'; readonly saisie: SaisieDuLien; readonly motif: string; readonly statut: number }
  | { readonly genre: 'session-expiree' };

export const traiteLaCreationDuLien = async ({
  formulaire,
  jeton,
  conversation,
  adresseHote,
  recuperer,
}: {
  readonly formulaire: FormData | null;
  readonly jeton: string;
  readonly conversation: string;
  readonly adresseHote: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDeLaCreationDuLien | null> => {
  if (formulaire === null || !formulaire.has(CHAMP_DU_NOUVEAU_LIEN)) return null;

  const saisie = saisieSoumise(formulaire);
  const issue = await creeUnLien({
    jeton,
    champs: { conversationId: conversation, ...champsCommuns(saisie, Date.now()) },
    recuperer,
  });

  if (issue.genre === 'session-expiree') return { genre: 'session-expiree' };
  if (issue.genre === 'fait') return { genre: 'redirection', vers: adresseDuLienCree(adresseHote, issue.identifiant) };
  return {
    genre: 'erreur',
    saisie,
    motif: issue.genre === 'refus' ? issue.message : '',
    statut: issue.genre === 'panne' ? 503 : 422,
  };
};
