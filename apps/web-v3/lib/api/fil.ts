import { transcriptTranslationTexts, transcriptTranslationTracks } from '@meeshy/shared/types/attachment-audio';
import { DELAI_DE_REPONSE_MS } from './passerelle';
import {
  buildTranslationRecord,
  resolvePrismTranslation,
  resolveUserLanguagesOrdered,
} from '@meeshy/shared/utils/conversation-helpers';

import { citations, citationsDeLaPage, type Citation, type MentionsRetenues } from './citations';
import { genreDeMime, pisteSuitLaLangue, type GenreDePiece } from './formes';
import { chaine, estProtege, instant, nombre, objet } from './lecture';
import { lieuDeMessage, type Lieu } from './lieu';
import { baseDeLaPasserelle, baseDeLaPasserellePublique } from './links';

export type { Citation, GenreDeCitation, SorteDePublication } from './citations';
export type { GenreDePiece } from './formes';
export type { Lieu } from './lieu';

/**
 * LE FIL D'UNE CONVERSATION — et la seule surface de la v3 où le PRISME
 * s'applique.
 *
 * LA DESCENTE N'EST PAS RÉÉCRITE ICI. `resolvePrismTranslation` est le site
 * unique de la règle (`CLAUDE.md` § « La descente elle-même est UNE fonction »),
 * et son histoire est celle de trois familles divergentes nées de trois
 * réécritures. Ce module n'adapte qu'une FORME — la passerelle sert un TABLEAU
 * `{ language, content }[]`, le résolveur attend une carte — et l'adaptateur
 * lui-même est partagé (`buildTranslationRecord`, remonté dans
 * `@meeshy/shared`). Ni l'ordre, ni la règle « la langue d'origine concourt à
 * son RANG », ni la normalisation ne sont recopiés. La transcription d'un vocal
 * descend le MÊME prisme, depuis la carte que `transcriptTranslationTexts`
 * (`packages/shared/types/attachment-audio.ts`) est seul à dépouiller.
 *
 * DEUX PORTES, UNE CRÉANCE. Le membre présente son jeton en `Authorization:
 * Bearer`, l'invité sa session en `X-Session-Token` — les deux formes que
 * `createUnifiedAuthMiddleware` lit (`services/gateway/src/middleware/auth.ts:
 * 705-708`), et les deux routes de ce module les acceptent toutes deux
 * (`optionalAuth` = `{ requireAuth: false, allowAnonymous: true }`,
 * `routes/conversations/index.ts:26-29`). Le fil de l'invité et le fil du
 * membre sont donc LUS par la même fonction : c'est ce qui rend « deux portes,
 * une seule vue » vrai jusque dans la donnée.
 *
 * `resolveUserLanguagesOrdered` ne porte PAS le repli `'fr'` — il rend une liste
 * vide quand rien n'est configuré. On l'ajoute, comme le fait `apps/web`, pour
 * rester en phase avec `resolveUserLanguage` (rang 5) et avec le repli
 * `["fr"]` d'Android.
 *
 * L'ADRESSE D'UNE PIÈCE JOINTE SE RÉSOUT ICI, ET NULLE PART AILLEURS. La
 * passerelle sert `fileUrl` en chemin RELATIF (`UploadProcessor.getAttachmentPath`
 * ⇒ `/api/v1/attachments/file/<chemin>`) : posé tel quel dans un `href`, il se
 * résout contre l'ORIGINE DU DOCUMENT — `meeshy.me`, où l'hôte du frontend ne
 * route pas `/api` — et le lien est un contrôle inerte. `urlDePiece` le résout
 * contre l'origine PUBLIQUE de la passerelle, celle que le navigateur suit
 * (le legacy fait de même : `apps/web/utils/attachment-url.ts`). Les lecteurs
 * de `message()` DISENT cette origine : le serveur passe
 * `baseDeLaPasserellePublique()`, le module de participation l'origine que le
 * document lui a donnée.
 */

export type Recuperateur = (url: string, options: RequestInit) => Promise<Response>;

/**
 * Ce que le lecteur PRÉSENTE à la passerelle. Le jeton d'un membre et la
 * session d'un invité ne voyagent pas dans le même en-tête, et le module de
 * participation présente les mêmes deux formes au socket
 * (`AuthHandler.handleTokenAuthentication`, `auth.token` / `auth.sessionToken`).
 */
export type Creance =
  | { readonly genre: 'membre'; readonly jeton: string }
  | { readonly genre: 'invite'; readonly jeton: string };

