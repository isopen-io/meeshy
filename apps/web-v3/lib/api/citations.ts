import { chaine, estProtege, objet } from './lecture';

/**
 * CE QU'UN MESSAGE CITE — l'un des deux axes de la forme d'une bulle
 * (issue #4835). L'autre est ce qu'il PORTE (`PieceJointe`, `lib/api/fil.ts`).
 *
 * Trois provenances, une seule forme rendue. La passerelle sert ces trois
 * choses sous trois noms et trois formes, parce qu'elles viennent de trois
 * tables :
 *
 *   • RÉPONSE — `replyTo`, servi par la liste (`messages-list-query.ts:262`,
 *     `include_replies` vaut `true` par défaut, `messages-list.ts:198`) et par
 *     les deux producteurs de `message:new` (`messageNewPayload.ts:164-168`, forme
 *     BRUTE côté socket, sender APLATI côté REST — ce module ne lit que ce que
 *     les deux ont en commun) ;
 *   • TRANSFERT — `forwardedFromId` / `forwardedFromConversationId` sur la ligne
 *     (`messages-list-query.ts:517-520`), et les DEUX objets nommants
 *     `forwardedFrom` / `forwardedFromConversation` que l'enrichissement ajoute
 *     APRÈS avoir demandé la réciprocité de la source (`:643-762`, directive
 *     produit 2026-08-23). Quand la réciprocité refuse, les deux tombent
 *     ENSEMBLE : la provenance se dit, la source ne s'invente pas ;
 *   • PUBLICATION — `postReplyTo`, le SNAPSHOT figé du post cité
 *     (`services/messaging/postReplySnapshot.ts:73`), hissé en champ de premier
 *     niveau par la liste (`messages-list-query.ts:768-790`) et par le socket
 *     (`MessageHandler.ts:1325-1334`) — mais PAS par le chemin REST/ZMQ de
 *     `message:new`, qui sert `metadata` brut (`MeeshySocketIOManager.ts:2980`).
 *     Les deux formes se lisent ici, sans quoi la citation d'une réponse à une
 *     story ARRIVÉE en direct par le chemin REST serait muette.
 *
 * CE QUI N'EST PAS SERVI N'EST PAS AFFICHÉ (§ 5.2, régime 3). La passerelle ne
 * sert AUCUNE traduction d'un message cité (`replyTo.select` ne demande pas
 * `translations`, pas plus que `forwardedFrom` ou le snapshot) : l'aperçu est
 * donc l'ORIGINAL, et il voyage avec sa langue quand elle est connue — jamais
 * une descente inventée à côté de celle du texte.
 */

export type GenreDeCitation = 'transfert' | 'reponse' | 'story';

/** La sorte d'une publication citée, telle que le snapshot la nomme (`PostReplyTo.type`). */
export type SorteDePublication = 'humeur' | 'story' | 'reel' | 'publication';

export type Citation = {
  readonly genre: GenreDeCitation;
  /** Ce que la citation NOMME — l'auteur cité, la conversation d'origine, l'auteur de la publication. `null` quand la passerelle le tait. */
  readonly source: string | null;
  /** La sorte de la publication citée ; `null` hors `story`. */
  readonly sorte: SorteDePublication | null;
  /** La publication citée est celle du LECTEUR — « votre story » plutôt que « une story de X ». */
  readonly pourMoi: boolean;
  /** Ce qui est cité, en une ligne. `''` quand la passerelle n'en sert rien (un transfert ne cite que sa provenance). */
  readonly apercu: string;
  /** La langue de l'aperçu, quand la passerelle la sert — `lang=` part avec lui. */
  readonly langue: string | null;
  /**
   * L'identifiant de ce qui est cité — le message répondu, le message d'origine,
   * la publication. Une citation SANS cible n'existe pas : c'est lui qui prouve
   * qu'il y a quelque chose à citer, et c'est lui que le balisage porte
   * (`data-cite`) pour distinguer une citation SERVIE du gabarit que le module
   * clone.
   */
  readonly cible: string;
};

