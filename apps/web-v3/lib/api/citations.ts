import { chaine, estProtege, instant, objet } from './lecture';

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
 * `translations`, pas plus que `forwardedFrom` ou le snapshot) : l'aperçu lu
 * dans la charge est donc l'ORIGINAL, et il voyage avec sa langue quand elle
 * est connue — jamais une descente inventée à côté de celle du texte.
 *
 * MAIS LA CIBLE EST, LE PLUS SOUVENT, DÉJÀ DANS LA PAGE. `replyToId` désigne un
 * message de la même tranche, dont les traductions SONT servies
 * (`messages-list-query.ts:255-257`, `include_translations` vaut `true` par
 * défaut). Servir l'original alors que la bulle citée affiche, deux lignes plus
 * haut, sa traduction, c'est DEUX TEXTES POUR UN MÊME MESSAGE sur le même
 * écran — la forme exacte du cycle 122. `citationsDeLaPage` referme cela sans
 * un octet de réseau : quand la cible est là, l'aperçu EST ce que la bulle
 * citée affiche, et la descente reste UNIQUE (celle du texte, déjà faite).
 *
 * ET LA PROTECTION SE LIT AU MÊME ENDROIT. `estProtege(replyTo)` ne pouvait
 * jamais se déclencher sur le chemin REST : le `select` de `replyTo`
 * (`messages-list-query.ts:262-296`) ne demande NI `isViewOnce`, NI
 * `isBlurred`, NI `expiresAt`, NI `deletedAt`, là où le chemin SOCKET
 * (`MessageProcessor.ts:462`, un `include`) les fait tous voyager. Le même
 * message avait donc deux rendus selon son chemin d'arrivée : la mention en
 * direct, le TEXTE EN CLAIR après un rechargement. Quand la cible est dans la
 * page, c'est la BULLE qui juge — `protege` et `supprime` y sont déjà résolus,
 * identiquement sur les deux chemins. Reste le cas d'une cible HORS page, où la
 * charge est tout ce qu'on a : la garde y tient sur ce qui voyage, et la parité
 * du `select` est une issue de la passerelle, jamais un correctif d'ici.
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
  /**
   * LA CIBLE EST DANS LA PAGE — donc le SAUT existe (§ 12.10.1). Le fait est
   * établi par `citationsDeLaPage`, le seul site qui connaisse la tranche
   * entière ; ni la ligne servie ni le peintre du temps réel ne le recalculent,
   * sans quoi la même citation serait cliquable d'un côté et morte de l'autre.
   * Faux ⇒ aucun `href` n'est rendu : un contrôle qui ne mènerait nulle part
   * n'est pas un contrôle (charte règle 7).
   */
  readonly surLaPage: boolean;
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
 * LES MENTIONS QUI REMPLACENT UN CONTENU RETENU — celles du fil, jamais une
 * seconde phrase. Deux, parce qu'un message RETENU et un message SUPPRIMÉ ne
 * disent pas la même chose au lecteur.
 */
export type MentionsRetenues = { readonly protege: string; readonly supprime: string };

/**
 * CE QUI RETIENT UN MESSAGE CITÉ. `estProtege` est la loi des trois drapeaux —
 * elle reste la loi du MESSAGE. Un message SUPPRIMÉ n'est pas « protégé » (sa
 * bulle garde sa mention, elle ne disparaît pas) : c'est une garde JUMELLE,
 * posée là où elle manquait. Le chemin socket sert `deletedAt` sur `replyTo`
 * (`include`) ; sans elle, une parole retirée pour tout le monde reparaissait
 * entière dans l'aperçu de la réponse qui la citait.
 */
const mentionRetenue = (cite: Readonly<Record<string, unknown>>, mentions: MentionsRetenues): string | null => {
  if (instant(cite.deletedAt) !== null) return mentions.supprime;
  if (estProtege(cite)) return mentions.protege;
  return null;
};

