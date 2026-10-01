import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import {
  acknowledged,
  countOrNull,
  decodeAdminLinkConversation,
  decodeAdminLinkPerson,
  instantOrNull,
  textOrNull,
  type AdminLinkAck,
  type AdminLinkConversation,
  type AdminLinkPerson,
} from './admin-share-links-person';
import type { ApiResult } from './http';

/**
 * **LES LIENS DE PARTAGE** (#8876, #6729) — `GET /admin/share-links*`, gardés par
 * `canManageConversations` côté passerelle.
 *
 * ## Ce que ce décodeur ne lit JAMAIS
 *
 * `linkId` et `identifier` ouvrent la porte de jointure : quiconque les tient
 * entre dans la conversation (`SHARE_LINK_JOIN_KEY_COLUMNS`, #4692). La passerelle
 * ne les SERT pas (ni la liste ni la fiche) ; ce décodeur, de son côté, n'a aucune
 * ligne qui les lise — un lien se nomme par son `name`, jamais par sa clé. Même
 * chose pour `allowedIpRanges`, qui dit où se trouvent les invités attendus.
 *
 * Les clés ne se lisent que par le geste SOUVERAIN `POST …/reveal`
 * (`revealAdminShareLink`) : son résultat est remis à l'appelant et à lui seul —
 * il ne passe par aucune requête du cache, donc par aucun disque.
 *
 * Champ par champ, **jamais un spread** : la liste sert `additionalProperties:
 * true` côté passerelle, donc toute colonne ajoutée au `select` entrerait sinon
 * dans un cache d'administration.
 */
export type AdminShareLinkRow = {
  readonly id: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly expiresAt: string | null;
  readonly isActive: boolean;
  readonly createdAt: string | null;
  readonly creator: AdminLinkPerson | null;
  readonly conversation: AdminLinkConversation | null;
  /** Participants anonymes arrivés par ce lien. */
  readonly guestCount: number;
};

export type AdminShareLinkGuest = {
  readonly id: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly joinedAt: string | null;
  readonly isActive: boolean;
};

/** Une permission servie : `null` quand la charge ne la porte pas — jamais un « non » inventé. */
export type AdminShareLink = AdminShareLinkRow & {
  readonly updatedAt: string | null;
  readonly visitCount: number;
  readonly maxConcurrentUsers: number | null;
  readonly currentConcurrentUsers: number;
  readonly maxUniqueSessions: number | null;
  readonly currentUniqueSessions: number;
  readonly allowAnonymousMessages: boolean | null;
  readonly allowAnonymousFiles: boolean | null;
  readonly allowAnonymousImages: boolean | null;
  readonly allowViewHistory: boolean | null;
  readonly requireAccount: boolean | null;
  readonly requireNickname: boolean | null;
  readonly requireEmail: boolean | null;
  readonly requireBirthday: boolean | null;
  readonly allowedCountries: readonly string[];
  readonly allowedLanguages: readonly string[];
  readonly recentGuests: readonly AdminShareLinkGuest[];
};

/** Les deux clés de jointure, telles que le geste souverain les rend — à afficher UNE fois, jamais à mettre en cache. */
export type AdminShareLinkSecret = { readonly linkId: string; readonly identifier: string };

const flagOrNull = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

const textList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.flatMap((entry) => (typeof entry === 'string' && entry.trim() !== '' ? [entry.trim()] : [])) : [];

export function decodeAdminShareLinkRow(raw: unknown): AdminShareLinkRow | null {
  const link = asRecord(raw);
  if (link === null || typeof link.id !== 'string' || link.id === '') return null;
  return {
    id: link.id,
    name: textOrNull(link.name),
    description: textOrNull(link.description),
    maxUses: countOrNull(link.maxUses),
    currentUses: asCount(link.currentUses),
    expiresAt: instantOrNull(link.expiresAt),
    isActive: link.isActive !== false,
    createdAt: instantOrNull(link.createdAt),
    creator: decodeAdminLinkPerson(link.creator),
    conversation: decodeAdminLinkConversation(link.conversation),
    guestCount: asCount(asRecord(link._count)?.anonymousParticipants),
  };
}

function decodeGuest(raw: unknown): AdminShareLinkGuest | null {
  const guest = asRecord(raw);
  if (guest === null || typeof guest.id !== 'string' || guest.id === '') return null;
  return {
    id: guest.id,
    displayName: textOrNull(guest.displayName),
    avatar: textOrNull(guest.avatar),
    joinedAt: instantOrNull(guest.joinedAt),
    isActive: guest.isActive !== false,
  };
}

