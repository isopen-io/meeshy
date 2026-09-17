import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { decodeMessage } from './decode';
import type { ApiResult } from './http';
import type { Message } from './types';

/**
 * **LA LECTURE SOUVERAINE DES CONVERSATIONS** (#6862) — les décodeurs des deux
 * adresses que seul un BIGBOSS atteint :
 *
 * | adresse | ce qu'elle sert | motif écrit |
 * |---|---|---|
 * | `GET /admin/conversations` (#6861) | l'INVENTAIRE — métadonnées seules | non |
 * | `GET /admin/conversations/:id/messages` (#4333, #6860) | le CONTENU et ses pièces | **oui, ≥ 10 caractères** |
 *
 * ## CE QUE CE MODULE NE DOIT JAMAIS LAISSER PERSISTER
 *
 * Le cache de la v2 est écrit sur le DISQUE du navigateur : `query-client.ts`
 * déshydrate **toute requête réussie** (`shouldDehydrateQuery: (q) =>
 * q.state.status === 'success'`) vers `localStorage['meeshy.query-cache']`, et
 * un service worker garde par ailleurs les réponses HTTP dans `caches.open('api')`
 * **sept jours durant** (voir `purgeReaderCaches`).
 *
 * Sans exclusion, le contenu d'une conversation privée lue en régime souverain
 * survivrait donc à la session, sur le poste de l'administrateur — **une copie
 * qu'`AdminAuditLog` ne connaît pas et que personne ne révoque**. La trace dit
 * « il a lu », pas « il en garde une copie depuis six jours ».
 *
 * D'où {@link ADMIN_SOUVERAIN_PREFIXE} : toutes les clés de requête de ce
 * module en descendent, et c'est le SEUL prédicat que le filtre de
 * déshydratation ait à connaître. Une clé écrite à la main dans un écran
 * échapperait à l'exclusion sans que rien ne rougisse — la préfixer ici est ce
 * qui rend la garde possible en un seul point.
 *
 * ## Ce qui est DÉCODÉ, et ce qui est JETÉ
 *
 * `moderatorNotes`, identifiants de rapporteur et autres champs traçants ne
 * figurent pas dans ces types : le lot des membres a déjà tranché qu'un champ
 * non affiché ne doit pas entrer dans le cache. Ici la règle est plus stricte
 * encore, puisque le contenu lui-même ne doit pas y entrer.
 *
 * ## Les deux formes de pagination du dépôt
 *
 * Ces deux routes passent par `sendPaginatedSuccess` : la pagination voyage
 * **à côté** de `data`. `GET /admin/users` sert la sienne **dedans**. Lire au
 * mauvais niveau rendrait `total: 0` et `hasMore: false` — une liste qui
 * s'arrête à la première page **sans que rien n'échoue**.
 */

/**
 * Le préfixe COMMUN des clés de requête souveraines — le point d'accroche
 * unique de l'exclusion de persistance. Ne jamais composer une clé de ce
 * domaine sans passer par les fabriques ci-dessous.
 *
 * Il vit dans `souverain.ts`, un module SANS dépendance, et non ici : son
 * second appelant est `query-client.ts`, qui est dans le SOCLE de la première
 * peinture. Importer CE module depuis le socle y tirerait tous les décodeurs
 * d'administration et ferait dépasser le budget de poids — voir le
 * doc-comment de `souverain.ts`. Réexporté pour que les usagers n'aient qu'un
 * import à connaître.
 */
export { ADMIN_SOUVERAIN_PREFIXE, estClefSouveraine } from './souverain';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/** Le motif écrit est refusé par le SCHÉMA de la route sous dix caractères. */
export const MOTIF_LONGUEUR_MINIMALE = 10;

export const ADMIN_CONVERSATIONS_PAGE_SIZE = 20;
export const ADMIN_MESSAGES_PAGE_SIZE = 30;

export const adminConversationsQueryKey = (offset: number, recherche: string, type: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'conversations', offset, recherche, type] as const;

export const adminConversationMessagesQueryKey = (conversationId: string, offset: number) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'messages', conversationId, offset] as const;

const asTextOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

// ---------------------------------------------------------------------------
// L'INVENTAIRE — GET /admin/conversations
// ---------------------------------------------------------------------------

export type AdminInstanceParticipant = {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly role: string;
  readonly joinedAt: string | null;
};

export type AdminInstanceConversation = {
  readonly id: string;
  readonly identifier: string | null;
  /** `null` sur un direct, qui porte le nom de l'autre et non un titre stocké (D-75). */
  readonly title: string | null;
  readonly type: string;
  readonly isActive: boolean;
  /** Le compte des participants ACTIFS, recalculé par la passerelle — jamais la colonne morte. */
  readonly memberCount: number;
  readonly createdAt: string | null;
  readonly lastMessageAt: string | null;
  /** Six au plus, actifs, servis par la passerelle. */
  readonly participants: readonly AdminInstanceParticipant[];
};