export const entetesDeCreance = (creance: Creance): Readonly<Record<string, string>> =>
  creance.genre === 'membre'
    ? { authorization: `Bearer ${creance.jeton}` }
    : { 'x-session-token': creance.jeton };

export type PieceJointe = {
  readonly id: string;
  readonly genre: GenreDePiece;
  readonly nom: string;
  readonly url: string;
  /**
   * LA PISTE À JOUER — élue par la langue du TEXTE SERVI, jamais par une
   * seconde descente (CLAUDE.md § Prisme, cycle 128) : le lecteur ENTEND ce
   * qu'il LIT. C'est le fichier d'origine quand le TTS n'a produit aucune piste
   * dans cette langue — une entrée sans `url` concourt pour le texte et pas
   * pour le son (`transcriptTranslationTracks`).
   *
   * `url` reste ce qui se TÉLÉCHARGE : le fichier que l'auteur a envoyé, avec
   * son nom et son poids. Deux adresses parce que deux gestes.
   */
  readonly piste: string;
  /** Le poids ANNONCÉ avant tout téléchargement — `null` quand la passerelle ne le sert pas. */
  readonly octets: number | null;
  readonly dureeMs: number | null;
  readonly largeur: number | null;
  readonly hauteur: number | null;
  /** La transcription d'un vocal, SERVIE dans la langue du lecteur quand elle existe. */
  readonly transcription: string | null;
  /**
   * La transcription telle qu'elle a été FAITE — ce que « Voir l'original »
   * déplie sous un vocal traduit. Sans elle, un message dont le vocal est le
   * seul contenu servait une traduction que rien n'annonçait et dont on ne
   * pouvait pas revenir (cycle 122 : « qui AFFICHE ce qu'il élit »).
   */
  readonly transcriptionOriginale: string | null;
  readonly langueDeTranscription: string | null;
  readonly langueServie: string | null;
};

export type Reaction = {
  readonly emoji: string;
  readonly nombre: number;
  /** La pastille est la MIENNE — appris d'un événement ou de mon geste ; la liste REST ne le sert pas (#4177). */
  readonly mienne: boolean;
};

export type Accuse = 'envoye' | 'recu' | 'lu';

export type Message = {
  readonly id: string;
  readonly clientMessageId: string | null;
  readonly auteur: string;
  readonly auteurId: string | null;
  readonly anonyme: boolean;
  readonly deMoi: boolean;
  readonly systeme: boolean;
  readonly texte: string;
  /** Le texte d'ORIGINE, tel que l'auteur l'a écrit — ce que « Voir l'original » déplie. */
  readonly texteOriginal: string;
  /** La langue SERVIE quand ce n'est pas l'originale — `null` sinon. */
  readonly langueServie: string | null;
  readonly langueOriginale: string | null;
  /** La carte des traductions servies, gardée pour qu'une traduction ARRIVANT en direct redescende le prisme. */
  readonly traductions: Readonly<Record<string, string>>;
  readonly ecritA: string | null;
  /** Un contenu que la protection interdit d'afficher : le texte est absent. */
  readonly protege: boolean;
  readonly edite: boolean;
  readonly supprime: boolean;
  readonly pieces: readonly PieceJointe[];
  /**
   * UN LIEU PARTAGÉ (#5061) — `null` sur la quasi-totalité des messages. Il se
   * lit comme une PLACE (`lib/api/lieu.ts`), jamais comme deux nombres bruts :
   * la même règle que `pieces`, et pour la même raison — un contenu que la
   * protection retient ne sert AUCUN champ de position (cycles 124/125 du
   * § Prisme).
   */
  readonly lieu: Lieu | null;
  /** Ce que le message CITE — provenance, réponse, publication (`lib/api/citations.ts`). */
  readonly citations: readonly Citation[];
  readonly reactions: readonly Reaction[];
  readonly accuse: Accuse;
};

/**
 * LA PRÉSENCE SERVIE — deux listes de CLÉS, telles que `user:status` les
 * nomme : le `User.id` d'un inscrit, le `Participant.id` d'un anonyme
 * (`core-detail.ts:232`, `presenceChecker.isOnline(m.userId ?? m.id)`).
 * `participants` dit QUI le document a nommés — les seuls dont une transition
 * reçue peut changer le compte ; `presents` dit qui la passerelle SERT en ligne
 * (directive 2026-08-25 : rien hors amitié acceptée) — jamais un chiffre
 * fabriqué. Le compte « N en ligne » est la longueur de la seconde.
 */
export type Presence = {
  readonly participants: readonly string[];
  readonly presents: readonly string[];
};

export const AUCUNE_PRESENCE: Presence = { participants: [], presents: [] };

