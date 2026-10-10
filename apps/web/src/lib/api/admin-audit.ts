import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asRecord, asText } from './admin';
import { decodeNamePreview, type AdminNamePreview } from './admin-name-preview';
import { adminPageOf, type AdminPage } from './admin-page';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/**
 * **LE JOURNAL D'AUDIT** (#8876, #6727) — `GET /admin/audit-logs`.
 *
 * Qui a fait quoi, à qui, pourquoi : la donnée la plus sensible de
 * l'administration, servie à BIGBOSS et à AUDIT seulement (`canViewAuditLogs` ;
 * ADMIN est refusé par la matrice, et c'est voulu).
 *
 * ## Ce que ce décodeur garde, et ce qu'il ne lit JAMAIS
 *
 * Il garde ce que l'écran AFFICHE : l'action, l'instant, l'administrateur et le
 * sujet (nommés), la cible (genre, identifiant, libellé résolu), le motif, les
 * changements, et — SEULEMENT si la passerelle les sert — l'adresse IP et le
 * navigateur. La passerelle ne les sert qu'avec `canViewSensitiveData` et masque
 * déjà les secrets (« ••• ») : ce module ne « répare » rien, il ne relit aucune
 * métadonnée brute, aucun jeton, aucun hachage.
 *
 * `entity` et `entityId` de la ligne servie redoublent `target.type` et
 * `target.id` : seule la cible est gardée, une forme pour une donnée.
 *
 * Champ par champ, **jamais un spread**.
 *
 * ## Les clés de requête sont SOUVERAINES
 *
 * Un journal d'audit ne se garde pas : son préfixe est celui de la lecture
 * souveraine (`ADMIN_SOUVERAIN_PREFIXE`), donc jamais écrit sur le disque
 * (`estClefNonPersistable`), et l'écran pose `gcTime: 0` pour qu'il ne survive
 * pas non plus en mémoire à l'écran.
 */
export type AdminAuditPerson = {
  readonly id: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type AdminAuditTarget = {
  /** Le genre d'élément, tel que la passerelle l'écrit : `User`, `Conversation`, `ConversationShareLink`… */
  readonly type: string;
  readonly id: string;
  /** Le nom résolu ; `null` quand l'élément n'a pas de nom connu — jamais l'identifiant en guise de nom. */
  readonly label: string | null;
  readonly secondary: string | null;
  /** Les membres qui nomment une conversation sans titre — servis au rang d'administration seulement. */
  readonly members: AdminNamePreview | null;
};

export type AdminAuditChange = {
  readonly field: string;
  readonly before: string | null;
  readonly after: string | null;
};

export type AdminAuditEntry = {
  readonly id: string;
  readonly action: string;
  readonly createdAt: string | null;
  readonly admin: AdminAuditPerson | null;
  readonly subject: AdminAuditPerson | null;
  readonly target: AdminAuditTarget;
  readonly reason: string | null;
  readonly changes: readonly AdminAuditChange[] | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
};

const textOrNull = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

const instantOrNull = (value: unknown): string | null => {
  const text = asText(value);
  return text === '' || Number.isNaN(new Date(text).getTime()) ? null : text;
};

function decodePerson(raw: unknown): AdminAuditPerson | null {
  const person = asRecord(raw);
  if (person === null || typeof person.id !== 'string' || person.id === '') return null;
  return {
    id: person.id,
    username: textOrNull(person.username),
    displayName: textOrNull(person.displayName),
    avatar: textOrNull(person.avatar),
  };
}

function decodeTarget(raw: unknown): AdminAuditTarget | null {
  const target = asRecord(raw);
  if (target === null || typeof target.type !== 'string' || target.type === '' || typeof target.id !== 'string' || target.id === '') return null;
  return {
    type: target.type,
    id: target.id,
    label: textOrNull(target.label),
    secondary: textOrNull(target.secondary),
    members: decodeNamePreview(target),
  };
}

function decodeChange(raw: unknown): AdminAuditChange | null {
  const change = asRecord(raw);
  if (change === null || typeof change.field !== 'string' || change.field === '') return null;
  return {
    field: change.field,
    before: typeof change.before === 'string' ? change.before : null,
    after: typeof change.after === 'string' ? change.after : null,
  };
}

const decodeChanges = (raw: unknown): readonly AdminAuditChange[] | null =>
  Array.isArray(raw) ? raw.flatMap((entry) => decodeChange(entry) ?? []) : null;

export function decodeAdminAuditEntry(raw: unknown): AdminAuditEntry | null {
  const entry = asRecord(raw);
  if (entry === null || typeof entry.id !== 'string' || entry.id === '' || typeof entry.action !== 'string' || entry.action === '') return null;
  const target = decodeTarget(entry.target);
  if (target === null) return null;
  return {
    id: entry.id,
    action: entry.action,
    createdAt: instantOrNull(entry.createdAt),
    admin: decodePerson(entry.admin),
    subject: decodePerson(entry.subject),
    target,
    reason: textOrNull(entry.reason),
    changes: decodeChanges(entry.changes),
    ipAddress: textOrNull(entry.ipAddress),
    userAgent: textOrNull(entry.userAgent),
  };
}

export async function loadAdminAuditLogs(
  params: AdminDeps & { readonly query: URLSearchParams; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminAuditEntry>>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.auditLogs}?${params.query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminAuditEntry, { kind: 'top' });
}

/** LES CLÉS DE REQUÊTE — sous le préfixe souverain : jamais écrites sur le disque, jamais gardées au-delà de l'écran (`gcTime: 0`). */
export const ADMIN_AUDIT_KEY = [ADMIN_SOUVERAIN_PREFIXE, 'audit'] as const;
export const adminAuditListKey = (address: string) => [ADMIN_SOUVERAIN_PREFIXE, 'audit', 'list', address] as const;
