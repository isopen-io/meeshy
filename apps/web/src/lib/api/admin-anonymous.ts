import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import { unwrap } from './client';
import type { ApiResult } from './http';

/**
 * **LES ANONYMES** (#7873, #8876) — les participants entrés par un lien sans compte.
 *
 * - `GET admin.anonymousUsers` — la liste, pagination DANS `data`
 *   (`{ anonymousUsers, pagination }`), comme la liste des comptes.
 * - `GET admin.anonymousUsersByParticipantId` — la fiche.
 *
 * Gardées par `canViewUsers` côté passerelle ; la présence (`isOnline`,
 * `lastActiveAt`) y est déjà masquée pour qui n'a pas `canViewPresence`.
 *
 * Ce décodeur ne garde que ce que l'écran montre, champ par champ : la
 * passerelle a déjà servi, par le passé, le hash de session d'un anonyme et
 * son empreinte d'appareil (#4157). Un `...spread` les recopierait le jour où
 * ils reviendraient. **Aucun libellé fabriqué** : un nom absent reste vide
 * (`guestLabel` dit « Invité sans nom »), et le lien d'arrivée ne garde NI son
 * identifiant public NI ses clés de jointure — son nom, son état, son échéance.
 */
export type AdminAnonymousConversation = {
  readonly id: string;
  /** Le titre servi, vide quand la conversation n'en a pas — `conversationLabel` dit le repli. */
  readonly title: string;
  /** Le type, servi par la FICHE seulement (la liste ne le sert pas) — vide sinon. */
  readonly type: string;
};

export type AdminAnonymousRow = {
  readonly id: string;
  readonly displayName: string;
  readonly avatar: string;
  readonly language: string;
  readonly isActive: boolean;
  readonly isOnline: boolean;
  readonly lastActiveAt: string | null;
  readonly joinedAt: string | null;
  readonly leftAt: string | null;
  readonly conversation: AdminAnonymousConversation | null;
  readonly messageCount: number;
};

export type AdminAnonymousPage = {
  readonly rows: readonly AdminAnonymousRow[];
  readonly total: number;
  readonly hasMore: boolean;
};

export type AdminAnonymousOne = AdminAnonymousRow & {
  readonly permissions: readonly { readonly key: string; readonly granted: boolean }[];
  /** Le lien par lequel il est entré — son nom, son état et son échéance, jamais ses clés de jointure. */
  readonly shareLink: { readonly id: string; readonly name: string; readonly isActive: boolean; readonly expiresAt: string | null } | null;
};

const dateOuNull = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null);

export function decodeAdminAnonymousRow(brut: unknown): AdminAnonymousRow | null {
  const ligne = asRecord(brut);
  if (ligne === null || typeof ligne.id !== 'string') return null;
  const conversation = asRecord(ligne.conversation);
  const compte = asRecord(ligne._count);
  return {
    id: ligne.id,
    displayName: asText(ligne.displayName).trim(),
    avatar: asText(ligne.avatar),
    language: asText(ligne.language),
    isActive: ligne.isActive !== false,
    isOnline: ligne.isOnline === true,
    lastActiveAt: dateOuNull(ligne.lastActiveAt),
    joinedAt: dateOuNull(ligne.joinedAt),
    leftAt: dateOuNull(ligne.leftAt),
    conversation:
      conversation === null || typeof conversation.id !== 'string'
        ? null
        : { id: conversation.id, title: asText(conversation.title), type: asText(conversation.type) },
    messageCount: asCount(compte?.sentMessages),
  };
}

export function decodeAdminAnonymousPage(raw: unknown, offset: number): AdminAnonymousPage {
  const page = adminPageOf({ ok: true, data: raw }, decodeAdminAnonymousRow, { kind: 'nested', key: 'anonymousUsers' });
  if (!page.ok) return { rows: [], total: 0, hasMore: false };
  const hasMore = page.data.hasMore;
  return { rows: page.data.rows, total: page.data.total, hasMore: typeof asRecord(asRecord(raw)?.pagination)?.hasMore === 'boolean' ? hasMore : offset + page.data.rows.length < page.data.total };
}

export function decodeAdminAnonymousOne(raw: unknown): AdminAnonymousOne | null {
  const charge = asRecord(raw) ?? {};
  const source = charge.participant ?? charge.anonymousUser ?? raw;
  const ligne = decodeAdminAnonymousRow(source);
  if (ligne === null) return null;
  const permissions = Object.entries(asRecord(asRecord(source)?.permissions) ?? {})
    .filter((entree): entree is [string, boolean] => typeof entree[1] === 'boolean')
    .map(([key, granted]) => ({ key, granted }));
  const lien = asRecord(asRecord(source)?.shareLink);
  const shareLink =
    lien === null || typeof lien.id !== 'string'
      ? null
      : { id: lien.id, name: asText(lien.name).trim(), isActive: lien.isActive !== false, expiresAt: dateOuNull(lien.expiresAt) };
  return { ...ligne, permissions, shareLink };
}

export const adminAnonymousQueryKey = (adresse: string) => ['admin', 'anonymous', adresse] as const;
export const adminAnonymousOneQueryKey = (participantId: string) => ['admin', 'anonymous-one', participantId] as const;

export async function loadAdminAnonymous(
  params: AdminDeps & {
    readonly offset: number;
    readonly limit: number;
    readonly search: string;
    readonly sortBy: string;
    readonly sortOrder: 'asc' | 'desc';
    readonly filters: Readonly<Record<string, string>>;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminAnonymousPage>> {
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(params.limit),
    ...(params.search.trim() === '' ? {} : { search: params.search.trim() }),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    ...params.filters,
  });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.anonymousUsers}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminAnonymousPage(result.data, params.offset) };
}

/** La même lecture, sous la forme commune des listes d'administration que `useAdminList` consomme. */
export async function loadAdminAnonymousListPage(params: Parameters<typeof loadAdminAnonymous>[0]): Promise<ApiResult<AdminPage<AdminAnonymousRow>>> {
  const result = await loadAdminAnonymous(params);
  if (!result.ok) return result;
  return { ok: true, data: { rows: result.data.rows, total: result.data.total, hasMore: result.data.hasMore } };
}

export async function loadAdminAnonymousOne(
  params: AdminDeps & { readonly participantId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminAnonymousOne | null>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.anonymousUsersByParticipantId(params.participantId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminAnonymousOne(result.data) };
}

/**
 * La requête de la FICHE d'un anonyme — `unwrap` garde le STATUT du refus (un 403 se
 * dit comme un refus, un 404 comme un participant introuvable, jamais les deux comme
 * « une panne »). Une charge illisible (aucun identifiant) n'invente pas de fiche : elle
 * échoue. `retry: false` : rejouer un refus ne le fait pas céder.
 */
export function adminAnonymousOneQueryOptions(deps: AdminDeps, participantId: string) {
  return {
    queryKey: adminAnonymousOneQueryKey(participantId),
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }): Promise<AdminAnonymousOne> => {
      const fiche = unwrap(await loadAdminAnonymousOne({ ...deps, participantId, ...(signal === undefined ? {} : { signal }) }));
      if (fiche === null) throw new Error('Fiche d’anonyme illisible');
      return fiche;
    },
    staleTime: 30_000,
    retry: false,
  };
}