export function decodeAdminShareLink(raw: unknown): AdminShareLink | null {
  const row = decodeAdminShareLinkRow(raw);
  const link = asRecord(raw);
  if (row === null || link === null) return null;
  return {
    ...row,
    updatedAt: instantOrNull(link.updatedAt),
    visitCount: asCount(link.visitCount),
    maxConcurrentUsers: countOrNull(link.maxConcurrentUsers),
    currentConcurrentUsers: asCount(link.currentConcurrentUsers),
    maxUniqueSessions: countOrNull(link.maxUniqueSessions),
    currentUniqueSessions: asCount(link.currentUniqueSessions),
    allowAnonymousMessages: flagOrNull(link.allowAnonymousMessages),
    allowAnonymousFiles: flagOrNull(link.allowAnonymousFiles),
    allowAnonymousImages: flagOrNull(link.allowAnonymousImages),
    allowViewHistory: flagOrNull(link.allowViewHistory),
    requireAccount: flagOrNull(link.requireAccount),
    requireNickname: flagOrNull(link.requireNickname),
    requireEmail: flagOrNull(link.requireEmail),
    requireBirthday: flagOrNull(link.requireBirthday),
    allowedCountries: textList(link.allowedCountries),
    allowedLanguages: textList(link.allowedLanguages),
    recentGuests: (Array.isArray(link.recentGuests) ? link.recentGuests : []).flatMap((entry) => {
      const guest = decodeGuest(entry);
      return guest === null ? [] : [guest];
    }),
  };
}

export function decodeAdminShareLinkSecret(raw: unknown): AdminShareLinkSecret | null {
  const secret = asRecord(raw);
  if (secret === null) return null;
  const linkId = asText(secret.linkId);
  const identifier = asText(secret.identifier);
  if (linkId === '' || identifier === '') return null;
  return { linkId, identifier };
}

const UNREADABLE = { ok: false, status: 502, error: 'Charge illisible' } as const;

export async function loadAdminShareLinks(
  params: AdminDeps & { readonly query: URLSearchParams; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminShareLinkRow>>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.shareLinks}?${params.query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminShareLinkRow, { kind: 'top' });
}

export async function loadAdminShareLink(
  params: AdminDeps & { readonly shareLinkId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminShareLink>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.shareLinksById(params.shareLinkId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const link = decodeAdminShareLink(result.data);
  if (link === null) return UNREADABLE;
  return { ok: true, data: link, ...(result.status === undefined ? {} : { status: result.status }) };
}

/** FERMER — `DELETE`, fermeture DOUCE : la ligne survit, les invités arrivés par ce lien sont révoqués d'abord. */
export async function closeAdminShareLink(params: AdminDeps & { readonly shareLinkId: string }): Promise<ApiResult<AdminLinkAck>> {
  return acknowledged(await params.transport.request<unknown>({ method: 'DELETE', path: adminEndpoints.shareLinksById(params.shareLinkId) }));
}

/** ROUVRIR — `PATCH { active: true }`, la seule valeur que la route admet. Ne rétablit pas les invités révoqués. */
export async function reopenAdminShareLink(params: AdminDeps & { readonly shareLinkId: string }): Promise<ApiResult<AdminLinkAck>> {
  return acknowledged(
    await params.transport.request<unknown>({ method: 'PATCH', path: adminEndpoints.shareLinksById(params.shareLinkId), body: { active: true } }),
  );
}

/**
 * **RÉVÉLER LE SECRET** — rang souverain, motif écrit de 10 caractères au moins,
 * geste consigné. Le résultat est REMIS à l'appelant, qui l'affiche UNE fois : cette
 * fonction n'écrit dans aucun cache, et ses appelants ne la passent jamais à
 * `useQuery`. Une charge sans clés lisibles est un échec, pas un secret vide.
 */
export async function revealAdminShareLink(
  params: AdminDeps & { readonly shareLinkId: string; readonly reason: string },
): Promise<ApiResult<AdminShareLinkSecret>> {
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.shareLinksByIdReveal(params.shareLinkId),
    body: { reason: params.reason },
  });
  if (!result.ok) return result;
  const secret = decodeAdminShareLinkSecret(result.data);
  if (secret === null) return UNREADABLE;
  return { ok: true, data: secret, ...(result.status === undefined ? {} : { status: result.status }) };
}

/**
 * LES CLÉS DE REQUÊTE — sous `['admin', 'shareLink']` : jamais écrites sur le
 * disque (`estClefNonPersistable`). **Aucune clé ne porte le secret révélé** : il
 * vit dans l'état local du composant qui l'affiche.
 */
export const ADMIN_SHARE_LINKS_KEY = ['admin', 'shareLink'] as const;
export const adminShareLinksListKey = (address: string) => ['admin', 'shareLink', 'list', address] as const;
export const adminShareLinkKey = (shareLinkId: string) => ['admin', 'shareLink', 'one', shareLinkId] as const;
