import type { QueryClient } from '@tanstack/react-query';

import { withServedCount } from '@/lib/feed/interactions';

import { updateCardPost } from './card-caches';
import type { DataSource } from './config';
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
 * ABSOLU servi remplace celui de CHAQUE écran qui montre la carte
 * (`updateCardPost`, #7341) : on partage aussi depuis un hashtag, un profil,
 * les Réels ou la fiche, et le Flux seul était écrit.
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
    updateCardPost(deps.queryClient, postId, (post) => withServedCount(post, { postId, kind: 'share', count }));
  }
  return true;
}