export type AdminInstanceConversationPage = {
  readonly conversations: readonly AdminInstanceConversation[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

function decodeParticipant(raw: unknown): AdminInstanceParticipant | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.userId !== 'string' || ligne.userId === '') return null;

  return {
    userId: ligne.userId,
    displayName: asText(ligne.displayName),
    avatar: asTextOrNull(ligne.avatar),
    role: asText(ligne.role),
    joinedAt: asTextOrNull(ligne.joinedAt),
  };
}

export function decodeAdminInstanceConversations(raw: unknown, offset: number): AdminInstanceConversationPage {
  const charge = asRecord(raw) ?? {};
  const brut = Array.isArray(charge.data) ? charge.data : Array.isArray(raw) ? raw : [];

  const conversations = brut
    .map((entree): AdminInstanceConversation | null => {
      const ligne = asRecord(entree);
      if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

      return {
        id: ligne.id,
        identifier: asTextOrNull(ligne.identifier),
        title: asTextOrNull(ligne.title),
        type: asText(ligne.type),
        isActive: ligne.isActive !== false,
        memberCount: asCount(ligne.memberCount),
        createdAt: asTextOrNull(ligne.createdAt),
        lastMessageAt: asTextOrNull(ligne.lastMessageAt),
        participants: (Array.isArray(ligne.participants) ? ligne.participants : [])
          .map(decodeParticipant)
          .filter((p): p is AdminInstanceParticipant => p !== null),
      };
    })
    .filter((conversation): conversation is AdminInstanceConversation => conversation !== null);

  const meta = asRecord(charge.pagination) ?? {};
  const total = asCount(meta.total);
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + conversations.length < total;

  return { conversations, total: total || conversations.length, offset, hasMore };
}

export async function loadAdminInstanceConversations(
  params: AdminDeps & {
    readonly offset: number;
    readonly search?: string;
    readonly type?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminInstanceConversationPage>> {
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(ADMIN_CONVERSATIONS_PAGE_SIZE),
    // Un filtre VIDE n'est pas un filtre — la passerelle l'ignore, et
    // l'envoyer quand même ferait varier la clé de cache pour rien.
    ...(params.search === undefined || params.search === '' ? {} : { search: params.search }),
    ...(params.type === undefined || params.type === '' ? {} : { type: params.type }),
  });

  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/conversations?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminInstanceConversations(result.data, params.offset) };
}

// ---------------------------------------------------------------------------
// LE CONTENU — GET /admin/conversations/:id/messages
// ---------------------------------------------------------------------------

/**
 * **LE FIL SOUVERAIN, DANS LE TYPE PARTAGÉ** (#6862, lot C).
 *
 * Ce module portait une projection LOCALE — `AdminSovereignMessage`, dix
 * champs, ses propres décodeurs de pièce et d'expéditeur. Elle a vécu le temps
 * où la passerelle ne servait que dix champs ; elle en sert désormais
 * trente-six, et l'écran d'administration monte LA VRAIE VUE conversation du
 * produit (`routes/admin-conversation-reading.tsx`), qui ne connaît qu'un seul
 * vocabulaire : `Message` de `@meeshy/shared`.
 *
 * **Une projection réseau → modèle locale est interdite par décision écrite**
 * (`api/types.ts`) : « une projection ne coûte rien tant qu'elle reste juste, et
 * rien ne la tient juste ». La preuve en est faite ici même — la projection
 * réduite ne portait NI `replyTo`, NI `translations`, NI `isViewOnce`, donc
 * aucun Prisme et aucune protection ne pouvaient être rendus depuis elle, sans
 * qu'aucun témoin ne rougisse.
 *
 * Ce qui reste est une ADMISSION de ligne (l'identifiant et l'horloge, sans
 * lesquels `place()` ne sait pas ranger la rangée) puis `decodeMessage` — le
 * MÊME décodeur que le fil ordinaire, qui revit les dates et défait les `null`
 * de la passerelle.
 */

/**
 * LES TROIS CHAMPS QUE LA ROUTE SOUVERAINE NE SERT PAS, et ce qu'on en fait.
 *
 * `Message` les déclare REQUIS ; la lecture souveraine ne les charge pas.
 *
 * | champ | valeur posée | pourquoi ce n'est pas une fabrication |
 * |---|---|---|
 * | `timestamp` | `createdAt` | alias de compatibilité déclaré par le type lui-même (`conversation.ts` § COMPATIBILITE), posé à l'identique par `fixtures-base.ts`, `realtime-apply.ts` et `local-message.ts` |
 * | `deliveredCount` | `0` | le fil souverain ne porte AUCUN accusé de réception — `deliveryOf` rend alors `sent`, le PLANCHER vrai d'un message persisté, jamais « distribué » ni « lu », qu'on ne sait pas |
 * | `readCount` | `0` | idem |
 *
 * `content` est le quatrième cas, et il est d'une autre nature : la passerelle
 * le sert à `null` quand elle RETIENT le texte (vue unique, flou, expiration,
 * chiffrement) et pose `isProtected: true` à côté. Le type partagé déclare
 * `content: string`, et `decodeMessage` RETIRE les clés nulles — un `null`
 * traversant deviendrait `undefined`, c'est-à-dire un type menti. La chaîne
 * VIDE dit la vérité : il n'y a pas de texte ici. Ce qui dit POURQUOI voyage à
 * côté, dans `protectedIds` — voir {@link AdminSovereignThreadPage}.
 */
