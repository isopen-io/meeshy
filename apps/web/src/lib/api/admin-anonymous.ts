import { type AdminDeps, asCount, asRecord, asText } from './admin';
import type { ApiResult } from './http';

/**
 * **LES ANONYMES** (#7873) — les participants entrés par un lien sans compte.
 *
 * - `GET /api/v1/admin/anonymous-users` — la liste, pagination DANS `data`
 *   (`{ anonymousUsers, pagination }`), comme la liste des comptes.
 * - `GET /api/v1/admin/anonymous-users/:participantId` — la fiche.
 *
 * Gardées par `canViewUsers` côté passerelle ; la présence (`isOnline`,
 * `lastActiveAt`) y est déjà masquée pour qui n'a pas `canViewPresence`.
 *
 * Ce décodeur ne garde que ce que l'écran montre, champ par champ : la
 * passerelle a déjà servi, par le passé, le hash de session d'un anonyme et
 * son empreinte d'appareil (#4157). Un `...spread` les recopierait le jour où
 * ils reviendraient, et le cache des requêtes est persisté sur le disque.
 */
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
  readonly conversation: { readonly id: string; readonly title: string; readonly identifier: string } | null;
  readonly messageCount: number;
};

export type AdminAnonymousPage = {
  readonly rows: readonly AdminAnonymousRow[];
  readonly total: number;
  readonly hasMore: boolean;
};

export type AdminAnonymousOne = AdminAnonymousRow & {
  readonly permissions: readonly { readonly key: string; readonly granted: boolean }[];
  /** Le lien par lequel il est entré — son nom et son état, jamais ses clés de jointure. */
  readonly shareLink: { readonly name: string; readonly isActive: boolean } | null;
};

const dateOuNull = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null);

function decodeLigne(brut: unknown): AdminAnonymousRow | null {
  const ligne = asRecord(brut);
  if (ligne === null || typeof ligne.id !== 'string') return null;
  const conversation = asRecord(ligne.conversation);
  const compte = asRecord(ligne._count);
  return {
    id: ligne.id,
    displayName: asText(ligne.displayName) || '—',
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
        : { id: conversation.id, title: asText(conversation.title), identifier: asText(conversation.identifier) },
    messageCount: asCount(compte?.sentMessages),
  };
}

export function decodeAdminAnonymousPage(raw: unknown, offset: number): AdminAnonymousPage {
  const charge = asRecord(raw) ?? {};
  const brut = Array.isArray(charge.anonymousUsers) ? charge.anonymousUsers : [];
  const rows = brut.map(decodeLigne).filter((ligne): ligne is AdminAnonymousRow => ligne !== null);
  const meta = asRecord(charge.pagination) ?? {};
  const total = asCount(meta.total) || rows.length;
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + rows.length < total;
  return { rows, total, hasMore };
}

export function decodeAdminAnonymousOne(raw: unknown): AdminAnonymousOne | null {
  const charge = asRecord(raw) ?? {};
  const source = charge.participant ?? charge.anonymousUser ?? raw;
  const ligne = decodeLigne(source);
  if (ligne === null) return null;
  const permissions = Object.entries(asRecord(asRecord(source)?.permissions) ?? {})
    .filter((entree): entree is [string, boolean] => typeof entree[1] === 'boolean')
    .map(([key, granted]) => ({ key, granted }));
  const lien = asRecord(asRecord(source)?.shareLink);
  const shareLink = lien === null || typeof lien.id !== 'string' ? null : { name: asText(lien.name) || '—', isActive: lien.isActive !== false };
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
    path: `/api/v1/admin/anonymous-users?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminAnonymousPage(result.data, params.offset) };
}

export async function loadAdminAnonymousOne(
  params: AdminDeps & { readonly participantId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminAnonymousOne | null>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/anonymous-users/${encodeURIComponent(params.participantId)}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminAnonymousOne(result.data) };
}
