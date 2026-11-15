import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import {
  parseEngagementScale,
  type EngagementScale,
  type EngagementScaleDocument,
} from '@meeshy/shared/types/engagement-scale';

import type { AdminDeps } from './admin';
import type { ApiResult } from './http';

/**
 * LE BARÈME DE POINTS (#8906) — `GET` / `PUT admin.engagementScale`,
 * ADMIN et BIGBOSS seulement (la passerelle le garde ; l'écran le relit).
 *
 * La charge est lue par la loi PARTAGÉE (`parseEngagementScale`) : un barème
 * servi hors bornes est refusé ENTIER (`MALFORMED_PAYLOAD`), jamais édité à
 * moitié. Le `PUT` envoie `{ scale }` et rend le document enregistré ; un
 * barème invalide rend 400, dont le message est montré tel quel.
 */
export const ADMIN_ENGAGEMENT_SCALE_QUERY_KEY = ['admin', 'engagement-scale'] as const;

const MALFORMED = {
  ok: false,
  status: 502,
  error: 'Le barème servi est illisible — forme inattendue',
  code: 'MALFORMED_PAYLOAD',
} as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textOrNull = (value: unknown): string | null | undefined =>
  value === null ? null : typeof value === 'string' ? value : undefined;

/** La personne qui a réglé le barème, NOMMÉE par la passerelle (`updatedByPerson`, d987e0d684). */
export type EngagementScalePerson = {
  readonly id: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type AdminEngagementScaleDocument = EngagementScaleDocument & {
  /** `null` d'un ancien serveur, ou quand le compte n'existe plus : l'écran ne peint alors jamais `updatedBy` (un identifiant). */
  readonly updatedByPerson: EngagementScalePerson | null;
};

const optionalText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

function decodePerson(raw: unknown): EngagementScalePerson | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  return { id: raw.id, username: optionalText(raw.username), displayName: optionalText(raw.displayName), avatar: optionalText(raw.avatar) };
}

export function decodeEngagementScaleDocument(raw: unknown): AdminEngagementScaleDocument | null {
  if (!isRecord(raw)) return null;
  const scale = parseEngagementScale(raw.scale);
  const updatedAt = textOrNull(raw.updatedAt ?? null);
  const updatedBy = textOrNull(raw.updatedBy ?? null);
  if (scale === null || updatedAt === undefined || updatedBy === undefined) return null;
  return { scale, updatedAt, updatedBy, updatedByPerson: decodePerson(raw.updatedByPerson) };
}

async function exchange(
  params: AdminDeps & { readonly signal?: AbortSignal },
  request: { readonly method: 'GET' } | { readonly method: 'PUT'; readonly body: { readonly scale: EngagementScale } },
): Promise<ApiResult<AdminEngagementScaleDocument>> {
  const result = await params.transport.request<unknown>({
    ...request,
    path: adminEndpoints.engagementScale,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const document = decodeEngagementScaleDocument(result.data);
  return document === null ? MALFORMED : { ok: true, data: document };
}

export function loadEngagementScale(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<AdminEngagementScaleDocument>> {
  return exchange(params, { method: 'GET' });
}

export function saveEngagementScale(params: AdminDeps & { readonly scale: EngagementScale }): Promise<ApiResult<AdminEngagementScaleDocument>> {
  return exchange(params, { method: 'PUT', body: { scale: params.scale } });
}
