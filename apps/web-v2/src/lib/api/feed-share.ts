import type { QueryClient } from '@tanstack/react-query';

import { applyServedCount } from '@/lib/feed/interactions';

import type { DataSource } from './config';
import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData } from './feed-pages';
import type { HttpTransport } from './http';

/**
 * LE PARTAGE COMPTÉ (#6278, D-48) — `POST /api/v1/posts/:postId/share`
 * (`services/gateway/src/routes/posts/share.ts:64`, requiredAuth, garde
 * d'audience `mayConsumePost`), appelé APRÈS que le lien est parti (feuille
 * du système ou presse-papier) : on compte un partage qui a eu lieu, jamais
 * une intention. `platform: 'web'` nourrit l'analytique de la passerelle
 * (`SharePostSchema.platform`).
 *
 * Rien n'est écrit d'avance, donc rien ne se défait : un refus ou une panne
 * laisse le compte tel quel et rend `false` — le lien, lui, est déjà chez son
 * destinataire, et un compteur manqué ne mérite pas d'annonce. Le compte
 * ABSOLU servi remplace celui du fil (`applyServedCount`).
 */
export type FeedShareDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly queryClient: QueryClient;
};

export async function recordPostShare(params: { readonly postId: string; readonly deps: FeedShareDeps }): Promise<boolean> {
  const { postId, deps } = params;
  if (__FIXTURES__ && deps.source === 'fixtures') return true;

  const result = await deps.transport
    .request<unknown>({ method: 'POST', path: `/api/v1/posts/${encodeURIComponent(postId)}/share`, body: { platform: 'web' } })
    .catch(() => null);
  if (result === null || !result.ok) return false;

  const count = (result.data as { readonly shareCount?: unknown } | null)?.shareCount;
  if (typeof count === 'number' && Number.isFinite(count)) {
    deps.queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) =>
      applyServedCount(data, { postId, kind: 'share', count }),
    );
  }
  return true;
}
