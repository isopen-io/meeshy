import { type AdminDeps, asCount, asRecord, asText } from './admin';
import type { ApiResult } from './http';

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
 */
export const ADMIN_SOUVERAIN_PREFIXE = 'admin-souverain' as const;

/** Le motif écrit est refusé par le SCHÉMA de la route sous dix caractères. */
export const MOTIF_LONGUEUR_MINIMALE = 10;

export const ADMIN_CONVERSATIONS_PAGE_SIZE = 20;
export const ADMIN_MESSAGES_PAGE_SIZE = 30;

export const adminConversationsQueryKey = (offset: number, recherche: string, type: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'conversations', offset, recherche, type] as const;

export const adminConversationMessagesQueryKey = (conversationId: string, offset: number) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'messages', conversationId, offset] as const;

/** `true` si cette clé porte une lecture souveraine — donc à ne PAS persister. */
export function estClefSouveraine(key: readonly unknown[]): boolean {
  return key[0] === ADMIN_SOUVERAIN_PREFIXE;
}

const asTextOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const asNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

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

export type AdminSovereignAttachment = {
  readonly id: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly width: number | null;
  readonly height: number | null;
  /** Secondes — la durée d'un vocal, que l'administration constate sans l'écouter. */
  readonly duration: number | null;
  /** `null` quand la pièce est protégée — jamais une URL à essayer quand même. */
  readonly fileUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly isProtected: boolean;
};

export type AdminSovereignSender = {
  readonly userId: string | null;
  readonly displayName: string;
  readonly avatar: string | null;
};

export type AdminSovereignMessage = {
  readonly id: string;
  /**
   * `null` quand le message est protégé — vue unique, flou, expiration
   * consommée ou chiffrement. Ce n'est NI un message vide NI une erreur de
   * chargement : `isProtected` dit pourquoi, et l'écran doit le dire aussi.
   */
  readonly content: string | null;
  readonly originalLanguage: string | null;
  readonly messageType: string | null;
  readonly isEdited: boolean;
  readonly createdAt: string | null;
  readonly sender: AdminSovereignSender | null;
  /** Le compte de TOUTES les pièces, que la liste servie soit complète ou non. */
  readonly attachmentCount: number;
  readonly isProtected: boolean;
  readonly attachments: readonly AdminSovereignAttachment[];
};

export type AdminSovereignMessagePage = {
  readonly messages: readonly AdminSovereignMessage[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

function decodeAttachment(raw: unknown): AdminSovereignAttachment | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

  return {
    id: ligne.id,
    originalName: asText(ligne.originalName),
    mimeType: asText(ligne.mimeType),
    fileSize: asCount(ligne.fileSize),
    width: asNumberOrNull(ligne.width),
    height: asNumberOrNull(ligne.height),
    duration: asNumberOrNull(ligne.duration),
    fileUrl: asTextOrNull(ligne.fileUrl),
    thumbnailUrl: asTextOrNull(ligne.thumbnailUrl),
    // Fail-closed : une charge qui ne dit pas qu'une pièce est protégée ne dit
    // pas non plus qu'elle est libre. Les URL sont déjà nulles côté serveur
    // quand cela compte, mais l'écran s'appuie sur ce drapeau pour EXPLIQUER
    // l'absence — et une explication manquante vaut mieux qu'une fausse.
    isProtected: ligne.isProtected === true,
  };
}

function decodeSender(raw: unknown): AdminSovereignSender | null {
  const ligne = asRecord(raw);
  if (ligne === null) return null;

  const compte = asRecord(ligne.user);
  return {
    userId: asTextOrNull(ligne.userId),
    // Le nom du PARTICIPANT d'abord (il porte le surnom propre à la
    // conversation), le compte en repli — même ordre que le fil.
    displayName: asText(ligne.displayName) || asText(compte?.displayName) || asText(compte?.username),
    avatar: asTextOrNull(ligne.avatar) ?? asTextOrNull(compte?.avatar),
  };
}

export function decodeAdminSovereignMessages(raw: unknown, offset: number): AdminSovereignMessagePage {
  const charge = asRecord(raw) ?? {};
  const brut = Array.isArray(charge.data) ? charge.data : Array.isArray(raw) ? raw : [];

  const messages = brut
    .map((entree): AdminSovereignMessage | null => {
      const ligne = asRecord(entree);
      if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

      return {
        id: ligne.id,
        content: asTextOrNull(ligne.content),
        originalLanguage: asTextOrNull(ligne.originalLanguage),
        messageType: asTextOrNull(ligne.messageType),
        isEdited: ligne.isEdited === true,
        createdAt: asTextOrNull(ligne.createdAt),
        sender: decodeSender(ligne.sender),
        attachmentCount: asCount(ligne.attachmentCount),
        isProtected: ligne.isProtected === true,
        attachments: (Array.isArray(ligne.attachments) ? ligne.attachments : [])
          .map(decodeAttachment)
          .filter((p): p is AdminSovereignAttachment => p !== null),
      };
    })
    .filter((message): message is AdminSovereignMessage => message !== null);

  const meta = asRecord(charge.pagination) ?? {};
  const total = asCount(meta.total);
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + messages.length < total;

  return { messages, total: total || messages.length, offset, hasMore };
}

export async function loadAdminSovereignMessages(
  params: AdminDeps & {
    readonly conversationId: string;
    readonly offset: number;
    /** Dix caractères au moins — la route refuse au SCHÉMA, avant son handler. */
    readonly reason: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminSovereignMessagePage>> {
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

  return { ok: true, data: decodeAdminSovereignMessages(result.data, params.offset) };
}
