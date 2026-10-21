import { lazy, Suspense, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import { MoodPageBody, type MoodPageBanner } from '@/components/mood-page';
import { createDirectConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { publicProfileQueryOptions } from '@/lib/api/public-profile';
import { sendAction, usePost, useStatusMoods } from '@/lib/api/query';
import { appQueryClient } from '@/lib/api/query-client';
import { moodComposeText } from '@/lib/i18n-mood-compose-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { moodPageView } from '@/lib/mood/page-view';
import { cachedDirectWith, performMoodReply, type MoodReplyPorts } from '@/lib/mood/reply';
import { useDecorDesigns } from '@/lib/profile-decor/use-decor-designs';
import { useParams } from '@/lib/router';
import { useReadingSession } from '@/lib/view/reading-telemetry';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useViewer } from '@/lib/view/use-viewer';
import { href, navigate } from '@/routes/route-table';

/**
 * **`/mood/:id` — L'HUMEUR D'UN CONTACT, EN GRAND** (#10813) — ce qu'ouvre la
 * notification « nouvelle humeur » (`friend_new_mood`, `notifications/target.ts`
 * et son jumeau `public/sw-push.js`).
 *
 * L'adresse était celle du partage d'une humeur (#7313), servie par le détail
 * de publication : elle le reste pour un visiteur sans compte et pour une
 * publication qui n'est pas une humeur — même écran, chargé à la demande,
 * jamais réécrit. Un compte y lit la page de l'humeur (`MoodPageBody`).
 *
 * Cache-First : le corpus des humeurs (déjà servi pour la pastille du rail)
 * peint la page à l'instant ; le détail la confirme en fond. Aucun squelette
 * sur un cache non vide.
 */
const PostDetailScreen = lazy(() => import('@/routes/post'));

function PublicationFallback() {
  return (
    <Suspense fallback={null}>
      <PostDetailScreen />
    </Suspense>
  );
}

const closeMood = () => {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  navigate(href('list'), true);
};

export default function MoodScreen() {
  const { post: postId } = useParams<'/mood/$post'>();
  const viewer = useViewer();
  if (viewer.id === null || viewer.isAnonymous) return <PublicationFallback />;
  return <SignedInMood postId={postId} viewerId={viewer.id} />;
}

function SignedInMood({ postId, viewerId }: { readonly postId: string; readonly viewerId: string }) {
  const language = currentInterfaceLanguage();
  const post = usePost(postId);
  const moods = useStatusMoods();
  const { languages } = useReaderLanguages();
  const corpus = useMemo(() => moods.data?.find((entry) => entry.id === postId), [moods.data, postId]);
  const view = useMemo(() => moodPageView({ postId, post: post.data, corpus, languages }), [postId, post.data, corpus, languages]);

  const handle = view?.handle ?? '';
  const profile = useQuery({ ...publicProfileQueryOptions({ ...apiDeps, handle }), enabled: handle !== '' }, appQueryClient);
  const designs = useDecorDesigns(profile.data?.profile.decor);
  const banner = useMemo<MoodPageBanner>(
    () => ({ image: profile.data?.profile.banner ?? null, design: designs.banner, ring: designs.ring }),
    [profile.data?.profile.banner, designs.banner, designs.ring],
  );

  const mine = view?.authorId === viewerId;
  useReadingSession({
    postId: view?.postId,
    active: view !== null && view.isMood && !mine,
    contentType: 'STATUS',
    surface: 'status',
    impressionSource: null,
    openView: true,
  });

  const compose = useComposeLanguage({ preferred: languages });
  const ports = useMemo<MoodReplyPorts>(
    () => ({
      online: () => navigator.onLine,
      cachedDirect: (userId) => cachedDirectWith(appQueryClient, userId),
      openDirect: (userId) => createDirectConversation(apiDeps, userId),
      send: ({ conversationId, draft }) => sendAction({ conversationId, draft, viewerId, online: navigator.onLine }),
    }),
    [viewerId],
  );
  const authorId = view?.authorId ?? '';
  const replyLanguage = compose.language;
  const noteSent = compose.noteSent;
  const onSend = useCallback(
    async (text: string) => {
      const outcome = await performMoodReply({ mood: { postId, authorId }, text, language: replyLanguage, viewerId, ports });
      if (outcome.status === 'sent') noteSent();
      return outcome;
    },
    [postId, authorId, replyLanguage, viewerId, ports, noteSent],
  );

  if (view === null) return <MoodPlaceholder postId={postId} gone={post.isError} language={language} />;
  if (!view.isMood) return <PublicationFallback />;
  return (
    <MoodPageBody
      view={view}
      banner={banner}
      accent={authorAccentColor(view.authorId, view.authorName)}
      language={language}
      mine={mine}
      onClose={closeMood}
      onSend={onSend}
      onTextChange={compose.setText}
    />
  );
}

/** Rien à peindre encore : un fond neutre et, si la publication est introuvable, la phrase qui le dit. */
function MoodPlaceholder({ postId, gone, language }: { readonly postId: string; readonly gone: boolean; readonly language: ReturnType<typeof currentInterfaceLanguage> }) {
  return (
    <main
      data-mood-page={postId}
      data-mood-state={gone ? 'gone' : 'loading'}
      aria-busy={gone ? undefined : true}
      aria-label={moodComposeText(language, gone ? 'mood.page.gone' : 'mood.page.loading')}
      className="h-app fixed inset-x-0 top-0 grid place-items-center px-6 pt-safe text-center"
      style={{ backgroundColor: 'var(--color-ios-surface)', color: 'var(--color-ios-ink)' }}
    >
      {gone ? (
        <div className="grid justify-items-center gap-4">
          <p className="text-body">{moodComposeText(language, 'mood.page.gone')}</p>
          <button type="button" onClick={closeMood} className="glass min-h-11 rounded-full px-5 text-body font-semibold">
            {moodComposeText(language, 'mood.page.close')}
          </button>
        </div>
      ) : (
        <span aria-hidden="true" className="block size-28 animate-pulse rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)' }} />
      )}
    </main>
  );
}