export type Fil = {
  /** L'identifiant de BASE de la conversation — celui des rooms et du `scope` de `/sync`. */
  readonly id: string;
  readonly titre: string;
  readonly membres: number;
  readonly presence: Presence;
  readonly messages: readonly Message[];
  /** Le curseur `before` de la page plus ancienne, `null` quand le fil est lu en entier. */
  readonly plusAncien: string | null;
  /**
   * `conversation.type` (`direct` | `public` | `group` | `global`…) — SERVI
   * SANS COÛT SUPPLÉMENTAIRE : `GET /conversations/:id` sans `?fields=` rend
   * le PROFIL DOCUMENTÉ par défaut, qui porte `type` (`core-detail.ts:167`,
   * `CONVERSATION_DETAIL_SERVED_FIELDS`) — cette lecture n'ajoute AUCUNE
   * requête, elle nomme un champ déjà dans la réponse.
   *
   * Gouverne `peutCreerUnLien` (`fil-vue.ts`, correction de revue #5034) :
   * la passerelle refuse la création d'un lien de partage sur un `direct`
   * (`share-link-mint.ts:196-199`), quel que soit le rang. Optionnel — seules
   * les fixtures qui exercent CETTE garde le posent ; la passerelle, elle, le
   * sert toujours.
   */
  readonly type?: string;
  /**
   * `conversation.currentUserRole` — le rang du LECTEUR dans CETTE
   * conversation (`creator`/`admin`/`moderator`/`member`), lui aussi déjà
   * SERVI sans `?fields=` (même paragraphe que `type` ci-dessus). `null`
   * quand la passerelle n'a résolu aucun rang (lecteur hors participation
   * connue). Gouverne `peutCreerUnLien` : la passerelle exige au moins
   * MODÉRATEUR hors des conversations `public` (`share-link-mint.ts:206-209`,
   * `mayMintShareLink`).
   */
  readonly rang?: string | null;
};

export type Issue =
  | { readonly genre: 'fil'; readonly fil: Fil }
  | { readonly genre: 'introuvable' }
  /** Le jeton vaut, la place existe, et c'est le LIEN qui ferme la lecture — `SHARE_LINK_EXPIRED`, `SHARE_LINK_MAX_USES`. */
  | { readonly genre: 'lien-clos'; readonly code: string }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const DELAI_MS = DELAI_DE_REPONSE_MS;

/**
 * LE PLAFOND D'UN MESSAGE — `MESSAGE_LIMITS.MAX_MESSAGE_LENGTH`
 * (`services/gateway/src/config/message-limits.ts:13`), la valeur que la
 * passerelle sert sans réglage d'environnement, appliquée par
 * `SendMessageBodySchema` (`routes/conversations/messages-send.ts:41-48`) sur
 * la route et par `validateMessageLength` (`MessageHandler.ts:362-370`) sur
 * le socket. La v3 ne l'importe pas — la frontière de paquet ne se traverse
 * pas — mais `__tests__/limite-du-message.test.ts` relit le fichier de la
 * passerelle et rougit si la valeur y change. Le composeur l'ANNONCE
 * (`maxlength`, compteur) et un refus qui le franchirait quand même — une
 * passerelle réglée plus bas — rend le texte au champ, jamais une bulle en
 * échec (`lib/realtime/participate.ts`).
 */
export const LONGUEUR_MAX_DU_MESSAGE = 4000;
const REPLI_DE_LANGUE = 'fr';

/**
 * LA FENÊTRE D'ÉDITION D'UN MESSAGE — `MESSAGE_EDIT_WINDOW_MS`
 * (`services/gateway/src/services/messaging/messageEditAdmission.ts:62`), la
 * loi UNIQUE que `PUT /messages/:messageId` et `message:edit` appliquent
 * (borne INCLUSIVE — vrai à 24 h pile). Le même patron que
 * `LONGUEUR_MAX_DU_MESSAGE` ci-dessus : la v3 ne l'importe pas — la
 * frontière de paquet ne se traverse pas —, mais `__tests__/
 * limite-du-message.test.ts` relit le fichier de la passerelle et rougit si
 * la valeur y change. « Modifier » n'est RENDU que si `peutModifier` répond
 * vrai (charte règle 7) ; un 403 qui arriverait quand même (horloge du
 * client en retard) est SERVI tel quel, jamais avalé.
 */
export const FENETRE_D_EDITION_MS = 24 * 60 * 60 * 1000;

