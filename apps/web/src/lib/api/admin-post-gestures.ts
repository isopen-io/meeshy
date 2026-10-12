import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { ADMIN_POST_STATES, type AdminPostState } from '@meeshy/shared/types/admin-publications';

import type { PostGestureIntent } from '@/lib/admin/post-gestures';

import { asRecord, type AdminDeps } from './admin';
import type { ApiResult } from './http';

/**
 * **LES GESTES DE PUBLICATION DE L'ADMINISTRATION** (#10392) —
 * `POST admin.postsByPostIdGestures` (une publication, rend sa vue) et
 * `POST admin.postsGestures` (un lot, un verdict par publication), sous
 * `canModerateContent`. Le motif part dans `reason` ; ABSENT, il ne part pas, ce
 * que la passerelle n'admet que du rang souverain.
 */
export type AdminPostView = {
  readonly id: string;
  readonly state: AdminPostState;
  readonly visibility: string;
  readonly moderationHiddenAt: string | null;
  readonly moderationPriorVisibility: string | null;
  readonly updatedAt: string | null;
};

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function decodeAdminPostView(raw: unknown): AdminPostView | null {
  const view = asRecord(raw);
  if (view === null || typeof view.id !== 'string' || view.id === '') return null;
  const state = ADMIN_POST_STATES.find((candidate) => candidate === view.state);
  const visibility = textOrNull(view.visibility);
  if (state === undefined || visibility === null) return null;
  return {
    id: view.id,
    state,
    visibility,
    moderationHiddenAt: textOrNull(view.moderationHiddenAt),
    moderationPriorVisibility: textOrNull(view.moderationPriorVisibility),
    updatedAt: textOrNull(view.updatedAt),
  };
}

const bodyOf = (intent: PostGestureIntent, reason: string | null | undefined): Record<string, unknown> => ({
  ...intent,
  ...(reason === null || reason === undefined || reason === '' ? {} : { reason }),
});

export async function sendAdminPostGesture(
  params: AdminDeps & { readonly postId: string; readonly intent: PostGestureIntent; readonly reason?: string | null },
): Promise<ApiResult<AdminPostView>> {
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.postsByPostIdGestures(params.postId),
    body: bodyOf(params.intent, params.reason),
  });
  if (!result.ok) return result;
  const view = decodeAdminPostView(result.data);
  return view === null ? { ok: false, status: 500, error: 'malformed' } : { ok: true, data: view };
}

export type AdminPostVerdict = {
  readonly postId: string;
  readonly outcome: 'applied' | 'unchanged' | 'refused';
  readonly code: string | null;
  readonly view: AdminPostView | null;
};

const OUTCOMES = ['applied', 'unchanged', 'refused'] as const;

export async function sendAdminPostBatchGesture(
  params: AdminDeps & { readonly postIds: readonly string[]; readonly intent: PostGestureIntent; readonly reason?: string | null },
): Promise<ApiResult<readonly AdminPostVerdict[]>> {
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.postsGestures,
    body: { ...bodyOf(params.intent, params.reason), postIds: params.postIds },
  });
  if (!result.ok) return result;
  const results = asRecord(result.data)?.results;
  const verdicts = (Array.isArray(results) ? results : []).flatMap((entry): AdminPostVerdict[] => {
    const record = asRecord(entry);
    const outcome = OUTCOMES.find((candidate) => candidate === record?.outcome);
    if (record === null || typeof record.postId !== 'string' || outcome === undefined) return [];
    return [{ postId: record.postId, outcome, code: textOrNull(record.code), view: decodeAdminPostView(record.view) }];
  });
  return { ok: true, data: verdicts };
}