const reponse = (brut: Readonly<Record<string, unknown>>, mentions: MentionsRetenues): Citation | null => {
  const cite = objet(brut.replyTo);
  const cible = chaine(brut.replyToId) ?? chaine(cite?.id);
  if (cible === null) return null;
  const retenue = cite === null ? null : mentionRetenue(cite, mentions);
  return {
    genre: 'reponse',
    source: nomDe(objet(cite?.sender)),
    sorte: null,
    pourMoi: false,
    apercu: cite === null ? '' : (retenue ?? chaine(cite.content) ?? ''),
    langue: retenue !== null ? null : chaine(cite?.originalLanguage),
    cible,
    surLaPage: false,
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
    surLaPage: false,
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
    surLaPage: false,
  };
};

/**
 * L'ORDRE est fixe et vient de cette table, pas d'une suite de `if` : un
 * message peut être à la fois transféré et une réponse, et la provenance se lit
 * avant ce qu'on cite. Un message PROTÉGÉ ne cite rien — la protection retient
 * tout ce que la charge transporte, pas seulement sa chaîne (cycle 125).
 */
const EXTRACTEURS: readonly ((brut: Readonly<Record<string, unknown>>, moi: string | null, mentions: MentionsRetenues) => Citation | null)[] = [
  (brut) => transfert(brut),
  (brut, _moi, mentions) => reponse(brut, mentions),
  (brut, moi) => publication(brut, moi),
];

export const citations = ({
  brut,
  moi,
  protege,
  mentions,
}: {
  readonly brut: Readonly<Record<string, unknown>>;
  readonly moi: string | null;
  readonly protege: boolean;
  readonly mentions: MentionsRetenues;
}): readonly Citation[] =>
  protege
    ? []
    : EXTRACTEURS.map((extracteur) => extracteur(brut, moi, mentions)).filter((citation): citation is Citation => citation !== null);

/**
 * CE QU'IL FAUT D'UN MESSAGE POUR ÊTRE CITÉ — la forme que `Message`
 * (`lib/api/fil.ts`) et `Bulle` (`lib/realtime/fil-etat.ts`) satisfont toutes
 * deux, sans que ce module ait à connaître ni l'une ni l'autre.
 */
export type MessageCitable = {
  readonly id: string;
  readonly texte: string;
  readonly langueServie: string | null;
  readonly langueOriginale: string | null;
  readonly protege: boolean;
  readonly supprime: boolean;
  readonly citations: readonly Citation[];
};

const citationSurLaPage = (citation: Citation, cible: MessageCitable, mentions: MentionsRetenues): Citation => {
  if (cible.supprime) return { ...citation, apercu: mentions.supprime, langue: null, surLaPage: true };
  if (cible.protege) return { ...citation, apercu: mentions.protege, langue: null, surLaPage: true };
  return { ...citation, apercu: cible.texte, langue: cible.langueServie ?? cible.langueOriginale, surLaPage: true };
};

/**
 * L'APERÇU D'UNE CITATION DONT LA CIBLE EST DANS LA PAGE — le site UNIQUE de
 * cette règle, lu par la liste servie (`messages`, `lib/api/fil.ts`) et par
 * l'état du fil en direct (`lib/realtime/fil-etat.ts`), pour que les deux
 * chemins rendent le même aperçu du même message.
 *
 * Quand la cible manque (message hors tranche, publication, conversation
 * d'origine), la citation est rendue TELLE QUELLE : ce que la passerelle a
 * servi reste ce qui s'affiche, régime 3.
 */
export const citationsDeLaPage = <T extends MessageCitable>({
  messages,
  mentions,
}: {
  readonly messages: readonly T[];
  readonly mentions: MentionsRetenues;
}): readonly T[] => {
  const parIdentifiant = new Map(messages.map((message) => [message.id, message]));
  return messages.map((message) => {
    if (message.citations.length === 0) return message;
    const resolues = message.citations.map((citation) => {
      const cible = parIdentifiant.get(citation.cible);
      return cible === undefined || cible.id === message.id ? citation : citationSurLaPage(citation, cible, mentions);
    });
    return resolues.every((citation, rang) => citation === message.citations[rang])
      ? message
      : { ...message, citations: resolues };
  });
};