const SORTE_PAR_TYPE: Readonly<Record<string, SorteDePublication>> = {
  STATUS: 'humeur',
  STORY: 'story',
  REEL: 'reel',
  POST: 'publication',
};

const nomDe = (participant: Readonly<Record<string, unknown>> | null): string | null =>
  chaine(participant?.displayName) ?? chaine(participant?.username);

/**
 * Un message CITÉ peut être protégé. La passerelle sert son `content` sans le
 * juger — le `select` de `replyTo` ne demande même pas les trois drapeaux — et
 * c'est le lecteur qui garde : quand ils voyagent, un seul suffit à retenir le
 * texte ; quand ils manquent, rien ne peut être jugé et l'aperçu est celui que
 * la passerelle a servi (suivi nommé dans le rapport de l'écran).
 */
const apercuDuMessageCite = (cite: Readonly<Record<string, unknown>>, placeholder: string): string =>
  estProtege(cite) ? placeholder : (chaine(cite.content) ?? '');

const reponse = (brut: Readonly<Record<string, unknown>>, placeholder: string): Citation | null => {
  const cite = objet(brut.replyTo);
  const cible = chaine(brut.replyToId) ?? chaine(cite?.id);
  if (cible === null) return null;
  const protege = cite !== null && estProtege(cite);
  return {
    genre: 'reponse',
    source: nomDe(objet(cite?.sender)),
    sorte: null,
    pourMoi: false,
    apercu: cite === null ? '' : apercuDuMessageCite(cite, placeholder),
    langue: protege ? null : chaine(cite?.originalLanguage),
    cible,
  };
};

const transfert = (brut: Readonly<Record<string, unknown>>): Citation | null => {
  const cible = chaine(brut.forwardedFromId) ?? chaine(brut.forwardedFromConversationId);
  if (cible === null) return null;
  const conversation = objet(brut.forwardedFromConversation);
  const origine = objet(brut.forwardedFrom);
  return {
    genre: 'transfert',
    source: chaine(conversation?.title) ?? chaine(conversation?.identifier) ?? nomDe(objet(origine?.sender)),
    sorte: null,
    pourMoi: false,
    apercu: '',
    langue: null,
    cible,
  };
};

const publication = (brut: Readonly<Record<string, unknown>>, moi: string | null): Citation | null => {
  const snapshot = objet(brut.postReplyTo) ?? objet(objet(brut.metadata)?.postReplyTo);
  const cible = chaine(snapshot?.id) ?? chaine(brut.storyReplyToId);
  if (snapshot === null || cible === null) return null;
  const auteur = chaine(snapshot.authorId);
  return {
    genre: 'story',
    source: chaine(snapshot.authorName),
    sorte: SORTE_PAR_TYPE[chaine(snapshot.type) ?? ''] ?? 'publication',
    pourMoi: auteur !== null && auteur === moi,
    apercu: chaine(snapshot.previewText) ?? chaine(snapshot.moodEmoji) ?? '',
    langue: null,
    cible,
  };
};

/**
 * L'ORDRE est fixe et vient de cette table, pas d'une suite de `if` : un
 * message peut être à la fois transféré et une réponse, et la provenance se lit
 * avant ce qu'on cite. Un message PROTÉGÉ ne cite rien — la protection retient
 * tout ce que la charge transporte, pas seulement sa chaîne (cycle 125).
 */
const EXTRACTEURS: readonly ((brut: Readonly<Record<string, unknown>>, moi: string | null, placeholder: string) => Citation | null)[] = [
  (brut) => transfert(brut),
  (brut, _moi, placeholder) => reponse(brut, placeholder),
  (brut, moi) => publication(brut, moi),
];

export const citations = ({
  brut,
  moi,
  protege,
  placeholder,
}: {
  readonly brut: Readonly<Record<string, unknown>>;
  readonly moi: string | null;
  readonly protege: boolean;
  /** La mention servie à la place d'un contenu retenu — celle du fil, jamais une seconde phrase. */
  readonly placeholder: string;
}): readonly Citation[] =>
  protege
    ? []
    : EXTRACTEURS.map((extracteur) => extracteur(brut, moi, placeholder)).filter((citation): citation is Citation => citation !== null);
