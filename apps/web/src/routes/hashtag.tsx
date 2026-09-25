import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { FeedPostCard } from '@/components/feed-post-card';
import { Glyph } from '@/components/glyph';
import { apiDeps } from '@/lib/api/deps';
import { hashtagInfiniteOptions, normalizeHashtag, type HashtagPage } from '@/lib/api/hashtag-posts';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useMinute } from '@/lib/view/use-minute';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { Link } from '@/routes/route-table';

import { FeedSkeleton } from './feed';

/**
 * **LES PUBLICATIONS D'UN HASHTAG** (#7032) — `/hashtag/$tag`, l'adresse que
 * chaque `#mot` d'une publication vise, et la nomenclature du LEGACY
 * (`apps/web/app/hashtag/[tag]`, D-5).
 *
 * Elle arrive AVANT les liens qui la visent : sans elle, un hashtag cliquable
 * mènerait à « adresse inconnue ». C'est aussi pourquoi le hashtag reste du
 * TEXTE en conversation — il n'existe aucune jointure message ↔ hashtag côté
 * serveur, donc cet écran-ci n'aurait rien à servir.
 *
 * **MÊME CARTE QUE LE FIL, MÊME MODÈLE** — `resolveFeedCardModel` et
 * `FeedPostCard`, jamais une seconde peau : le Prisme, l'accent et la
 * géométrie d'une publication ne se recalculent pas par écran (D-14, D-1).
 *
 * **UN HASHTAG INCONNU N'EST PAS UNE PANNE** : le serveur rend une page vide,
 * et cet écran peint un état vide NOMMÉ. Un `role="alert"` y serait faux.
 *
 * **LA VISIBILITÉ EST PLUS ÉTROITE QU'AU FIL, ET C'EST LE SERVEUR QUI LE DIT**
 * (PUBLIC + communauté co-membre, jamais FRIENDS-only) : un lecteur peut voir
 * ici moins de publications que dans son fil. Le doc-comment de
 * `hashtag-posts.ts` porte la raison.
 */

const modelsOf = (pages: readonly HashtagPage[]) => pages.flatMap((page) => page.posts);

export default function HashtagScreen() {
  const { tag } = useParams<'/hashtag/$tag'>();
  const canonical = normalizeHashtag(tag);
  const online = useOnline();
  const { languages: readerLanguages } = useReaderLanguages();
  const minute = useMinute();
  /* COMMENTER DEPUIS UN HASHTAG (#7113) — cet écran montait la MÊME carte que
     le Flux sans jamais porter `onComment` : son compteur de commentaires y
     retombait en `<span>` inerte, ce que la loi 4 rend correct et ce qui fait
     qu'aucun témoin ne rougissait. Le rappel vient du seul hôte des gestes
     d'une publication, comme les deux autres de la rangée. */
  const { announcement, onGesture, onShare, onComment, onRepost, menu } = usePostGesture();

  const page = useInfiniteQuery(hashtagInfiniteOptions({ ...apiDeps, tag: canonical }));

  const models = useMemo(
    () =>
      modelsOf(page.data?.pages ?? []).map((post) =>
        resolveFeedCardModel(post, { preferredLanguages: readerLanguages, now: new Date() }),
      ),
    // `minute` réévalue `new Date()` — même motif que `feed.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page.data, readerLanguages, minute],
  );

  return (
    <div data-hashtag={canonical} className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
        <Link
          to="feed"
          aria-label="Retour au fil"
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <Glyph name="caretLeft" size={20} />
        </Link>
        <h1 className="truncate text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          #{canonical}
        </h1>
      </header>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <main id="contenu" className="scrollbar-none flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-safe">
        {page.isPending ? (
          <div aria-busy="true" aria-label="Chargement des publications">
            <FeedSkeleton count={2} />
          </div>
        ) : page.isError ? (
          <div role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
            <span style={{ color: 'var(--color-error)' }}>
              <Glyph name="warningCircle" size={28} />
            </span>
            <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {online ? 'Impossible de charger ce mot-clé' : 'Hors ligne'}
            </p>
            <button
              type="button"
              onClick={() => void page.refetch()}
              className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
              style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
            >
              Réessayer
            </button>
          </div>
        ) : models.length === 0 ? (
          <div className="grid flex-1 content-center justify-items-center gap-2 px-8 text-center">
            <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              Rien sous #{canonical}
            </p>
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              Aucune publication visible ne porte ce mot-clé.
            </p>
          </div>
        ) : (
          <>
            {models.map((model) => (
              <FeedPostCard
                key={model.id}
                model={model}
                onGesture={onGesture}
                onShare={onShare}
                onComment={onComment}
                onRepost={onRepost}
                menu={menu}
                preferredLanguages={readerLanguages}
              />
            ))}
            {page.hasNextPage ? (
              <button
                type="button"
                onClick={() => void page.fetchNextPage()}
                disabled={page.isFetchingNextPage}
                className="mx-auto grid place-items-center rounded-chip px-5 text-body font-semibold"
                style={{ color: 'var(--color-ios-brand)', minHeight: 44 }}
              >
                {page.isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
              </button>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