type AdminThreadRawMessage = Readonly<Record<string, unknown>>;

/**
 * La PAGE du fil souverain.
 *
 * `protectedIds` porte le verdict que la passerelle a rendu (`isProtected`) et
 * que le type partagé ne sait pas déclarer. Il ne se déduit PAS des colonnes de
 * protection côté client : `protectionOf` (`reading-mode/protection.ts`) ignore
 * le chiffrement, que `messageContentIsProtected` (passerelle) compte. Un
 * message chiffré ressortirait donc « standard » — une bulle vide au lieu
 * d'une mention. Le verdict SERVI est le seul qui couvre les quatre causes.
 */
export type AdminSovereignThreadPage = {
  /** ASCENDANT — l'ordre de `place()`, jamais le `createdAt DESC` de la route. */
  readonly messages: readonly Message[];
  /** Les messages dont la passerelle a RETENU le contenu — rien à révéler. */
  readonly protectedIds: ReadonlySet<string>;
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

/**
 * L'ADMISSION d'une ligne, puis le décodeur PARTAGÉ.
 *
 * Deux refus, et rien d'autre : sans identifiant il n'y a pas de rangée (`key`
 * React, ancre du menu, cible d'un saut de citation) ; sans horloge `place()`
 * ne sait ni grouper ni ouvrir un jour, et `toDate` rendrait une `Invalid Date`
 * qui se propagerait jusqu'au libellé du séparateur.
 */
function decodeThreadMessage(entree: unknown): Message | null {
  const ligne = asRecord(entree) as AdminThreadRawMessage | null;
  if (ligne === null) return null;
  if (typeof ligne.id !== 'string' || ligne.id === '') return null;
  if (typeof ligne.createdAt !== 'string' || ligne.createdAt === '') return null;

  const complete = {
    ...ligne,
    content: typeof ligne.content === 'string' ? ligne.content : '',
    translations: Array.isArray(ligne.translations) ? ligne.translations : [],
    deliveredCount: 0,
    readCount: 0,
    timestamp: ligne.createdAt,
  };

  /* Le SEUL cast du module, et il est à la frontière : la charge est
     `unknown`, le schéma de réponse de la route en est le contrat, et
     `decodeMessage` est fail-closed sur tout ce qu'il ne reconnaît pas (il
     RETIRE les `null` plutôt que de les recopier). Les quatre champs
     complétés ci-dessus sont exactement ceux que le type déclare requis et
     que la route ne sert pas — voir {@link AdminThreadRawMessage}. */
  return decodeMessage(complete as unknown as Message);
}

/**
 * DÉCODE ET RENVERSE. La route sert `createdAt DESC` (la page la plus récente
 * d'abord, comme toute pagination par offset) ; `place()` et `continues()`
 * supposent l'ASCENDANT — c'est l'ordre d'INDICE qui décide `head`/`tail`/
 * `opensDay`. `loadMessages` (`api/messages.ts`) renverse pour la même raison.
 */
export function decodeAdminSovereignThread(raw: unknown, offset: number): AdminSovereignThreadPage {
  const charge = asRecord(raw) ?? {};
  const brut = Array.isArray(charge.data) ? charge.data : Array.isArray(raw) ? raw : [];

  const protectedIds = new Set<string>();
  const messages = brut
    .map((entree): Message | null => {
      const message = decodeThreadMessage(entree);
      if (message === null) return null;
      if (asRecord(entree)?.isProtected === true) protectedIds.add(message.id);
      return message;
    })
    .filter((message): message is Message => message !== null)
    .reverse();

  const meta = asRecord(charge.pagination) ?? {};
  const total = asCount(meta.total);
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + messages.length < total;

  return { messages, protectedIds, total: total || messages.length, offset, hasMore };
}

export async function loadAdminSovereignThread(
  params: AdminDeps & {
    readonly conversationId: string;
    readonly offset: number;
    /** Dix caractères au moins — la route refuse au SCHÉMA, avant son handler. */
    readonly reason: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminSovereignThreadPage>> {
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(ADMIN_MESSAGES_PAGE_SIZE),
    reason: params.reason,
  });

  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/conversations/${encodeURIComponent(params.conversationId)}/messages?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminSovereignThread(result.data, params.offset) };
}