/**
 * Un message que la protection retient. Le texte n'est PAS servi — c'est la
 * leçon des cycles 124 et 125 du § Prisme : une garde qui DÉCLARE une
 * restriction sans la faire respecter laisse partir ce qu'elle prétend retenir.
 * La v3 ne sait pas encore consommer une vue unique ; tant qu'elle ne sait pas,
 * elle n'en montre rien.
 */
export const MENTION_PROTEGEE = 'Message protégé — ouvrez-le depuis l’application.';

/**
 * La mention d'une parole RETIRÉE. Elle vit ici, avec sa jumelle, parce que
 * DEUX surfaces la servent : la bulle (`FIL.supprime`, qui la lit) et l'aperçu
 * d'une citation dont la cible a été supprimée. Un message supprimé ne se cite
 * pas — et l'écrire deux fois aurait fait diverger les deux phrases.
 */
export const MENTION_SUPPRIMEE = 'Ce message a été supprimé';

export const MENTIONS_RETENUES: MentionsRetenues = { protege: MENTION_PROTEGEE, supprime: MENTION_SUPPRIMEE };

/** Exportée pour `lib/api/fil-mutations.ts` (§ 4 étape 0 de la spécification #5061) — le site unique de la requête authentifiée. */
export const demande = (
  url: string,
  creance: Creance,
  recuperer: Recuperateur | undefined,
  options: RequestInit = {},
): Promise<Response | null> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    ...options,
    headers: { accept: 'application/json', ...entetesDeCreance(creance), ...options.headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
  }).catch(() => null);

export type Prisme = {
  readonly systemLanguage?: string | null;
  readonly regionalLanguage?: string | null;
  readonly customDestinationLanguage?: string | null;
};

export const languesDuLecteur = (lecteur: Prisme, localeAppareil?: string): readonly string[] => {
  const ordonnees = resolveUserLanguagesOrdered(lecteur, { deviceLocale: localeAppareil });
  return ordonnees.length === 0 ? [REPLI_DE_LANGUE] : ordonnees;
};

const CHEMIN_DES_FICHIERS = '/api/v1/attachments/file/';

/**
 * `fileUrl` tel que la passerelle le sert, résolu sur SON origine publique :
 * une adresse absolue reste telle quelle (forme héritée qui fonctionne), un
 * chemin absolu prend l'origine, une CLÉ de stockage (`2025/12/<id>/f.pdf`,
 * la seule forme en base depuis #4324) prend la route des fichiers — les trois
 * formes que le legacy reconnaît (`buildAttachmentUrl`).
 */
