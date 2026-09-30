import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import {
  rankingBranchOf,
  rankingRequestQuery,
  type RankingBranch,
  type RankingCriterionCode,
  type RankingEntityType,
  type RankingPeriod,
  type RankingState,
} from '@/lib/admin/ranking-state';

import { asCount, asRecord, type AdminDeps } from './admin';
import type { ApiResult } from './http';

/**
 * **LE CLASSEMENT** (#8876, #6730) — `GET /admin/ranking`, décodé CHAMP PAR CHAMP :
 * ne traverse ce module que ce que l'écran affiche.
 *
 * Ce qui est volontairement JETÉ, et le témoin le tient :
 * - le **texte d'un message** (`content`, `contentPreview`) : la passerelle ne le
 *   sert plus (#6919), et un décodeur qui le garderait le remettrait dans le cache ;
 * - l'**identifiant et le `linkId`** d'un lien de partage, qui OUVRENT la
 *   conversation ; le **jeton** et l'**adresse complète** d'un lien de suivi (seul
 *   l'hôte de destination est gardé — l'adresse peut porter un secret de requête) ;
 * - l'**identifiant** d'une conversation, qui sert de repli au titre côté serveur.
 *
 * **Deux replis SERVEUR sont défaits ici**, parce qu'un repli qui se fait passer pour
 * une donnée est un faux nom : le nom d'utilisateur `Unknown` (le compte n'existe
 * plus — la ligne ne mène alors à aucune fiche) et le titre `Sans titre` ou
 * l'identifiant de la conversation (elle n'a pas de titre). Ils deviennent `null` ;
 * la bibliothèque d'interprétation dit l'absence dans la langue du lecteur.
 *
 * Clé sous le préfixe `admin` : jamais persistée sur le disque (#8876).
 */
export const ADMIN_RANKING_QUERY_KEY = ['admin', 'ranking'] as const;

export const adminRankingQueryKey = (state: RankingState) =>
  [...ADMIN_RANKING_QUERY_KEY, state.entityType, state.criterion, state.period, state.limit] as const;

