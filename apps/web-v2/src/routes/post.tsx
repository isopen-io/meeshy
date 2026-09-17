import { useMemo, useRef } from 'react';

import { FeedPostCard } from '@/components/feed-post-card';
import { Glyph } from '@/components/glyph';
import { ApiError } from '@/lib/api/client';
import { usePost } from '@/lib/api/query';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { useFeedAutoplayRoot } from '@/lib/feed/use-feed-autoplay';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useMinute } from '@/lib/view/use-minute';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { Link } from '@/routes/route-table';

import { FeedSkeleton } from './feed';

/**
 * LE DÉTAIL D'UNE PUBLICATION (#6278, D-48, D-49) — `/post/$post` et
 * `/feeds/post/$post`, miroir réduit de `PostDetailView.swift` : la carte du
 * fil, en entier, avec ses gestes. Même modèle (`resolveFeedCardModel` — le
 * Prisme, l'accent, la géométrie ne se recalculent jamais ici, D-14), même
 * hôte des gestes (`usePostGesture`), même cache que le fil pour l'état du
 * lecteur (`performPostGesture` bascule les deux).
 *
 * CE QUI N'EST PAS REPRIS CE LOT, ASSUMÉ : les commentaires, la
 * republication, le partage et le menu « Plus d'options » — chacun à sa
 * propre marche de #6278.
 */

export function PostDetailHeader() {
  return (
    <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
      <Link
        to="feed"
        aria-label="Retour au fil"
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretLeft" size={20} />
      </Link>
      <h1 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        Publication
      </h1>
    </header>
  );
}

/** 403 et 404 confondus (D-6) — rien de la publication ne transparaît. */
export function PostDetailRefused() {
  return (
    <div className="grid flex-1 content-center justify-items-center gap-3 px-8 text-center">
      <span style={{ color: 'var(--color-ios-ink-3)' }}>
        <Glyph name="lock" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        Cette publication n’est pas accessible
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        Elle n’existe pas, ou vous n’y avez pas accès.
      </p>
      <Link
        to="feed"
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        Retour au fil
      </Link>
    </div>
  );
}

export function PostDetailError({ online, onRetry }: { readonly online: boolean; readonly onRetry: () => void }) {
  return (
    <div role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {online ? 'Impossible de charger la publication' : 'Hors ligne'}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {online ? 'Réessayez dans un instant.' : 'La publication s’affichera à la reconnexion.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        Réessayer
      </button>
    </div>
  );
}

const isRefusal = (error: unknown): boolean => error instanceof ApiError && (error.status === 403 || error.status === 404);

export default function PostDetailScreen() {
  const { post: postId } = useParams<'/post/$post'>();
  const post = usePost(postId);
  const online = useOnline();
  const { languages: readerLanguages } = useReaderLanguages();
  const minute = useMinute();
  const { announcement, onGesture, onShare } = usePostGesture();
  const frame = useRef<HTMLElement | null>(null);
  // MÊME élection que le fil (#6898 § 5.3) — un `IntersectionObserver`
  // dédié à ce scrollport. `onOpenScene` reste ABSENT ici : le plein écran
  // est un AUTRE travail (`scenes-plein-ecran`), et le détail est DÉJÀ la
  // destination du tap sans hôte (§ 1.3.2) — lui en donner un mènerait
  // nulle part, un tap sans effet (loi 4).
  const { registerScene } = useFeedAutoplayRoot(frame);

  const model = useMemo(
    () => (post.data === undefined ? undefined : resolveFeedCardModel(post.data, { preferredLanguages: readerLanguages, now: new Date() })),
    // `minute` réévalue `new Date()` (même motif que `feed.tsx`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [post.data, readerLanguages, minute],
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <PostDetailHeader />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <main ref={frame} id="contenu" className="scrollbar-none flex flex-1 flex-col overflow-y-auto px-3 pb-safe">
        {model !== undefined ? (
          <FeedPostCard model={model} onGesture={onGesture} onShare={onShare} preferredLanguages={readerLanguages} registerScene={registerScene} />
        ) : isRefusal(post.error) ? (
          <PostDetailRefused />
        ) : post.isError ? (
          <PostDetailError online={online} onRetry={() => void post.refetch()} />
        ) : (
          <div aria-busy="true" aria-label="Chargement de la publication">
            <FeedSkeleton />
          </div>
        )}
      </main>
    </div>
  );
}
