import type { FeedPost } from '@/lib/api/feed-pages';
import type { MediaPlaybackStatus } from '@/lib/view/use-media-playback';

/**
 * LA LOI DU FIL DES RÉELS (#6457) — PURE. Miroir de `ReelsViewModel.swift`
 * (`seed(posts:startId:)`, `loadMoreIfNeeded`) et du pager vertical de
 * `ReelsPlayerView.swift`, réduite à ce que l'écran web décide : l'ORDRE, le
 * réel VISIBLE, la FENÊTRE de lecture.
 *
 * **L'ordre est gelé à l'ouverture, les données restent vivantes.** iOS
 * remplace sa liste au premier retour de la passerelle (`reels = newReels`) ;
 * or le fil d'affinité EXCLUT la graine (`PostFeedService.getReels`, « le seed
 * est déjà affiché par le client ») : la liste remplacée ne la contient plus et
 * le lecteur saute au premier réel servi, sous le doigt. Ici l'entrée (la
 * graine puis les réels du Flux) garde sa place et la suite servie s'AJOUTE
 * derrière — rien ne bouge au-dessus du réel regardé. Chaque réel est peint
 * depuis sa donnée la plus récente (`known`) : un geste qui bascule un cache se
 * voit aussitôt, sans réordonner.
 */
export const REEL_WINDOW_RADIUS = 1;

/** À trois réels du bout — `index >= reels.count - 3` (`ReelsViewModel.loadMoreIfNeeded`). */
const LOAD_MORE_DISTANCE = 3;

export type ReelPageMode = 'active' | 'near' | 'far';

export type ReelPlaybackIntent = 'play' | 'pause';

const isReel = (post: FeedPost): boolean => post.type === 'REEL';

export function entryReelIds(params: { readonly seedId?: string; readonly feedPosts: readonly FeedPost[] }): readonly string[] {
  const feedIds = params.feedPosts.filter(isReel).map((p) => p.id);
  const head = params.seedId === undefined ? [] : [params.seedId];
  return [...new Set([...head, ...feedIds])];
}

export function composeReelThread(params: {
  readonly entryIds: readonly string[];
  readonly known: ReadonlyMap<string, FeedPost>;
  readonly served: readonly FeedPost[];
}): readonly FeedPost[] {
  const latest = new Map(params.known);
  for (const post of params.served) latest.set(post.id, post);
  const order = [...new Set([...params.entryIds, ...params.served.map((p) => p.id)])];
  return order.flatMap((id) => {
    const post = latest.get(id);
    return post !== undefined && isReel(post) ? [post] : [];
  });
}

export function activeIndexOf(params: { readonly scrollTop: number; readonly pageHeight: number; readonly count: number }): number {
  const { scrollTop, pageHeight, count } = params;
  if (pageHeight <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / pageHeight)));
}

export function pageModeOf(index: number, activeIndex: number): ReelPageMode {
  const distance = Math.abs(index - activeIndex);
  if (distance === 0) return 'active';
  return distance <= REEL_WINDOW_RADIUS ? 'near' : 'far';
}

/**
 * `error` n'appelle JAMAIS de relance automatique : un décodeur en échec
 * rejoué à chaque retour sur le réel boucle sur la même panne. Le lecteur a le
 * bouton « Réessayer » de la bande d'erreur, qui passe par `toggle()`.
 */
export function playbackIntentOf(params: { readonly active: boolean; readonly status: MediaPlaybackStatus }): ReelPlaybackIntent | null {
  const { active, status } = params;
  if (status === 'error') return null;
  if (active) return status === 'playing' ? null : 'play';
  return status === 'playing' ? 'pause' : null;
}

export function neighborIndex(params: { readonly index: number; readonly direction: 'next' | 'previous'; readonly count: number }): number {
  const { index, direction, count } = params;
  const target = direction === 'next' ? index + 1 : index - 1;
  return Math.min(Math.max(0, count - 1), Math.max(0, target));
}

/**
 * CE QUE LA SCÈNE D'UN RÉEL MONTRE — miroir de `primaryReelDisplayMedia` et de
 * `ReelMediaLayout.resolve(media:)` (`ReelsPlayerView.swift`) : la VIDÉO gagne,
 * puis l'AUDIO, puis les IMAGES (qui se parcourent). Un média d'un autre type
 * ne se lit pas : il ne se montre pas.
 */
export type ReelDisplay<M> =
  | { readonly kind: 'video'; readonly media: M }
  | { readonly kind: 'audio'; readonly media: M }
  | { readonly kind: 'images'; readonly images: readonly M[] }
  | { readonly kind: 'none' };

export function reelDisplayOf<M extends { readonly kind: string }>(media: readonly M[]): ReelDisplay<M> {
  const video = media.find((m) => m.kind === 'video');
  if (video !== undefined) return { kind: 'video', media: video };
  const audio = media.find((m) => m.kind === 'audio');
  if (audio !== undefined) return { kind: 'audio', media: audio };
  const images = media.filter((m) => m.kind === 'image');
  return images.length > 0 ? { kind: 'images', images } : { kind: 'none' };
}

export function shouldLoadMoreReels(params: { readonly activeIndex: number; readonly count: number }): boolean {
  return params.count > 0 && params.activeIndex >= params.count - LOAD_MORE_DISTANCE;
}