export type AdminRankingPerson = {
  readonly id: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type AdminRankingConversation = {
  readonly id: string;
  readonly title: string | null;
  readonly type: string | null;
};

export type AdminRankingUserRow = {
  readonly kind: 'users';
  readonly id: string;
  /** `null` : le compte n'existe plus — l'identifiant servi n'ouvre aucune fiche. */
  readonly account: { readonly username: string | null; readonly displayName: string | null; readonly avatar: string | null } | null;
  readonly count: number;
  readonly lastActivity: string | null;
};

export type AdminRankingConversationRow = {
  readonly kind: 'conversations';
  readonly id: string;
  readonly title: string | null;
  readonly type: string | null;
  readonly avatar: string | null;
  readonly count: number;
  readonly lastActivity: string | null;
};

export type AdminRankingMessageRow = {
  readonly kind: 'messages';
  readonly id: string;
  readonly messageType: string | null;
  readonly createdAt: string | null;
  /** `userId` est `null` pour un invité d'un lien de partage : il n'a pas de compte. */
  readonly sender: {
    readonly userId: string | null;
    readonly displayName: string | null;
    readonly username: string | null;
    readonly avatar: string | null;
  } | null;
  readonly conversation: AdminRankingConversation | null;
  readonly count: number;
};

export type AdminRankingTrackingLinkRow = {
  readonly kind: 'trackingLinks';
  readonly id: string;
  /** L'hôte de destination — la seule désignation que la passerelle sert (ni nom ni campagne). */
  readonly host: string | null;
  readonly createdAt: string | null;
  readonly creator: AdminRankingPerson | null;
  readonly count: number;
};

export type AdminRankingShareLinkRow = {
  readonly kind: 'shareLinks';
  readonly id: string;
  readonly name: string | null;
  readonly createdAt: string | null;
  readonly creator: AdminRankingPerson | null;
  readonly conversation: AdminRankingConversation | null;
  readonly count: number;
};

export type AdminRankingRow =
  | AdminRankingUserRow
  | AdminRankingConversationRow
  | AdminRankingMessageRow
  | AdminRankingTrackingLinkRow
  | AdminRankingShareLinkRow;

export type AdminRankingResult = {
  readonly entityType: RankingEntityType;
  readonly criterion: RankingCriterionCode;
  readonly period: RankingPeriod;
  readonly rows: readonly AdminRankingRow[];
};

const UNRESOLVED_USERNAME = 'Unknown';
const UNTITLED = 'Sans titre';

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

function decodePerson(raw: unknown): AdminRankingPerson | null {
  const person = asRecord(raw);
  const id = textOrNull(person?.id);
  if (person === null || id === null) return null;
  return { id, username: textOrNull(person.username), displayName: textOrNull(person.displayName), avatar: textOrNull(person.avatar) };
}

function decodeConversation(raw: unknown): AdminRankingConversation | null {
  const conversation = asRecord(raw);
  const id = textOrNull(conversation?.id);
  if (conversation === null || id === null) return null;
  return { id, title: namedTitle(conversation.title, conversation.identifier), type: textOrNull(conversation.type) };
}

/** Le titre, sauf le repli SERVEUR : `title || identifier || 'Sans titre'` — un identifiant n'est pas un titre. */
function namedTitle(title: unknown, identifier: unknown): string | null {
  const named = textOrNull(title);
  return named === null || named === UNTITLED || named === textOrNull(identifier) ? null : named;
}

function hostOf(url: unknown): string | null {
  const raw = textOrNull(url);
  if (raw === null) return null;
  try {
    return new URL(raw).hostname || null;
  } catch {
    return null;
  }
}

function decodeUserRow(raw: Readonly<Record<string, unknown>>, id: string): AdminRankingUserRow {
  const username = textOrNull(raw.username);
  const displayName = textOrNull(raw.displayName);
  const resolved = username !== UNRESOLVED_USERNAME && (username !== null || displayName !== null);
  return {
    kind: 'users',
    id,
    account: resolved ? { username, displayName, avatar: textOrNull(raw.avatar) } : null,
    count: asCount(raw.count),
    lastActivity: textOrNull(raw.lastActivity),
  };
}

function decodeMessageRow(raw: Readonly<Record<string, unknown>>, id: string): AdminRankingMessageRow {
  const sender = asRecord(raw.sender);
  return {
    kind: 'messages',
    id,
    messageType: textOrNull(raw.messageType),
    createdAt: textOrNull(raw.createdAt),
    sender:
      sender === null
        ? null
        : {
            userId: textOrNull(sender.userId),
            displayName: textOrNull(sender.displayName),
            username: textOrNull(sender.username),
            avatar: textOrNull(sender.avatar),
          },
    conversation: decodeConversation(raw.conversation),
    count: asCount(raw.count),
  };
}

const DECODERS: Readonly<Record<RankingBranch, (raw: Readonly<Record<string, unknown>>, id: string) => AdminRankingRow>> = {
  users: decodeUserRow,
  conversations: (raw, id) => ({
    kind: 'conversations',
    id,
    title: namedTitle(raw.title, raw.identifier),
    type: textOrNull(raw.type),
    avatar: textOrNull(raw.image),
    count: asCount(raw.count),
    lastActivity: textOrNull(raw.lastActivity),
  }),
  messages: decodeMessageRow,
  trackingLinks: (raw, id) => ({
    kind: 'trackingLinks',
    id,
    host: hostOf(raw.originalUrl),
    createdAt: textOrNull(raw.createdAt),
    creator: decodePerson(raw.creator),
    count: asCount(raw.count),
  }),
  shareLinks: (raw, id) => ({
    kind: 'shareLinks',
    id,
    name: textOrNull(raw.name),
    createdAt: textOrNull(raw.createdAt),
    creator: decodePerson(raw.creator),
    conversation: decodeConversation(raw.conversation),
    count: asCount(raw.count),
  }),
};

/** Une ligne sans identifiant est ÉCARTÉE, jamais « réparée » : un décodeur qui inventerait un nom afficherait quelqu'un qui n'existe pas. */
export function decodeAdminRanking(raw: unknown, request: Pick<RankingState, 'entityType' | 'criterion' | 'period'>): AdminRankingResult {
  const payload = asRecord(raw);
  const served = Array.isArray(payload?.rankings) ? payload.rankings : [];
  const decode = DECODERS[rankingBranchOf(request.entityType, request.criterion)];
  const rows = served.flatMap((entry): readonly AdminRankingRow[] => {
    const row = asRecord(entry);
    const id = textOrNull(row?.id);
    return row === null || id === null ? [] : [decode(row, id)];
  });
  return { entityType: request.entityType, criterion: request.criterion, period: request.period, rows };
}

export async function loadAdminRanking(
  params: AdminDeps & { readonly state: RankingState; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminRankingResult>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.ranking}?${rankingRequestQuery(params.state).toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminRanking(result.data, params.state) };
}
