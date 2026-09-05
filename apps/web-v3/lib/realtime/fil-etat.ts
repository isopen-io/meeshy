import { buildTranslationRecord, resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';

import { citationDeReponse, citationsDeLaPage } from '@/lib/api/citations';
import { message, MENTIONS_RETENUES, type Accuse, type Lieu, type Message } from '@/lib/api/fil';

/**
 * L'ÉTAT D'UN FIL OUVERT, et les transitions que le temps réel lui fait subir
 * — PURES, sans DOM, sans socket : ce que Jest gage sans navigateur, et ce que
 * le module de participation se contente de PEINDRE (conception § 12.4).
 *
 * Chaque transition répond à UNE charge de la passerelle, lue dans son
 * émetteur :
 *
 *   • `message:new` (`socketio/messageNewPayload.ts:126-176`) — la même forme
 *     que la liste REST pour tout ce qui est lu ici, d'où `message()` de
 *     `lib/api/fil.ts`, jamais un second mappeur ;
 *   • `message:translation` (`socketio/buildTranslationEvent.ts:70-97`) —
 *     `{ messageId, translations: [{ targetLanguage, translatedContent, … }] }`,
 *     que `buildTranslationRecord` (site partagé) dépouille en carte, avant que
 *     `resolvePrismTranslation` — LA descente, jamais réécrite — élise le rang ;
 *   • `message:edited` (`socketio/messageEditedPayload.ts`) — un
 *     `SocketIOMessage` dont le contenu a changé ;
 *   • `message:deleted` (`MessageHandler.ts:1186-1190`) — `{ messageId,
 *     conversationId }` ;
 *   • `reaction:added` / `reaction:removed` (`ReactionUpdateEvent`,
 *     `packages/shared/types/reaction.ts:76-98`) — `emoji`, `action` et
 *     l'agrégat ABSOLU `aggregation.count` ;
 *   • `typing:start` / `typing:stop` (`StatusHandler.ts:276-292`, `:380-404`) —
 *     `{ userId, username, displayName?, conversationId, isTyping }` ;
 *   • `read-status:updated` (`ReadStatusUpdatedEventData`) — `type: 'read' |
 *     'received'` et `updatedAt`, la FRONTIÈRE de lecture d'un pair : tout ce
 *     que j'ai écrit avant est reçu, ou lu ;
 *   • `user:status` (`MeeshySocketIOManager.ts:2869`) — `{ userId, username,
 *     isOnline, lastActiveAt }`, poussé aux rooms des AMIS acceptés et des
 *     administrateurs (`presence-audience.ts`, directive 2026-08-25), et
 *     `presence:snapshot` (`:1435`) — `{ users: [{ userId, isOnline, … }] }` à
 *     l'authentification : le compte « N en ligne » ne bouge que pour un
 *     participant que le document a NOMMÉ, et recevoir la charge est la preuve
 *     que la passerelle sert cette présence au lecteur — rien ne se fabrique.
 *
 * L'ORDRE est celui de l'ÉCRITURE (`ecritA`), stable : une bulle optimiste
 * porte l'instant où le lecteur a envoyé, et la charge serveur qui la CONFIRME
 * la remplace à sa place — jamais un saut.
 */

export type EtatDEnvoi = 'servi' | 'en-attente' | 'hors-ligne' | 'en-echec';

export type Bulle = Message & {
  readonly envoi: EtatDEnvoi;
  /** La raison d'un échec, VISIBLE — jamais un envoi perdu en silence (§ 7). */
  readonly raison: string | null;
};

export type Frappeur = { readonly id: string; readonly nom: string };

export type EtatDuFil = {
  readonly bulles: readonly Bulle[];
  readonly frappeurs: readonly Frappeur[];
  /** Les participants que la passerelle SERT en ligne — les clés que `user:status` nomme. */
  readonly presents: readonly string[];
};

export const ETAT_VIDE: EtatDuFil = { bulles: [], frappeurs: [], presents: [] };

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

const instantDe = (bulle: Bulle): number => (bulle.ecritA === null ? 0 : Date.parse(bulle.ecritA));

const triee = (bulles: readonly Bulle[]): readonly Bulle[] =>
  [...bulles].sort((a, b) => instantDe(a) - instantDe(b));

/**
 * CE QUE LE FIL SE CITE À LUI-MÊME — la même règle que la tranche servie
 * (`citationsDeLaPage`, `lib/api/citations.ts`), appliquée à l'état vivant.
 * Sans elle, une réponse ARRIVÉE en direct citerait l'original d'un message
 * dont la bulle, deux lignes plus haut, affiche sa traduction — et une réponse
 * à un message protégé n'aurait pas le même aperçu selon qu'elle a été peinte
 * ou rechargée. Elle repasse à chaque transition qui change un TEXTE, une
 * PROTECTION ou la composition du fil : la citation suit sa cible.
 */
const citantes = (bulles: readonly Bulle[]): readonly Bulle[] =>
  citationsDeLaPage({ messages: bulles, mentions: MENTIONS_RETENUES });

export const bulleServie = (m: Message): Bulle => ({ ...m, envoi: 'servi', raison: null });

/**
 * La bulle qu'on peint AVANT que le réseau réponde (Instant App Principles —
 * « chaque action reçoit un retour instantané »). Elle porte l'identifiant
 * client comme identité : c'est lui que l'accusé ou le `message:new` de
 * l'expéditeur rapportera.
 */
export const bulleOptimiste = ({
  clientMessageId,
  texte,
  auteur,
  auteurId,
  langue,
  horsLigne,
  maintenant,
  reponseA,
  lieu,
}: {
  readonly clientMessageId: string;
  readonly texte: string;
  readonly auteur: string;
  readonly auteurId: string | null;
  readonly langue: string;
  readonly horsLigne: boolean;
  readonly maintenant: number;
  /**
   * LA CITATION D'UNE RÉPONSE EN COURS (issue #5163) — le squelette posé par
   * `citationDeReponse` (`lib/api/citations.ts`), résolu contre la tranche
   * PAR `citantes` juste dessous : la bulle optimiste porte sa citation AVANT
   * l'accusé, et son aperçu est le texte que le lecteur LIT déjà, jamais une
   * seconde descente du Prisme.
   */
  readonly reponseA?: { readonly cible: string; readonly source: string };
  /** UN LIEU PARTAGÉ EN COURS D'ENVOI (#5061) — posé AVANT l'accusé, comme la citation d'une réponse ci-dessus. */
  readonly lieu?: Lieu;
}): Bulle => ({
  id: clientMessageId,
  clientMessageId,
  auteur,
  auteurId,
  anonyme: false,
  deMoi: true,
  systeme: false,
  texte,
  texteOriginal: texte,
  langueServie: null,
  langueOriginale: langue,
  traductions: {},
  ecritA: new Date(maintenant).toISOString(),
  protege: false,
  edite: false,
  supprime: false,
  pieces: [],
  lieu: lieu ?? null,
  citations: reponseA === undefined ? [] : [citationDeReponse(reponseA)],
  reactions: [],
  accuse: 'envoye',
  envoi: horsLigne ? 'hors-ligne' : 'en-attente',
  raison: null,
});

const memeBulle = (a: Bulle, b: Bulle): boolean =>
  a.id === b.id || (a.clientMessageId !== null && a.clientMessageId === b.clientMessageId);

/**
 * Insérer, c'est aussi DÉDOUBLONNER : le `message:new` de l'expéditeur porte
 * le `clientMessageId` de sa bulle optimiste (`messageNewPayload.ts`, « voyage
 * jusqu'aux appareils de l'EXPÉDITEUR, et à eux seuls »), et un rattrapage par
 * `/sync` peut rendre un message déjà peint : dans les deux cas la charge
 * serveur REMPLACE, elle ne s'ajoute pas.
 */
export const insere = (etat: EtatDuFil, bulle: Bulle): EtatDuFil => {
  const existante = etat.bulles.find((candidate) => memeBulle(candidate, bulle));
  if (existante === undefined) return { ...etat, bulles: citantes(triee([...etat.bulles, bulle])) };

  const fusion: Bulle = {
    ...bulle,
    // Une bulle servie garde SON instant : l'horloge du serveur range le fil.
    ecritA: bulle.envoi === 'servi' ? bulle.ecritA : existante.ecritA,
  };
  return { ...etat, bulles: citantes(triee(etat.bulles.map((candidate) => (candidate === existante ? fusion : candidate)))) };
};

export const depuisLaCharge = (
  brut: Readonly<Record<string, unknown>>,
  moi: string | null,
  langues: readonly string[],
  origine: string,
): Bulle | null => {
  const servi = message(brut, moi, langues, origine);
  return servi === null ? null : bulleServie(servi);
};

/**
 * L'accusé du transport (`message:send` ⇒ `{ success, data: { messageId } }`,
 * `POST /messages` ⇒ `{ data: { id } }`) — sans charge, juste l'identité.
 *
 * Si la bulle SERVIE porte déjà cet `id`, c'est que son `message:new` a
 * devancé l'accusé SANS `clientMessageId` — le cas d'un envoi par la route
 * depuis une place ANONYME : la passerelle n'adresse la charge avec l'identité
 * client qu'à la room du COMPTE de l'expéditeur (`MeeshySocketIOManager.ts:
 * 3042-3056`), qu'un invité n'a pas. La bulle optimiste s'efface alors devant
 * celle qui est servie ; elle ne se dédouble pas.
 */
export const confirme = (etat: EtatDuFil, clientMessageId: string, id: string | null): EtatDuFil => {
  const servie = id === null ? undefined : etat.bulles.find((bulle) => bulle.id === id && bulle.clientMessageId !== clientMessageId);
  if (servie !== undefined) return { ...etat, bulles: etat.bulles.filter((bulle) => bulle.clientMessageId !== clientMessageId) };
  return {
    ...etat,
    bulles: etat.bulles.map((bulle) =>
      bulle.clientMessageId === clientMessageId
        ? { ...bulle, id: id ?? bulle.id, envoi: 'servi', raison: null }
        : bulle,
    ),
  };
};

export const echoue = (etat: EtatDuFil, clientMessageId: string, raison: string): EtatDuFil => ({
  ...etat,
  bulles: etat.bulles.map((bulle) =>
    bulle.clientMessageId === clientMessageId ? { ...bulle, envoi: 'en-echec', raison } : bulle,
  ),
});

/** Le retour du réseau : ce qui attendait hors ligne repart, dans l'ordre d'écriture. */
export const aEnvoyer = (etat: EtatDuFil): readonly Bulle[] =>
  etat.bulles.filter((bulle) => bulle.envoi === 'hors-ligne');

export const enAttente = (etat: EtatDuFil, clientMessageId: string): EtatDuFil => ({
  ...etat,
  bulles: etat.bulles.map((bulle) =>
    bulle.clientMessageId === clientMessageId ? { ...bulle, envoi: 'en-attente', raison: null } : bulle,
  ),
});

/**
 * Une traduction qui ARRIVE redescend le prisme ORDONNÉ — jamais « la
 * traduction reçue remplace le texte » : si elle vise un rang inférieur à
 * celui déjà servi, elle ne change rien à l'écran (leçon 261).
 */
export const traduit = (
  etat: EtatDuFil,
  messageId: string,
  traductions: unknown,
  langues: readonly string[],
): EtatDuFil => ({
  ...etat,
  bulles: citantes(etat.bulles.map((bulle) => {
    if (bulle.id !== messageId || bulle.protege || bulle.supprime) return bulle;

    const carte = { ...bulle.traductions, ...buildTranslationRecord(traductions) };
    const servie = resolvePrismTranslation({
      translations: carte,
      originalLanguage: bulle.langueOriginale,
      preferredLanguages: langues,
    });

    return {
      ...bulle,
      traductions: carte,
      texte: servie?.text ?? bulle.texteOriginal,
      langueServie: servie?.language ?? null,
    };
  })),
});

export const edite = (
  etat: EtatDuFil,
  brut: Readonly<Record<string, unknown>>,
  moi: string | null,
  langues: readonly string[],
  origine: string,
): EtatDuFil => {
  const servi = message(brut, moi, langues, origine);
  if (servi === null) return etat;

  return {
    ...etat,
    bulles: citantes(
      etat.bulles.map((bulle) =>
        bulle.id === servi.id
          ? {
              ...bulle,
              texte: servi.texte,
              texteOriginal: servi.texteOriginal,
              traductions: servi.traductions,
              langueServie: servi.langueServie,
              langueOriginale: servi.langueOriginale,
              edite: true,
            }
          : bulle,
      ),
    ),
  };
};

/** `message:deleted` REÇU — d'autrui ou la confirmation de SON PROPRE retrait (`retireMoiMeme`) : les deux finissent `servi`. */
export const retire = (etat: EtatDuFil, messageId: string): EtatDuFil => ({
  ...etat,
  bulles: citantes(
    etat.bulles.map((bulle) =>
      bulle.id === messageId
        ? { ...bulle, supprime: true, texte: '', pieces: [], lieu: null, citations: [], reactions: [], envoi: 'servi' }
        : bulle,
    ),
  ),
});

/**
 * MODIFIER / RETIRER SA PROPRE BULLE — OPTIMISTE (issue #5163), le même
 * patron que l'envoi : peindre AVANT que le réseau réponde. Le contenu d'une
 * édition est l'ORIGINAL (`texteOriginal`) — jamais une traduction lue, la
 * passerelle n'édite que le contenu d'origine — et ses traductions sont
 * PÉRIMÉES (`translations: null` en base, § 2 de la spécification) : elles
 * reviendront par `message:translation`.
 */
export const modifieMoiMeme = (etat: EtatDuFil, id: string, texte: string): EtatDuFil => ({
  ...etat,
  bulles: citantes(
    etat.bulles.map((bulle) =>
      bulle.id === id
        ? { ...bulle, texte, texteOriginal: texte, langueServie: null, traductions: {}, edite: true, envoi: 'en-attente' }
        : bulle,
    ),
  ),
});

/**
 * Un retrait OPTIMISTE efface le contenu TOUT DE SUITE — la même chose
 * qu'un `retire()` reçu, sauf `envoi`, qui reste `en-attente` jusqu'à
 * l'accusé ou le `message:deleted` que la passerelle diffuse (même à
 * l'auteur du retrait, § 2).
 */
export const retireMoiMeme = (etat: EtatDuFil, id: string): EtatDuFil => ({
  ...etat,
  bulles: citantes(
    etat.bulles.map((bulle) =>
      bulle.id === id
        ? { ...bulle, supprime: true, texte: '', pieces: [], lieu: null, citations: [], reactions: [], envoi: 'en-attente' }
        : bulle,
    ),
  ),
});

/** L'accusé d'une mutation (`{ success: true }` de `message:edit`/`message:delete`, ou une réponse REST 200) : `en-attente` devient `servi`. */
export const confirmeLaMutation = (etat: EtatDuFil, id: string): EtatDuFil => ({
  ...etat,
  bulles: etat.bulles.map((bulle) => (bulle.id === id ? { ...bulle, envoi: 'servi' } : bulle)),
});

/**
 * UN REFUS RÉTABLIT LA BULLE D'AVANT, À L'IDENTIQUE — texte, pièces,
 * citations, réactions compris (snapshot → apply → rollback, Instant App
 * Principles). `avant` est la bulle telle qu'elle était juste AVANT le geste
 * optimiste — prise par l'appelant, jamais recalculée ici.
 */
export const retabli = (etat: EtatDuFil, avant: Bulle): EtatDuFil => ({
  ...etat,
  bulles: citantes(etat.bulles.map((bulle) => (bulle.id === avant.id ? avant : bulle))),
});

/**
 * L'agrégat est ABSOLU (`aggregation.count`) : on POSE le compte, on ne
 * l'incrémente pas. `mienne` dit si la pastille est celle du lecteur — appris
 * de l'événement (`userId === moi`, contrat de `ReactionUpdateEvent`), ou de
 * son propre geste ; `null` laisse l'état connu (une pastille servie par la
 * liste ne le dit pas, #4177).
 */
export const reagit = (
  etat: EtatDuFil,
  messageId: string,
  emoji: string,
  nombre: number,
  mienne: boolean | null = null,
): EtatDuFil => ({
  ...etat,
  bulles: etat.bulles.map((bulle) => {
    if (bulle.id !== messageId) return bulle;
    const connue = bulle.reactions.find((reaction) => reaction.emoji === emoji);
    const autres = bulle.reactions.filter((reaction) => reaction.emoji !== emoji);
    return {
      ...bulle,
      reactions: nombre > 0 ? [...autres, { emoji, nombre, mienne: mienne ?? connue?.mienne ?? false }] : autres,
    };
  }),
});

/**
 * MON geste, avant l'accusé : le compte bouge d'un, la pastille devient (ou
 * cesse d'être) la mienne. `reagit` avec l'agrégat serveur remettra le compte
 * exact ; un accusé négatif rejoue ce geste à l'envers.
 */
export const reagisMoiMeme = (etat: EtatDuFil, messageId: string, emoji: string, ajoute: boolean): EtatDuFil => {
  const bulle = etat.bulles.find((candidate) => candidate.id === messageId);
  const connue = bulle?.reactions.find((reaction) => reaction.emoji === emoji);
  const nombre = Math.max(0, (connue?.nombre ?? 0) + (ajoute ? 1 : -1));
  return reagit(etat, messageId, emoji, nombre, ajoute);
};

export const reactionDe = (
  charge: unknown,
  moi: string | null,
): { readonly messageId: string; readonly emoji: string; readonly nombre: number; readonly mienne: boolean | null } | null => {
  const brut = objet(charge);
  const messageId = chaine(brut?.messageId);
  const emoji = chaine(brut?.emoji);
  if (brut === null || messageId === null || emoji === null) return null;

  const agregat = objet(brut.aggregation);
  const compte = agregat?.count;
  const acteur = chaine(brut.userId) ?? chaine(brut.participantId);
  const action = brut.action === 'add' || brut.action === 'added' ? 'add' : brut.action === 'remove' || brut.action === 'removed' ? 'remove' : null;
  const mienne = moi !== null && acteur === moi && action !== null ? action === 'add' : null;
  return { messageId, emoji, nombre: typeof compte === 'number' ? compte : 0, mienne };
};

export const frappe = (etat: EtatDuFil, frappeur: Frappeur, actif: boolean): EtatDuFil => {
  const autres = etat.frappeurs.filter((candidat) => candidat.id !== frappeur.id);
  return { ...etat, frappeurs: actif ? [...autres, frappeur] : autres };
};

export const frappeurDe = (charge: unknown): Frappeur | null => {
  const brut = objet(charge);
  const id = chaine(brut?.userId);
  if (brut === null || id === null) return null;
  return { id, nom: chaine(brut.displayName) ?? chaine(brut.username) ?? 'Quelqu’un' };
};

/**
 * La frontière d'un PAIR : tout ce que j'ai écrit avant son instant est reçu
 * (ou lu). Un accusé ne recule jamais — « lu » ne redevient pas « reçu ».
 */
const RANG: Readonly<Record<Accuse, number>> = { envoye: 0, recu: 1, lu: 2 };

export const accuse = (etat: EtatDuFil, { type, jusquA }: { readonly type: 'read' | 'received'; readonly jusquA: number }): EtatDuFil => {
  const cible: Accuse = type === 'read' ? 'lu' : 'recu';
  return {
    ...etat,
    bulles: etat.bulles.map((bulle) =>
      bulle.deMoi && bulle.envoi === 'servi' && instantDe(bulle) <= jusquA && RANG[bulle.accuse] < RANG[cible]
        ? { ...bulle, accuse: cible }
        : bulle,
    ),
  };
};

export type Presence = { readonly id: string; readonly enLigne: boolean };

/** `user:status` — `userId` est la clé de présence (`User.id`, ou `Participant.id` d'un anonyme) ; sans elle, rien à dire. */
export const presenceDe = (charge: unknown): Presence | null => {
  const brut = objet(charge);
  const id = chaine(brut?.userId);
  return brut === null || id === null ? null : { id, enLigne: brut.isOnline === true };
};

/** `presence:snapshot` — `users`, chacun lu comme une transition. */
export const presencesDe = (charge: unknown): readonly Presence[] =>
  (Array.isArray(objet(charge)?.users) ? (objet(charge)?.users as readonly unknown[]) : [])
    .map((utilisateur) => presenceDe(utilisateur))
    .filter((transition): transition is Presence => transition !== null);

/**
 * Une transition ne compte que pour un participant NOMMÉ par le document : un
 * inconnu ne fabrique rien (directive 2026-08-25 — le client ne fabrique
 * aucune présence), et un départ retire. Sans doublon, et sans rien changer
 * d'autre de l'état.
 */
export const presence = (etat: EtatDuFil, participants: readonly string[], transition: Presence): EtatDuFil => {
  if (!participants.includes(transition.id)) return etat;
  const autres = etat.presents.filter((id) => id !== transition.id);
  return { ...etat, presents: transition.enLigne ? [...autres, transition.id] : autres };
};

/** Le dernier instant SERVI — le `since` d'un rattrapage par `/sync`. */
export const dernierInstantServi = (etat: EtatDuFil): string | null =>
  etat.bulles
    .filter((bulle) => bulle.envoi === 'servi' && bulle.ecritA !== null)
    .map((bulle) => bulle.ecritA as string)
    .reduce<string | null>((dernier, ecritA) => (dernier === null || ecritA > dernier ? ecritA : dernier), null);
