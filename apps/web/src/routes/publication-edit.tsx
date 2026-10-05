import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';

import { apiDeps } from '@/lib/api/deps';
import type { FeedPost } from '@/lib/api/feed-pages';
import { attachmentSrc } from '@/lib/api/media-url';
import { editPost } from '@/lib/api/publication-actions';
import { usePost } from '@/lib/api/query';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useParams } from '@/lib/router';
import { studioEditHydration, type StudioEditHydration } from '@/lib/stories/studio-edit';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { href, navigate } from '@/routes/route-table';
import StoryComposeScreen from '@/routes/story-compose';
import { StudioShell } from '@/routes/story-compose-shell';

/** La feuille de texte, à la demande — le repli des publications que le
 * studio ne porte pas (texte seul, republication, objet inconnu). */
const PublicationEditSheet = lazy(() => import('@/components/publication-edit-sheet').then((m) => ({ default: m.PublicationEditSheet })));

/**
 * **MODIFIER UNE PUBLICATION** (#9317) — `/posts/:id/edit` rouvre le STUDIO
 * sur la publication : ses scènes redeviennent des pages, ses médias
 * reviennent prêts, et l'auteur y modifie, AJOUTE (+) et SUPPRIME des scènes
 * comme à la création ; la capsule dit « Enregistrer ».
 *
 * **CACHE-FIRST** : `usePost` sert la carte que le fil (ou le détail) tient
 * déjà — l'écran s'ouvre sans squelette ; seule une adresse ouverte à froid
 * attend le réseau. Le brouillon est hydraté UNE fois, à la première donnée :
 * une revalidation en fond ne réécrit jamais ce que l'auteur est en train de
 * modifier.
 *
 * **LE REPLI EST LA FEUILLE DE TEXTE** (`publication-edit-sheet.tsx`) : une
 * publication que le studio ne sait pas porter sans rien perdre
 * (`studioEditHydration` → `unsupported`) s'y modifie comme avant — un post
 * de texte seul n'a pas de scène à poser. Le menu « ⋯ » d'une carte ouvre
 * déjà la feuille sans passer par ici pour un post de texte ; l'adresse,
 * elle, peut être ouverte directement, et le repli lui répond aussi.
 *
 * Enregistrer ou abandonner REVIENT d'où l'auteur venait (`history.back`), ou,
 * ouvert à froid, sur la publication (le détail, ou « Mes stories »).
 */
export function PublicationEditView({ postId }: { readonly postId: string }) {
  const lang = currentInterfaceLanguage();
  const session = useStore(sessionStore, (s) => s.session);
  const viewerId = session.status === 'authenticated' ? session.user.id : null;
  const reader = useReaderLanguages();
  const query = usePost(postId);
  const hydrate = (post: FeedPost): StudioEditHydration =>
    studioEditHydration({ post, viewerId, resolveUrl: attachmentSrc, language: reader.languages[0] ?? 'fr' });
  const [hydration, setHydration] = useState<StudioEditHydration | null>(() => (query.data === undefined ? null : hydrate(query.data)));
  useEffect(() => {
    if (hydration === null && query.data !== undefined) setHydration(hydrate(query.data));
    // `hydrate` ne lit que des valeurs de session : l'hydratation est figée à la première donnée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydration, query.data]);

  const kind = hydration?.kind === 'studio' ? hydration.origin.kind : 'POST';
  const leave = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate(kind === 'STORY' ? href('storiesMine') : href('post', { post: postId }), true);
  }, [kind, postId]);

  if (hydration === null) {
    return (
      <StudioShell kind="POST" origin={null}>
        <div aria-busy={!query.isError} className="grid flex-1 place-items-center px-6 text-center">
          {query.isError ? (
            <p role="alert" style={{ color: 'var(--color-error)' }}>
              {translate(lang, 'story.studio.failure.unavailable')}
            </p>
          ) : null}
        </div>
      </StudioShell>
    );
  }

  if (hydration.kind === 'unsupported') {
    const post = query.data;
    return (
      <StudioShell kind="POST" origin={null}>
        {post !== undefined && hydration.reason !== 'not-author' ? (
          <Suspense fallback={null}>
            <PublicationEditSheet
              postId={postId}
              original={post.content ?? ''}
              originalLanguage={post.originalLanguage ?? ''}
              onSave={(id, content) => editPost({ postId: id, content, deps: { ...apiDeps, queryClient: appQueryClient } })}
              onClose={leave}
            />
          </Suspense>
        ) : null}
      </StudioShell>
    );
  }

  return <StoryComposeScreen initialKind={hydration.origin.kind} edit={{ draft: hydration.draft, origin: hydration.origin, onSaved: leave, onCancel: leave }} />;
}

export default function PublicationEditScreen() {
  const { post } = useParams<'/posts/$post/edit'>();
  return <PublicationEditView key={post} postId={post} />;
}
