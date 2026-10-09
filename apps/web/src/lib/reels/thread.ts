import type { FeedPost } from '@/lib/api/feed-pages';
import type { MediaPlaybackStatus } from '@/lib/view/use-media-playback';

import { PRELOAD_MIN_RADIUS, preloadTierOf } from './preload-window';

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
export const REEL_WINDOW_RADIUS = PRELOAD_MIN_RADIUS;

/** À trois réels du bout — `index >= reels.count - 3` (`ReelsViewModel.loadMoreIfNeeded`). */
const LOAD_MORE_DISTANCE = 3;

/**
 * Le PALIER d'une page, lu dans la fenêtre de préchargement (#9702) :
 * `active` joue, `near` (N±1) monte son élément en `preload="auto"` — sa
 * première image est décodée avant le balayage —, `warm` (N±2) le monte en
 * attente de métadonnées, `far` ne porte que son affiche (ses octets de tête
 * sont amorcés à part, `media-primer.ts`, tant qu'il reste dans la fenêtre).
 */
export type ReelPageMode = 'active' | 'near' | 'warm' | 'far';

export type ReelPlaybackIntent = 'play' | 'pause';

const isReel = (post: FeedPost): boolean => post.type === 'REEL';

/**
 * LA GRAINE D'UN LECTEUR OUVERT SUR UN RÉEL NOMMÉ (#7298) — PURE, et le SITE
 * UNIQUE qui la lit.
 *
 * Le lecteur a DEUX portes pour un même réel : `/reels?seed=<id>`, celle du
 * Flux (miroir `present(posts:startId:)`), et `/reel/<id>`, l'adresse que la
 * PASSERELLE grave dans chaque lien de partage
 * (`PostService.shareWithTrackingLink`) et que `/l/:token` ouvre par une
 * navigation entière. Les deux nomment la même chose ; les lire à deux
 * endroits les ferait diverger au premier correctif porté à l'un des deux.
 *
 * Le CHEMIN l'emporte : il est la partie de l'adresse qui NOMME le réel, là où
 * `?seed=` n'est qu'un paramètre — et `/reel/<id>?seed=<autre>`, forme qu'un
 * partage recollé peut produire, doit ouvrir le réel de son chemin.
 *
 * Une chaîne VIDE rend `undefined`, jamais `''` : l'écran cherche une graine
 * inconnue par un `GET /posts/<id>` (`postQueryOptions`), et `''` y partirait
 * en requête sans identifiant.
 */
export function reelSeedOf(params: {
  readonly params: Readonly<Record<string, string>>;
  readonly search: URLSearchParams;
}): string | undefined {
  const fromPath = params.params.post;
  if (fromPath !== undefined && fromPath !== '') return fromPath;
  const fromSearch = params.search.get('seed');
  return fromSearch !== null && fromSearch !== '' ? fromSearch : undefined;
}

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

/**
 * **UNE RELECTURE NE DÉPLACE PAS LE RÉEL REGARDÉ** (#9702) — PURE, jumelle de
 * `ReelThreadOrder.refreshed` (`packages/MeeshySDK/.../Media/ReelThreadOrder.swift`).
 *
 * `composeReelThread` gèle l'ENTRÉE ; la suite servie, elle, suit l'ordre de
 * la passerelle — qui RECLASSE sa page à chaque lecture (les réels déjà vus
 * coulent, `PostFeedService.getReels`). Un fil rouvert depuis sa caisse se
 * relit en fond : sans cette tenue, le réel regardé changeait de place et
 * l'écran, qui lit le réel visible sur la POSITION (`activeIndexOf`), en
 * peignait un autre sous le doigt.
 *
 * Le réel regardé et ce qui le PRÉCÈDE gardent l'ordre tenu ; ce qui le SUIT
 * prend l'ordre composé. La donnée vient toujours de la composition : un réel
 * tenu qu'elle ne porte plus (supprimé) quitte le fil.
 */
export function holdReelThread(params: {
  readonly heldIds: readonly string[];
  readonly activeId: string;
  readonly composed: readonly FeedPost[];
}): readonly FeedPost[] {
  const { heldIds, activeId, composed } = params;
  const activeAt = heldIds.indexOf(activeId);
  if (activeAt < 0) return composed;
  const byId = new Map(composed.map((post) => [post.id, post] as const));
  const head = heldIds.slice(0, activeAt + 1).flatMap((id) => {
    const post = byId.get(id);
    return post !== undefined ? [post] : [];
  });
  const kept = new Set(head.map((post) => post.id));
  const thread = [...head, ...composed.filter((post) => !kept.has(post.id))];
  return thread.every((post, index) => post === composed[index]) ? composed : thread;
}

export function activeIndexOf(params: { readonly scrollTop: number; readonly pageHeight: number; readonly count: number }): number {
  const { scrollTop, pageHeight, count } = params;
  if (pageHeight <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / pageHeight)));
}

const MODE_OF_TIER = { play: 'active', decode: 'near', mount: 'warm', prime: 'far', idle: 'far' } as const;

/** Le montage ne dépend que du PLANCHER de la fenêtre (N±2, toujours) : ce
 * que la fenêtre élargie ajoute au-delà, ce sont des octets, pas des éléments. */
export function pageModeOf(index: number, activeIndex: number): ReelPageMode {
  return MODE_OF_TIER[preloadTierOf(index - activeIndex, { ahead: REEL_WINDOW_RADIUS, behind: REEL_WINDOW_RADIUS })];
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

/**
 * **CE QUE L'ÉCRAN DES RÉELS OFFRE À UN VISITEUR SANS COMPTE** (#9149, #9172)
 * — l'état que `useVisitorInvitation` attend. La passerelle ne sert à un
 * visiteur que le réel NOMMÉ (`GET /posts/:id`, s'il est public) ; le fil
 * (`scope=reels`) exige un compte et ne s'ouvrira pas sans une garde dédiée.
 * Sans graine, il n'y a donc rien à montrer, et rien n'est refusé : c'est
 * l'invitation à rejoindre (`invite`), jamais « ce contenu n'est pas
 * accessible ». Miroir d'iOS, qui garde le lien en attente derrière l'écran de
 * connexion (`VisitorContentRequest` ne connaît qu'un réel ou un post nommés).
 */
export function reelVisitorState(params: {
  readonly count: number;
  readonly hasSeed: boolean;
  readonly seedRefused: boolean;
}): 'pending' | 'served' | 'refused' | 'invite' {
  if (params.count > 0) return 'served';
  if (!params.hasSeed) return 'invite';
  return params.seedRefused ? 'refused' : 'pending';
}