export const urlDePiece = (fileUrl: string, origine: string): string => {
  if (/^https?:\/\//.test(fileUrl)) return fileUrl;
  const base = origine.replace(/\/+$/, '');
  if (fileUrl.startsWith('/')) return `${base}${fileUrl}`;
  return `${base}${CHEMIN_DES_FICHIERS}${encodeURIComponent(fileUrl)}`;
};

const piece = (
  brut: Readonly<Record<string, unknown>>,
  langues: readonly string[],
  origine: string,
): PieceJointe | null => {
  const id = chaine(brut.id);
  const servie = chaine(brut.fileUrl);
  if (id === null || servie === null) return null;
  const url = urlDePiece(servie, origine);

  const transcription = objet(brut.transcription);
  const langueDeTranscription = chaine(transcription?.language);
  const traduite = resolvePrismTranslation({
    translations: transcriptTranslationTexts(brut.translations),
    originalLanguage: langueDeTranscription,
    preferredLanguages: langues,
  });
  const genre: GenreDePiece = genreDeMime(chaine(brut.mimeType));
  // UNE descente, deux projections : le TEXTE que `traduite` élit, et la PISTE
  // que sa langue désigne dans la carte jumelle. Descendre le prisme une
  // seconde fois pour le son servirait « la réunion est déplacée » au-dessus
  // d'une piste espagnole (leçon 284).
  //
  // Et SEUL un vocal change de piste. `transcriptTranslationTracks` normalise
  // le format d'une piste en `audio/*` (`attachment-audio.ts`, `normalizeTrackMimeType`) :
  // rien dans la carte ne dit qu'une piste traduite serait une VIDÉO. La servir
  // à un `<video>` remplacerait l'image par du son — pire que l'original, parce
  // que ça a l'air d'une vidéo cassée plutôt que d'une traduction absente. Le
  // Prisme d'une vidéo passe donc par ses SOUS-TITRES, qui descendent, eux.
  const piste = traduite === null || !pisteSuitLaLangue(genre) ? null : transcriptTranslationTracks(brut.translations)[traduite.language];

  return {
    id,
    genre,
    nom: chaine(brut.originalName) ?? chaine(brut.fileName) ?? 'Pièce jointe',
    url,
    piste: piste?.url === undefined ? url : urlDePiece(piste.url, origine),
    octets: nombre(brut.fileSize),
    dureeMs: nombre(brut.duration),
    largeur: nombre(brut.width),
    hauteur: nombre(brut.height),
    transcription: traduite?.text ?? chaine(transcription?.text),
    transcriptionOriginale: chaine(transcription?.text),
    langueDeTranscription,
    langueServie: traduite?.language ?? null,
  };
};

const pieces = (brut: unknown, langues: readonly string[], origine: string): readonly PieceJointe[] =>
  (Array.isArray(brut) ? brut : [])
    .map((candidat) => objet(candidat))
    .filter((candidat): candidat is Readonly<Record<string, unknown>> => candidat !== null)
    .map((candidat) => piece(candidat, langues, origine))
    .filter((candidat): candidat is PieceJointe => candidat !== null);

/** `reactionSummary` est une carte `emoji → compte` (`ReactionService.getEmojiAggregation`). */
export const reactions = (brut: unknown): readonly Reaction[] => {
  const carte = objet(brut);
  if (carte === null) return [];
  return Object.entries(carte)
    .map(([emoji, compte]) => ({ emoji, nombre: nombre(compte) ?? 0, mienne: false }))
    .filter((reaction) => reaction.nombre > 0);
};

/**
 * L'ACCUSÉ, lu sur les compteurs que la liste sert — calculés, jamais lus de la
 * ligne (`messages-list-query.ts:533-552`). `readByAllAt` est la preuve que
 * tous ont lu ; en deçà, un seul destinataire servi vaut « reçu ».
 */
const accuse = (brut: Readonly<Record<string, unknown>>): Accuse => {
  if (instant(brut.readByAllAt) !== null || (nombre(brut.readCount) ?? 0) > 0) return 'lu';
  if (instant(brut.deliveredToAllAt) !== null || (nombre(brut.deliveredCount) ?? 0) > 0) return 'recu';
  return 'envoye';
};

/**
 * Un message, tel qu'il arrive de la liste REST OU du fil `message:new` : les
 * deux charges portent les mêmes noms pour ce que ce module lit
 * (`messages-list-query.ts:487-600`, `messageNewPayload.ts:126-176`).
 *
 * `moi` est l'identité que le lecteur COMPARE : le `User.id` d'un membre, le
 * `Participant.id` d'un invité — la passerelle sert `senderId` sous la première
 * forme pour un auteur inscrit et sous la seconde pour un auteur anonyme, et
 * garde le brut sous `senderParticipantId` ; les deux sont regardés.
 *
 * `origine` est l'origine PUBLIQUE de la passerelle, sur laquelle les pièces
 * jointes se résolvent (`urlDePiece`) : l'appelant la DIT, parce que ce module
 * est lu par le serveur ET par le module de participation, et qu'un seul des
 * deux peut la lire dans l'environnement.
 */
export const message = (
  brut: Readonly<Record<string, unknown>>,
  moi: string | null,
  langues: readonly string[],
  origine: string,
): Message | null => {
  const id = chaine(brut.id);
  if (id === null) return null;

  const expediteur = objet(brut.sender);
  const langueOriginale = chaine(brut.originalLanguage);
  const protege = estProtege(brut);
  const supprime = instant(brut.deletedAt) !== null;
  const traductions = protege ? {} : buildTranslationRecord(brut.translations);
  const texteOriginal = protege ? MENTION_PROTEGEE : (chaine(brut.content) ?? '');

  const servie = protege
    ? null
    : resolvePrismTranslation({
        translations: traductions,
        originalLanguage: langueOriginale,
        preferredLanguages: langues,
      });

  const auteurId = chaine(brut.senderId) ?? chaine(expediteur?.id);
  const auteurParticipant = chaine(brut.senderParticipantId);

  return {
    id,
    clientMessageId: chaine(brut.clientMessageId),
    auteur: chaine(expediteur?.displayName) ?? chaine(expediteur?.username) ?? 'Quelqu’un',
    auteurId,
    anonyme: chaine(expediteur?.type) === 'anonymous',
    deMoi: moi !== null && (auteurId === moi || auteurParticipant === moi),
    systeme: chaine(brut.messageType) === 'system',
    texte: supprime ? '' : (servie?.text ?? texteOriginal),
    texteOriginal,
    langueServie: servie?.language ?? null,
    langueOriginale,
    traductions,
    ecritA: instant(brut.createdAt),
    protege,
    edite: brut.isEdited === true,
    supprime,
    pieces: protege || supprime ? [] : pieces(brut.attachments, langues, origine),
    lieu: protege || supprime ? null : lieuDeMessage(brut),
    citations: supprime ? [] : citations({ brut, moi, protege, mentions: MENTIONS_RETENUES }),
    reactions: reactions(brut.reactionSummary),
    accuse: accuse(brut),
  };
};

/**
 * LA TRANCHE, ET CE QU'ELLE SE CITE À ELLE-MÊME. `message()` lit un message
 * SEUL : il ne peut pas savoir que la cible de sa citation est deux lignes plus
 * haut, avec sa traduction déjà servie. `citationsDeLaPage` le sait, et c'est
 * lui qui referme les deux textes d'un même message (cycle 122) ET les deux
 * rendus d'un message cité protégé (REST sans drapeaux, socket avec).
 */
/**
 * CE QUE LA BULLE ANNONCE DU PRISME — la pastille `.langue` et son « Voir
 * l'original ». Elle regarde le TEXTE d'abord, puis ce que le message PORTE.
 *
 * Sur un message dont le VOCAL est le seul contenu, `langueServie` vaut `null`
 * — il n'y a pas de texte à traduire — et toute l'interface du Prisme
 * disparaissait avec lui : aucune pastille, aucun retour à l'original, alors
 * que la transcription servie ÉTAIT une traduction. C'est le cycle 122 dans sa
 * forme la plus courte : la descente est juste, sa valeur n'atteint pas le
 * lecteur. La cible le dessine d'ailleurs — la vidéo sans texte de
 * `cible/rich.png` porte bien sa pastille de langue.
 */
export type AnnonceDuPrisme = { readonly origine: string; readonly servie: string };

export const annonceDeLaPiece = (piece: PieceJointe): AnnonceDuPrisme | null =>
  piece.langueServie === null || piece.langueDeTranscription === null
    ? null
    : { origine: piece.langueDeTranscription, servie: piece.langueServie };

export const annonceDuPrisme = (message: Message): AnnonceDuPrisme | null => {
  if (message.supprime || message.protege) return null;
  if (message.langueServie !== null && message.langueOriginale !== null) {
    return { origine: message.langueOriginale, servie: message.langueServie };
  }
  return message.pieces.reduce<AnnonceDuPrisme | null>((trouvee, piece) => trouvee ?? annonceDeLaPiece(piece), null);
};

export const messages = (
  bruts: unknown,
  moi: string | null,
  langues: readonly string[],
  origine: string,
): readonly Message[] =>
  citationsDeLaPage({
    messages: (Array.isArray(bruts) ? bruts : [])
      .map((brut) => objet(brut))
      .filter((brut): brut is Readonly<Record<string, unknown>> => brut !== null)
      .map((brut) => message(brut, moi, langues, origine))
      .filter((m): m is Message => m !== null),
    mentions: MENTIONS_RETENUES,
  });

const cleDePresence = (participant: Readonly<Record<string, unknown>>): string | null =>
  chaine(participant.userId) ?? chaine(participant.id);

/** Les participants SERVIS par `GET /conversations/:id` (`core-detail.ts:231-236`, `isOnline` gardé par la visibilité de présence), réduits à leurs clés. */
const presenceServie = (participants: unknown): Presence => {
  const lignes = (Array.isArray(participants) ? participants : [])
    .map((participant) => objet(participant))
    .filter((participant): participant is Readonly<Record<string, unknown>> => participant !== null)
    .map((participant) => ({ cle: cleDePresence(participant), enLigne: participant.isOnline === true }))
    .filter((participant): participant is { readonly cle: string; readonly enLigne: boolean } => participant.cle !== null);
  return {
    participants: lignes.map((ligne) => ligne.cle),
    presents: lignes.filter((ligne) => ligne.enLigne).map((ligne) => ligne.cle),
  };
};

/**
 * Un 403 que la liste émet AU NOM DU LIEN du participant — `SHARE_LINK_EXPIRED`
 * quand il est échu, `SHARE_LINK_MAX_USES` quand `currentUses >= maxUses`, le
 * DERNIER admis compris (`routes/conversations/messages-list.ts:270-278`, gagé
 * par `messages-routes.test.ts:854-885`). Le jeton vaut, la place existe : ce
 * n'est ni une session expirée ni un fil introuvable, c'est l'état G du
 * § 6.3 vu depuis la liste. Le code voyage dans `code` (`sendForbidden(reply,
 * message, { code })`, `utils/response.ts:140-146`).
 */
const codeDeRefusDuLien = async (reponse: Response): Promise<string | null> => {
  if (reponse.status !== 403) return null;
  const enveloppe = objet(await reponse.json().catch(() => null));
  const code = chaine(enveloppe?.code) ?? chaine(enveloppe?.error);
  return code !== null && code.startsWith('SHARE_LINK_') ? code : null;
};

export const fil = async ({
  cle,
  creance,
  moi,
  langues,
  limite = 40,
  avant,
  autour,
  base,
  origine,
  recuperer,
}: {
  readonly cle: string;
  readonly creance: Creance;
  readonly moi: string | null;
  readonly langues: readonly string[];
  readonly limite?: number;
  /** L'identifiant du message le plus ancien déjà lu — la page servie s'arrête AVANT lui. */
  readonly avant?: string | null;
  /**
   * L'identifiant du message AUTOUR duquel servir la tranche (`around=`,
   * `routes/conversations/messages-list.ts:400-450` — la moitié avant, la
   * cible, la moitié après). C'est ce qui rend une pièce ATTEIGNABLE à
   * n'importe quelle profondeur d'historique : sans lui, `?media=` d'un
   * message ancien re-servait la tranche par défaut, où la pièce n'est pas.
   * La passerelle ignore `around` dès que `before` est posé : la porte ne
   * demande jamais les deux.
   */
  readonly autour?: string | null;
  /** L'adresse que le SERVEUR appelle — interne au réseau du conteneur. */
  readonly base?: string;
  /** L'origine que le NAVIGATEUR suit pour une pièce jointe — publique. */
  readonly origine?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Issue> => {
  const racine = `${base ?? baseDeLaPasserelle()}/api/v1/conversations/${encodeURIComponent(cle)}`;
  const originePublique = origine ?? baseDeLaPasserellePublique();
  // `before` l'emporte sur `around` chez la passerelle (`around && !before`) :
  // la porte n'en demande donc qu'UN — la tranche est nommée d'une seule façon.
  const curseur =
    avant !== undefined && avant !== null
      ? `&before=${encodeURIComponent(avant)}`
      : autour === undefined || autour === null
        ? ''
        : `&around=${encodeURIComponent(autour)}`;

  const [detail, liste] = await Promise.all([
    demande(racine, creance, recuperer),
    demande(`${racine}/messages?limit=${limite}${curseur}`, creance, recuperer),
  ]);

  if (detail === null || liste === null) return { genre: 'panne' };

  // 401 ET 403 NE DISENT PAS LA MÊME CHOSE, et les confondre fabrique une
  // BOUCLE. Mesuré contre la passerelle de staging : une conversation dont on
  // n'est pas membre rend `403 — Access denied: you are not a member of this
  // conversation or it no longer exists`. Traiter ce refus en session expirée
  // renvoyait vers `/login`, où le lecteur se reconnectait pour être renvoyé au
  // même fil, refusé de la même façon — indéfiniment, avec ses identifiants
  // ressaisis à chaque tour.
  //
  //   401 → le JETON ne vaut plus. C'est une affaire de session : on renvoie
  //         se connecter.
  //   403 → le jeton vaut, mais pas pour CECI. Se reconnecter n'y changerait
  //         rien. Et la réponse est « introuvable » plutôt qu'« interdit » :
  //         dire « ce fil existe, mais pas pour vous » répond à qui balaie des
  //         identifiants — c'est le patron `resolveConsumptionTarget` du § 5.1,
  //         déjà appliqué aux jetons de lien.
  if (detail.status === 401 || liste.status === 401) return { genre: 'session-expiree' };
  const refusDuLien = (await codeDeRefusDuLien(detail)) ?? (await codeDeRefusDuLien(liste));
  if (refusDuLien !== null) return { genre: 'lien-clos', code: refusDuLien };
  if ([detail.status, liste.status].some((statut) => statut === 403 || statut === 404)) {
    return { genre: 'introuvable' };
  }

  const enveloppeDetail = objet(await detail.json().catch(() => null));
  const enveloppeListe = objet(await liste.json().catch(() => null));
  const conversation = objet(enveloppeDetail?.data);
  if (enveloppeDetail?.success !== true || conversation === null) return { genre: 'panne' };
  if (enveloppeListe?.success !== true || !Array.isArray(enveloppeListe.data)) {
    return { genre: 'panne' };
  }

  const pagination = objet(enveloppeListe.cursorPagination);
  const id = chaine(conversation.id);
  if (id === null) return { genre: 'panne' };

  return {
    genre: 'fil',
    fil: {
      id,
      titre: chaine(conversation.title) ?? chaine(conversation.identifier) ?? 'Conversation',
      membres: nombre(conversation.memberCount) ?? 0,
      presence: presenceServie(conversation.participants),
      // La passerelle sert du plus RÉCENT au plus ancien ; un fil se lit dans
      // l'autre sens.
      messages: [...messages(enveloppeListe.data, moi, langues, originePublique)].reverse(),
      plusAncien: pagination?.hasMore === true ? chaine(pagination.nextCursor) : null,
      type: chaine(conversation.type) ?? undefined,
      rang: chaine(conversation.currentUserRole),
    },
  };
};

export type Envoi =
  | { readonly genre: 'envoye'; readonly id: string | null }
  | { readonly genre: 'refus'; readonly message: string; readonly statut: number | null };

const REFUS_ENVOI = 'Le message n’a pas pu être envoyé. Réessayez.';

export const envoie = async ({
  cle,
  creance,
  texte,
  clientMessageId,
  langue,
  pieces: identifiantsDePieces,
  replyToId,
  base,
  recuperer,
}: {
  readonly cle: string;
  readonly creance: Creance;
  readonly texte: string;
  /** `cid_<uuid v4>` — la clé d'idempotence que `message:new` renvoie à l'expéditeur seul. */
  readonly clientMessageId?: string;
  readonly langue?: string;
  /** Les `attachmentIds` d'un téléversement préalable (`messages-send.ts:155`). */
  readonly pieces?: readonly string[];
  /** Le message auquel on répond — `replyToId` (`messages-send.ts:60`), un identifiant PRÉSENT dans la page (§ 2). */
  readonly replyToId?: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Envoi> => {
  const reponse = await demande(
    `${base ?? baseDeLaPasserelle()}/api/v1/conversations/${encodeURIComponent(cle)}/messages`,
    creance,
    recuperer,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: texte,
        ...(clientMessageId === undefined ? {} : { clientMessageId }),
        ...(langue === undefined ? {} : { originalLanguage: langue }),
        ...(identifiantsDePieces === undefined || identifiantsDePieces.length === 0 ? {} : { attachmentIds: identifiantsDePieces }),
        ...(replyToId === undefined ? {} : { replyToId }),
      }),
    },
  );

  if (reponse === null) return { genre: 'refus', message: REFUS_ENVOI, statut: null };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success === true) return { genre: 'envoye', id: chaine(objet(enveloppe.data)?.id) };

  return {
    genre: 'refus',
    message: chaine(objet(enveloppe?.error)?.message) ?? chaine(enveloppe?.message) ?? REFUS_ENVOI,
    statut: reponse.status,
  };
};

export type Televersement =
  | { readonly genre: 'televerse'; readonly identifiants: readonly string[] }
  | { readonly genre: 'refus'; readonly message: string; readonly statut: number | null };

const REFUS_TELEVERSEMENT = 'La pièce jointe n’a pas pu être envoyée.';

/**
 * `POST /api/v1/attachments/upload` (`routes/attachments/upload.ts:55`,
 * `authOptional` — membre ET invité, `:287-311` : un invité est jugé sur
 * `allowAnonymousFiles` / `allowAnonymousImages` et sur les OCTETS du fichier) :
 * multipart, un champ par fichier, `{ success, data: { attachments: [{ id, … }] } }`.
 * Ce module ne sait rien du poids admis : c'est la passerelle qui refuse, et
 * son refus est SERVI au lecteur — jamais avalé.
 */
export const televerse = async ({
  creance,
  fichiers,
  base,
  recuperer,
}: {
  readonly creance: Creance;
  readonly fichiers: readonly File[];
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Televersement> => {
  const corps = new FormData();
  fichiers.forEach((fichier) => corps.append('files', fichier, fichier.name));
  const reponse = await demande(`${base ?? baseDeLaPasserelle()}/api/v1/attachments/upload`, creance, recuperer, {
    method: 'POST',
    body: corps,
  });
  if (reponse === null) return { genre: 'refus', message: REFUS_TELEVERSEMENT, statut: null };

  const enveloppe = objet(await reponse.json().catch(() => null));
  const pieces = objet(enveloppe?.data)?.attachments;
  const identifiants = (Array.isArray(pieces) ? pieces : [])
    .map((candidat) => chaine(objet(candidat)?.id))
    .filter((id): id is string => id !== null);
  if (enveloppe?.success === true && identifiants.length > 0) return { genre: 'televerse', identifiants };

  return {
    genre: 'refus',
    message: chaine(objet(enveloppe?.error)?.message) ?? chaine(enveloppe?.message) ?? REFUS_TELEVERSEMENT,
    statut: reponse.status,
  };
};

