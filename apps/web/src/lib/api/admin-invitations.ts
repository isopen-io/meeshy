import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import { acknowledged, decodeAdminLinkPerson, instantOrNull, textOrNull, type AdminLinkAck, type AdminLinkPerson } from './admin-share-links-person';
import type { ApiResult } from './http';

/**
 * **LES DEMANDES DE CONTACT** (#8876, #6729) — `GET /admin/invitations*`.
 *
 * Ce que la passerelle appelle « invitations » sont des DEMANDES D'AMITIÉ
 * (`FriendRequest`) : un membre demande à un autre d'entrer dans ses contacts. Les
 * routes sont gardées par `canCreateUsers` (clé non servie) ; la section choisit
 * `canManageUsers`, au moins aussi stricte.
 *
 * ## Ce que ce décodeur garde, et ce qu'il laisse
 *
 * - La LISTE (pagination IMBRIQUÉE, `data = { invitations, pagination }`) sert la
 *   demande et ses deux personnes nommées. Le décodeur de ligne ne garde du
 *   message que sa PRÉSENCE (`hasMessage`) : le texte n'est dans aucune cellule,
 *   il n'a donc pas à rester dans le cache de la liste.
 * - La FICHE sert en plus le texte, et — pour chaque personne — son **adresse
 *   e-mail**, que ce décodeur ne lit JAMAIS : aucun écran ne l'affiche, et un
 *   cache d'administration n'a pas à porter la boîte d'un membre.
 * - `byType` du bandeau est en réalité une répartition PAR STATUT (le nom est un
 *   vestige) : il n'est pas décodé.
 * - `type` (« friend » partout) et les identifiants `senderId` / `receiverId` (déjà
 *   portés par les personnes) ne sont pas décodés non plus.
 *
 * `status` est gardé tel que servi : c'est la bibliothèque d'interprétation qui le
 * nomme, et un statut qu'elle ne connaît pas (`blocked`) se dit « Non reconnu ».
 */
export type AdminInvitationRow = {
  readonly id: string;
  readonly status: string;
  readonly hasMessage: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly sender: AdminLinkPerson | null;
  readonly receiver: AdminLinkPerson | null;
};

export type AdminInvitation = Omit<AdminInvitationRow, 'hasMessage'> & { readonly message: string | null };

export type AdminInvitationStats = {
  readonly total: number;
  readonly pending: number;
  readonly accepted: number;
  readonly rejected: number;
  /** Envoyées depuis 7 jours. */
  readonly recent: number;
  /** Déjà en POURCENTAGE (0–100), arrondi par la passerelle. */
  readonly acceptanceRate: number;
};

export type AdminInvitationDay = {
  /** Jour UTC, `AAAA-MM-JJ`. */
  readonly date: string;
  readonly sent: number;
  readonly accepted: number;
  readonly rejected: number;
};

function decodeCommon(raw: unknown): Omit<AdminInvitation, 'message'> | null {
  const invitation = asRecord(raw);
  if (invitation === null || typeof invitation.id !== 'string' || invitation.id === '') return null;
  return {
    id: invitation.id,
    status: asText(invitation.status),
    createdAt: instantOrNull(invitation.createdAt),
    updatedAt: instantOrNull(invitation.updatedAt),
    sender: decodeAdminLinkPerson(invitation.sender),
    receiver: decodeAdminLinkPerson(invitation.receiver),
  };
}

export function decodeAdminInvitationRow(raw: unknown): AdminInvitationRow | null {
  const common = decodeCommon(raw);
  if (common === null) return null;
  return { ...common, hasMessage: textOrNull(asRecord(raw)?.message) !== null };
}

export function decodeAdminInvitation(raw: unknown): AdminInvitation | null {
  const common = decodeCommon(raw);
  if (common === null) return null;
  return { ...common, message: textOrNull(asRecord(raw)?.message) };
}

export function decodeAdminInvitationStats(raw: unknown): AdminInvitationStats {
  const stats = asRecord(raw) ?? {};
  return {
    total: asCount(stats.total),
    pending: asCount(stats.pending),
    accepted: asCount(stats.accepted),
    rejected: asCount(stats.rejected),
    recent: asCount(stats.recentInvitations),
    acceptanceRate: asCount(stats.acceptanceRate),
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Une ligne dont la date n'est pas un jour réel est ÉCARTÉE : un point à un jour inventé fausserait la courbe. */
export function decodeAdminInvitationDays(raw: unknown): readonly AdminInvitationDay[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): readonly AdminInvitationDay[] => {
    const day = asRecord(entry);
    if (day === null || typeof day.date !== 'string' || !DAY.test(day.date)) return [];
    return [{ date: day.date, sent: asCount(day.sent), accepted: asCount(day.accepted), rejected: asCount(day.rejected) }];
  });
}

const UNREADABLE = { ok: false, status: 502, error: 'Charge illisible' } as const;

export async function loadAdminInvitations(
  params: AdminDeps & { readonly query: URLSearchParams; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminInvitationRow>>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.invitations}?${params.query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminInvitationRow, { kind: 'nested', key: 'invitations' });
}

export async function loadAdminInvitation(
  params: AdminDeps & { readonly invitationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminInvitation>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.invitationsById(params.invitationId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const invitation = decodeAdminInvitation(result.data);
  if (invitation === null) return UNREADABLE;
  return { ok: true, data: invitation, ...(result.status === undefined ? {} : { status: result.status }) };
}

export async function loadAdminInvitationStats(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<AdminInvitationStats>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.invitationsStats,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminInvitationStats(result.data), ...(result.status === undefined ? {} : { status: result.status }) };
}

export async function loadAdminInvitationDays(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<readonly AdminInvitationDay[]>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.invitationsTimelineDaily,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminInvitationDays(result.data), ...(result.status === undefined ? {} : { status: result.status }) };
}

/**
 * **LE SEUL GESTE : ANNULER LA DEMANDE** — `PATCH { status: 'rejected' }`. Forcer
 * « acceptée » n'est pas exposé : la route écrit un statut brut SANS créer
 * l'amitié (décision § 9.7 de la spécification). Le geste ne garde RIEN de la
 * ligne rendue (la passerelle y remet les deux personnes) : un simple accusé, la
 * vérité se relit par invalidation.
 */
export async function cancelAdminInvitation(params: AdminDeps & { readonly invitationId: string }): Promise<ApiResult<AdminLinkAck>> {
  return acknowledged(
    await params.transport.request<unknown>({
      method: 'PATCH',
      path: adminEndpoints.invitationsById(params.invitationId),
      body: { status: 'rejected' },
    }),
  );
}

/**
 * LES CLÉS DE REQUÊTE — sous `['admin', 'invitation']` : jamais écrites sur le
 * disque (`estClefNonPersistable`). Le préfixe commun est ce qu'un geste invalide
 * en une fois (liste, bandeau, courbe, fiche).
 */
export const ADMIN_INVITATIONS_KEY = ['admin', 'invitation'] as const;
export const adminInvitationsListKey = (address: string) => ['admin', 'invitation', 'list', address] as const;
export const ADMIN_INVITATIONS_STATS_KEY = ['admin', 'invitation', 'stats'] as const;
export const ADMIN_INVITATIONS_TIMELINE_KEY = ['admin', 'invitation', 'timeline'] as const;
export const adminInvitationKey = (invitationId: string) => ['admin', 'invitation', 'one', invitationId] as const;
