'use client';

import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useI18n } from '@/hooks/use-i18n';
import { Button, useToast, PostCard, StoryTray, StatusBar, StoryViewer, StoryComposer } from '@/components/v2';
import type { StoryVisibility } from '@/components/v2';
import { Dialog, DialogBody, DialogHeader } from '@/components/v2/Dialog';
import { PostEditor } from '@/components/v2/PostEditor';
import { RepostModal } from '@/components/v2/RepostModal';
import { Skeleton } from '@/components/v2/Skeleton';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';
import type { ComposerDoor } from '@/lib/composer-door';
import type { ComposerDocumentPayload as PostPublishPayload } from '@/components/composer/payload';
import type { ComposerStatusPayload } from '@/components/composer/ComposerMoodSurface';

// Stories
import { useStoriesFeedQuery, useCreateStoryMutation, useDeleteStoryMutation, useRecordStoryViewMutation } from '@/hooks/social/use-stories';
import { useStoriesRealtime } from '@/hooks/social/use-stories-realtime';
import { postToStoryData, groupStoriesByAuthor, groupToStoryItem, postBackgroundSound } from '@/lib/story-transforms';
import { useStoryPreferences } from '@/stores/user-preferences-store';

// Statuses / moods (real API — STATUS posts, real-time via usePostSocketCacheSync)
import { useStatusesFeedQuery, useStatusesList, useCreateStatusMutation } from '@/hooks/social/use-statuses';
import { postToStatusItem } from '@/lib/status-transforms';

// Posts (real API integration — same hooks as v2)
import { useFeedQuery, useFeedPosts, usePrefetchPost } from '@/hooks/queries/use-feed-query';
import { useCreatePostMutation, useLikePostMutation, useUnlikePostMutation, useBookmarkPostMutation, useUnbookmarkPostMutation, useTranslatePostMutation, useDeletePostMutation, usePinPostMutation, useRepostMutation, useUpdatePostMutation } from '@/hooks/queries/use-post-mutations';
import { useCreateCommentMutation } from '@/hooks/queries/use-comment-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePreferredLanguage, usePreferredLanguages } from '@/hooks/use-post-translation';
import { useImpressionTracking } from '@/hooks/use-impression-tracking';

import { useAuthStore } from '@/stores/auth-store';
import { reportService } from '@/services/report.service';
import { postsService } from '@/services/posts.service';
import type { Post, PostType, PostVisibility } from '@meeshy/shared/types/post';
import { repostTargetId } from '@meeshy/shared/utils/repost-target';
import type { PostReferenceInput } from '@meeshy/shared/types/post-reference';
import { classifyRelativeTime } from '@meeshy/shared/utils/relative-time';
import { shareLink } from '@/lib/share-utils';

// ─── Portes du meuble (Task W7) ─────────────────────────────────────────
//
// Identités STABLES, hors composant : `MeeshyComposer` re-sème son format
// quand la CLÉ de la porte change (`doorKeyOf`, `MeeshyComposer.tsx`), qui
// ne dépend que de `door.kind` — recréer l'objet à chaque rendu n'aurait
// donc aucun effet fonctionnel, mais le hisser au module dit, en le lisant,
// qu'aucun état de CET écran ne doit jamais faire varier ces deux portes.
const FEED_COMPOSER_DOOR: ComposerDoor = { kind: 'feedComposer' };
const MOOD_DOOR: ComposerDoor = { kind: 'moodChip' };

/**
 * La coquille du mood appartient à l'HÔTE : `ComposerMoodSurface` ne peint
 * aucun titre, là où `StatusComposer` peignait le sien. Sans cet identifiant
 * relié par `aria-labelledby`, le `role="dialog"` n'aurait AUCUN nom
 * accessible — et `statusComposer.title`, traduite dans les quatre
 * catalogues, n'aurait plus aucun site de rendu.
 */
const MOOD_DIALOG_TITLE_ID = 'mood-composer-title';

// ─── Helpers ────────────────────────────────────────────────────────────

type TFunc = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string;

function formatRelativeTime(date: string | Date, t: TFunc): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // beyondDays: Infinity → always falls in now/minutes/hours/days (no absolute date tail).
  const bucket = classifyRelativeTime(d.getTime(), Date.now(), { beyondDays: Infinity });
  if (bucket.unit === 'now') return t('time.now', 'Just now');
  if (bucket.unit === 'minutes') return t('time.minutes', { count: bucket.value });
  if (bucket.unit === 'hours') return t('time.hours', { count: bucket.value });
  const days = bucket.unit === 'days' ? bucket.value : Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return t('time.days', { count: days });
}

function postToTranslations(post: Post) {
  if (!post.translations || typeof post.translations !== 'object') return [];
  return Object.entries(post.translations as Record<string, { text?: string }>)
    .filter(([, v]) => v && typeof v.text === 'string')
    .map(([lang, v]) => ({
      languageCode: lang,
      languageName: lang.toUpperCase(),
      content: v.text!,
    }));
}

// ─── Feed tabs ───────────────────────────────────────────────────────────────

/**
 * Posts ⇆ Reels segmented switcher, rendered at the top of the posts feed so
 * the two `/feed/*` surfaces are mutually discoverable. Uses real links for
 * SEO / middle-click / a11y rather than client-only navigation.
 */
export function FeedTabs({ active }: { active: 'posts' | 'reels' }) {
  const { t } = useI18n('feed');
  const base =
    'flex-1 text-center text-sm font-medium rounded-full px-4 py-2 transition-colors';
  const on = 'bg-[var(--gp-terracotta)] text-white';
  const off = 'text-[var(--gp-text-muted)] hover:text-[var(--gp-text-primary)]';
  return (
    <nav aria-label={t('tabs.label', 'Feed type')} className="mb-6">
      <div className="flex gap-1 rounded-full bg-[var(--gp-surface)] border border-[var(--gp-border)] p-1">
        <Link
          href="/feed/posts"
          aria-current={active === 'posts' ? 'page' : undefined}
          className={`${base} ${active === 'posts' ? on : off}`}
        >
          {t('tabs.posts', 'Posts')}
        </Link>
        <Link
          href="/feed/reels"
          aria-current={active === 'reels' ? 'page' : undefined}
          className={`${base} ${active === 'reels' ? on : off}`}
        >
          {t('tabs.reels', 'Reels')}
        </Link>
      </div>
    </nav>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

/**
 * PostsFeedScreen — the iOS-parity "posts" feed: a scrolling list of post /
 * reel cards, preceded by the public story tray and the mood/status bar, with
 * inline composers. Mounted at the canonical `/feed/posts` route and the
 * legacy `/feeds` alias.
 *
 * Accessibility: a single `<main>` landmark with a labelled heading, each
 * content zone wrapped in a labelled `<section>`, every post rendered as an
 * `<article>`, and live regions (`aria-live="polite"`) for the "updating" and
 * "new posts" hints.
 */
export function PostsFeedScreen() {
  const router = useRouter();
  const { t } = useI18n('feed');
  const toastCtx = useToast();
  const showToast = useCallback(
    (title: string, type: 'success' | 'error' | 'info', description?: string) =>
      toastCtx.addToast(title || description || '', type),
    [toastCtx],
  );

  // Auth & language
  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? '';
  const userLanguage = usePreferredLanguage();
  const preferredLanguages = usePreferredLanguages();
  const { preferences: storyPrefs } = useStoryPreferences();

  // ─── Posts ────────────────────────────────────────────────────────────
  const feedQuery = useFeedQuery();
  const posts = useFeedPosts(feedQuery);
  const prefetchPost = usePrefetchPost();

  /**
   * Cache-state classification mirroring iOS' `CacheResult<T>`
   * (.fresh / .stale / .empty). The thresholds are deliberately loose:
   * < 30s = fresh (no UI hint), ≥ 30s = stale (silent revalidate + label),
   * no data = empty (skeleton). Keeping this co-located with the
   * `isFetching` check lets us draw the "Updating…" pill only when the
   * data on screen is genuinely older than the current refetch.
   */
  const cacheState: 'fresh' | 'stale' | 'empty' = useMemo(() => {
    if (!feedQuery.data) return 'empty';
    const ageSec = (Date.now() - feedQuery.dataUpdatedAt) / 1000;
    return ageSec < 30 ? 'fresh' : 'stale';
  }, [feedQuery.data, feedQuery.dataUpdatedAt]);

  usePostSocketCacheSync();

  // Impression reporting: each post card that scrolls into view is recorded
  // once per session and batched to the gateway (source: 'feed').
  const { observe: observeImpression } = useImpressionTracking({ source: 'feed' });

  // Post mutations
  const createPostMutation = useCreatePostMutation();
  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  const translateMutation = useTranslatePostMutation();
  const deletePostMutation = useDeletePostMutation();
  const pinPostMutation = usePinPostMutation();
  const repostMutation = useRepostMutation();
  const updatePostMutation = useUpdatePostMutation();

  // Edit + Repost + Audio modals
  const [editingPost, setEditingPost] = useState<
    { id: string; content: string; visibility: PostVisibility; visibilityUserIds: readonly string[] } | null
  >(null);
  /**
   * Le `type` est transporté DÈS l'ouverture de la modale : la loi du miroir
   * exige le format de la source au moment d'envoyer, et le retrouver plus tard
   * demanderait de re-chercher le post dans le fil — qui a pu bouger entretemps.
   *
   * Il est REQUIS, et non optionnel : c'est précisément en le laissant absent de
   * cet état que les deux gestes ont émis `undefined` puis rien, et que le fil a
   * fabriqué des POST à partir de réels. Requis, la construction ne peut plus
   * l'oublier — le compilateur tient la loi à la place de la relecture.
   *
   * `targetId` se nomme ainsi parce qu'il n'est PAS l'id de la carte : c'est la
   * racine de sa chaîne de reposts (`repostTargetId`), résolue à l'ouverture
   * pour la même raison que le format. Le nommer `id` ferait mentir la lecture.
   */
  const [repostingPost, setRepostingPost] = useState<
    { targetId: string; author?: string; content?: string; type: PostType } | null
  >(null);
  // Task W7 — le bouton rond du fil n'ouvre plus un dialogue audio séparé :
  // il ARME l'outil micro de `MeeshyComposer` (`armCaptureToken`). Un JETON,
  // pas un booléen — refermer le panneau puis re-taper le bouton doit le
  // RÉ-ouvrir, ce qu'un `true` déjà `true` ne redéclenche jamais. `undefined`
  // ⇒ jamais armé (état initial, avant tout tap).
  const [captureArmToken, setCaptureArmToken] = useState<number | undefined>(undefined);
  // Le jeton se CONSOMME dès que l'outil l'a servi. Sans cet effacement il
  // reste posé pour toute la vie de l'écran, et comme l'outil n'est monté que
  // sous l'expansion de la surface, chacun de ses remontages (publier replie
  // la surface ; changer de format la démonte) rouvrait le panneau
  // d'enregistrement que personne n'avait redemandé. Repasser par `undefined`
  // ne coûte rien au ré-armement : le tap suivant repose `1`, et `undefined →
  // 1` est bien un changement de valeur.
  const handleCaptureArmed = useCallback(() => setCaptureArmToken(undefined), []);

  // Constat 2 (F7c) — état muet du lecteur LOCAL du badge B3.3-6, par post
  // (la carte ne possède aucun lecteur : ce bouton reste cosmétique tant que
  // la résolution d'URL de son web n'existe pas — dette explicite, plan F3).
  // Démarre MUTED, comme `StoryViewer` (`isBackgroundSoundMuted`).
  const [unmutedBackgroundSoundPostIds, setUnmutedBackgroundSoundPostIds] = useState<Set<string>>(new Set());
  const toggleBackgroundSoundMute = useCallback((postId: string) => {
    setUnmutedBackgroundSoundPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  // New posts banner
  const [newPostsCount, setNewPostsCount] = useState(0);
  const prevPostsLengthRef = useRef(posts.length);

  useEffect(() => {
    if (posts.length > prevPostsLengthRef.current && prevPostsLengthRef.current > 0) {
      setNewPostsCount((c) => c + (posts.length - prevPostsLengthRef.current));
    }
    prevPostsLengthRef.current = posts.length;
  }, [posts.length]);

  // Infinite scroll sentinel
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
          feedQuery.fetchNextPage();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

  // ─── Stories ──────────────────────────────────────────────────────────
  const { data: stories, isLoading: storiesLoading } = useStoriesFeedQuery();
  const createStoryMutation = useCreateStoryMutation();
  const deleteStoryMutation = useDeleteStoryMutation();
  const { recordView } = useRecordStoryViewMutation();
  useStoriesRealtime();

  // Statuses / moods — real STATUS posts. Real-time refresh is handled by
  // usePostSocketCacheSync (mounted below), which invalidates the same key on
  // status:created / updated / deleted / reacted.
  const statusesQuery = useStatusesFeedQuery();
  const statuses = useStatusesList(statusesQuery);
  const createStatusMutation = useCreateStatusMutation();

  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [activeStoryAuthorId, setActiveStoryAuthorId] = useState<string | null>(null);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const viewedStoryIdsRef = useRef(new Set<string>());

  // One tray bubble per author: collapse each author's stories into a single
  // group, preserving first-appearance order.
  const storyGroups = useMemo(
    () => Array.from(groupStoriesByAuthor(stories ?? []).values()),
    [stories],
  );

  const storyItems = useMemo(
    () => storyGroups.map((group) => groupToStoryItem(group, currentUserId, viewedStoryIdsRef.current)),
    [storyGroups, currentUserId],
  );

  const statusItems = useMemo(
    () => statuses.map((status) => postToStatusItem(status, currentUserId)),
    [statuses, currentUserId],
  );

  // The viewer is scoped to the tapped author's stories only.
  const activeStoryData = useMemo(() => {
    if (!activeStoryAuthorId) return [];
    const group = storyGroups.find((g) => g[0]?.authorId === activeStoryAuthorId);
    return group ? group.map(postToStoryData) : [];
  }, [activeStoryAuthorId, storyGroups]);

  // PostService.repostPost (gateway) 403s on any non-PUBLIC original. Stories
  // now DEFAULT to PUBLIC (règle produit 2026-08-23,
  // DEFAULT_PUBLICATION_VISIBILITY) but the author can still narrow the
  // audience per story — the "Republier" entry stays withheld unless every
  // story in the open session is PUBLIC, or it fails into "Couldn't repost".
  const activeStoryGroupIsRepostable = useMemo(() => {
    if (!activeStoryAuthorId) return false;
    const group = storyGroups.find((g) => g[0]?.authorId === activeStoryAuthorId);
    return !!group && group.every((p) => p.visibility === 'PUBLIC');
  }, [activeStoryAuthorId, storyGroups]);

  const handleStoryPress = useCallback(
    (groupId: string) => {
      const group = storyGroups.find((g) => g[0]?.authorId === groupId);
      if (!group || group.length === 0) return;
      const firstUnviewed = group.findIndex((p) => !viewedStoryIdsRef.current.has(p.id));
      setActiveStoryAuthorId(groupId);
      setStoryViewerIndex(firstUnviewed >= 0 ? firstUnviewed : 0);
      setStoryViewerOpen(true);
    },
    [storyGroups],
  );

  const handleStoryPublish = useCallback(
    (story: {
      content?: string;
      storyEffects: Record<string, unknown>;
      visibility: StoryVisibility;
      visibilityUserIds?: string[];
      mediaIds?: string[];
      mentions?: readonly PostReferenceInput[];
    }) => {
      setStoryComposerOpen(false);
      createStoryMutation.mutate(
        {
          content: story.content,
          storyEffects: story.storyEffects,
          visibility: story.visibility,
          visibilityUserIds: story.visibilityUserIds,
          mediaIds: story.mediaIds,
          // F5 correction — `originalLanguage` is NOT `userLanguage` (the
          // reader's preferred READ language, `usePreferredLanguage()`):
          // that's the wrong concept for the language the author just wrote
          // the story in. `storyService.createStory` resolves the right
          // value itself, from the active UI locale.
          ...(story.mentions ? { mentions: story.mentions } : {}),
        },
        {
          onSuccess: () => {
            const mediaCount = story.mediaIds?.length ?? 0;
            const desc = mediaCount > 0
              ? t('toast.storyVisibleFriendsMedia', { count: mediaCount })
              : t('toast.storyVisibleFriends', 'Your story is visible to your friends.');
            showToast(t('toast.storyPublished', 'Story published!'), 'success', desc);
          },
          onError: () => showToast(t('toast.error', 'Error'), 'error', t('toast.storyPublishError', "Couldn't publish the story.")),
        },
      );
    },
    [createStoryMutation, showToast, t],
  );

  const handleStoryView = useCallback(
    (storyId: string) => {
      viewedStoryIdsRef.current.add(storyId);
      recordView(storyId);
    },
    [recordView],
  );

  const handleStoryDelete = useCallback(
    (storyId: string) => {
      deleteStoryMutation.mutate(storyId, {
        onSuccess: () => showToast(t('toast.storyDeleted', 'Story deleted'), 'success'),
        onError: () => showToast(t('toast.error', 'Error'), 'error', t('toast.storyDeleteError', "Couldn't delete the story.")),
      });
    },
    [deleteStoryMutation, showToast, t],
  );

  const handleShareStory = useCallback(
    async (storyId: string) => {
      const story = activeStoryData.find((s) => s.id === storyId);
      const localUrl = `${window.location.origin}/story/${storyId}`;
      const title = story?.author.name ?? 'Meeshy';
      const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
      try {
        const { shortUrl } = await postsService.sharePost(storyId, { generateLink: true });
        const shared = await shareLink(shortUrl ?? localUrl, title, story?.content ?? '');
        if (shared) {
          showToast(t('toast.shared', 'Shared!'), 'success');
        } else if (!hasNativeShare) {
          showToast(t('toast.linkCopied', 'Link copied!'), 'success');
        }
        // else: native share sheet dismissed — nothing was copied, no toast
      } catch {
        showToast(t('toast.error', 'Error'), 'error', t('toast.shareError', "Couldn't share the story."));
      }
    },
    [activeStoryData, showToast, t],
  );

  /**
   * Loi du miroir (directive 2026-08-23). Second site éphémère du web, avec la
   * page `/story/[postId]` : sans `targetType`, le gateway retombait sur
   * `?? POST` et repartager une story depuis le tray du fil fabriquait un post
   * PERMANENT. Le miroir et l'ancrage partent ensemble — livrer le premier seul
   * donnerait 20 h là où l'on obtenait du définitif, sans recours.
   */
  const repostStory = useCallback(
    (storyId: string, targetType: PostType) => {
      // La scène VUE, jamais la racine de sa chaîne — même règle que le viewer
      // de la page `/story/[postId]` et que le jumeau iOS
      // (`StoryViewerView.repostAsPostDirect` envoie `story.id`, quand les
      // surfaces de CARTE passent par `RepostTargeting`) : une source éphémère
      // est recopiée dans son repost, donc autonome, et grimper vers une
      // racine dont l'échéance est passée ferait échouer le geste.
      repostMutation.mutate(
        { postId: storyId, data: { isQuote: false, targetType } },
        {
          onSuccess: () => showToast(t('toast.reposted', 'Reposted!'), 'success'),
          onError: () => showToast(t('toast.error', 'Error'), 'error'),
        },
      );
    },
    [repostMutation, showToast, t],
  );

  /** Le miroir — la story repartagée reste éphémère. */
  const handleRepostStory = useCallback(
    (storyId: string) => repostStory(storyId, 'STORY'),
    [repostStory],
  );

  /** L'ANCRAGE — « garder ça pour de bon ». */
  const handleRepostStoryAsPost = useCallback(
    (storyId: string) => repostStory(storyId, 'POST'),
    [repostStory],
  );

  const handleStoryViewerClose = useCallback(() => {
    setStoryViewerOpen(false);
    setActiveStoryAuthorId(null);
  }, []);
  const handleStoryComposerClose = useCallback(() => setStoryComposerOpen(false), []);

  const createCommentMutation = useCreateCommentMutation();
  const handleStoryReply = useCallback(
    (storyId: string, text: string) => {
      createCommentMutation.mutate(
        { postId: storyId, content: text },
        {
          onSuccess: () => showToast('Réponse envoyée', 'success'),
          onError: () => showToast('Erreur', 'error', 'Impossible d\'envoyer la réponse'),
        }
      );
    },
    [createCommentMutation, showToast],
  );

  // ─── Post handlers ────────────────────────────────────────────────────

  const handlePublish = useCallback(
    (data: PostPublishPayload) => {
      createPostMutation.mutate(
        {
          content: data.content || undefined,
          type: data.type,
          visibility: data.visibility,
          visibilityUserIds: data.visibilityUserIds,
          mediaIds: data.mediaIds,
          optimisticMedia: data.optimisticMedia,
          ...(data.mentions ? { mentions: data.mentions } : {}),
          // C7-UI — les deux champs d'accessibilité collectés par
          // `MediaAccessibilityFields` (monté par `ComposerDocumentSurface`
          // depuis W7 ; `PostComposer` ne l'est plus par cet écran) meurent ici
          // s'ils ne sont pas relayés : le transport les accepte déjà
          // (`CreatePostRequest.mediaAlt` / `.allowSoundExtraction`,
          // `apps/web/services/posts.service.ts`), mais rien ne les portait
          // du composer jusqu'à la mutation. Relais CONDITIONNEL des deux
          // côtés : `mediaAlt` absent (jamais `{}`) quand aucun texte n'a été
          // saisi, `allowSoundExtraction` absent (jamais `false`) tant que
          // l'auteur n'a pas touché l'interrupteur — un `false` fabriqué
          // écraserait un choix serveur que personne n'a révoqué.
          ...(data.mediaAlt ? { mediaAlt: data.mediaAlt } : {}),
          ...(data.allowSoundExtraction === undefined
            ? {}
            : { allowSoundExtraction: data.allowSoundExtraction }),
        },
        {
          onSuccess: () => showToast(t('toast.postPublished', 'Published!'), 'success', t('toast.postPublishedDesc', 'Your post has been shared.')),
          onError: () => showToast(t('toast.error', 'Error'), 'error', t('toast.postPublishError', "Couldn't publish the post.")),
        },
      );
    },
    [createPostMutation, showToast, t],
  );

  const handleLike = useCallback(
    (postId: string, isCurrentlyLiked: boolean) => {
      if (isCurrentlyLiked) {
        unlikeMutation.mutate({ postId });
      } else {
        likeMutation.mutate({ postId });
      }
    },
    [likeMutation, unlikeMutation],
  );

  const handleReact = useCallback(
    (postId: string, emoji: string, currentUserReactions: readonly string[]) => {
      if (currentUserReactions.includes(emoji)) {
        unlikeMutation.mutate({ postId, emoji });
      } else {
        likeMutation.mutate({ postId, emoji });
      }
    },
    [likeMutation, unlikeMutation],
  );

  const handleComment = useCallback(
    (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      if (post?.type === 'REEL') {
        router.push(`/reel/${postId}`);
      } else {
        router.push(`/feeds/post/${postId}`);
      }
    },
    [router, posts],
  );

  const handleShare = useCallback(
    async (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      const localUrl =
        post?.type === 'REEL'
          ? `${window.location.origin}/reel/${postId}`
          : `${window.location.origin}/feeds/post/${postId}`;
      const title = post?.author?.displayName ?? post?.author?.username ?? 'Meeshy';

      const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
      try {
        const { shortUrl } = await postsService.sharePost(postId, { generateLink: true });
        const shared = await shareLink(shortUrl ?? localUrl, title, post?.content ?? '');
        if (shared) {
          showToast(t('toast.shared', 'Shared!'), 'success');
        } else if (!hasNativeShare) {
          showToast(t('toast.linkCopied', 'Link copied!'), 'success');
        }
        // else: native share sheet dismissed — nothing was copied, no toast
      } catch {
        showToast(t('toast.error', 'Error'), 'error', t('toast.linkCopyError', "Couldn't share the post."));
      }
    },
    [showToast, posts, t],
  );

  const handleBookmark = useCallback(
    (postId: string, isCurrentlyBookmarked: boolean) => {
      if (isCurrentlyBookmarked) {
        unbookmarkMutation.mutate(postId);
      } else {
        bookmarkMutation.mutate(postId);
      }
    },
    [bookmarkMutation, unbookmarkMutation],
  );

  const handleTranslate = useCallback(
    (postId: string) => translateMutation.mutate({ postId, targetLanguage: userLanguage }),
    [translateMutation, userLanguage],
  );

  const handleDownloadMedia = useCallback((postId: string, mediaId: string) => {
    postsService.recordMediaDownloads(postId, [mediaId], 'feed');
  }, []);

  const handleDeletePost = useCallback(
    (postId: string) => {
      deletePostMutation.mutate(postId, {
        onSuccess: () => showToast(t('toast.postDeleted', 'Post deleted'), 'success'),
      });
    },
    [deletePostMutation, showToast, t],
  );

  const handleReportPost = useCallback(
    (postId: string) => {
      if (!window.confirm(t('post.reportConfirm', 'Report this post?'))) return;
      reportService
        .reportPost(postId, 'inappropriate', '')
        .then(() => showToast(t('toast.postReported', 'Post reported'), 'success'))
        .catch(() => showToast(t('toast.error', 'Error'), 'error', t('toast.reportError', "Couldn't report the post.")));
    },
    [showToast, t],
  );

  const handleReportStory = useCallback(
    (storyId: string) => {
      if (!window.confirm(t('story.reportConfirm', 'Report this story?'))) return;
      reportService
        .reportStory(storyId, 'inappropriate', '')
        .then(() => showToast(t('toast.storyReported', 'Story reported'), 'success'))
        .catch(() => showToast(t('toast.error', 'Error'), 'error', t('toast.reportError', "Couldn't report the story.")));
    },
    [showToast, t],
  );

  const handlePinPost = useCallback(
    (postId: string, isPinned: boolean) => pinPostMutation.mutate({ postId, pin: !isPinned }),
    [pinPostMutation],
  );

  const handleEditPost = useCallback(
    (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      if (post) {
        setEditingPost({
          id: post.id,
          content: post.content ?? '',
          visibility: post.visibility,
          visibilityUserIds: post.visibilityUserIds ?? [],
        });
      }
    },
    [posts],
  );

  const handleSaveEdit = useCallback(
    (data: { content: string; visibility: PostVisibility; visibilityUserIds: string[] }) => {
      if (!editingPost) return;
      updatePostMutation.mutate(
        {
          postId: editingPost.id,
          data: {
            content: data.content,
            visibility: data.visibility,
            visibilityUserIds: data.visibilityUserIds,
          },
        },
        {
          onSuccess: () => {
            setEditingPost(null);
            showToast(t('toast.postEdited', 'Post edited'), 'success');
          },
          onError: () => showToast(t('toast.error', 'Error'), 'error'),
        },
      );
    },
    [editingPost, updatePostMutation, showToast, t],
  );

  const handleRepostOpen = useCallback(
    (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      if (post)
        setRepostingPost({
          targetId: repostTargetId(post),
          author: post.author?.displayName ?? post.author?.username,
          content: post.content ?? undefined,
          type: post.type,
        });
    },
    [posts],
  );

  const handleRepost = useCallback(() => {
    if (!repostingPost) return;
    repostMutation.mutate(
      // Loi du miroir : le format suit la CARTE. Le fil sert POST **et** REEL,
      // donc le changement est bien observable — sans ce champ, reposter un réel
      // depuis le fil fabriquait un POST et le sortait du fil des réels.
      { postId: repostingPost.targetId, data: { isQuote: false, targetType: repostingPost.type } },
      {
        onSuccess: () => {
          setRepostingPost(null);
          showToast(t('toast.reposted', 'Reposted!'), 'success');
        },
        onError: () => showToast(t('toast.error', 'Error'), 'error'),
      },
    );
  }, [repostingPost, repostMutation, showToast, t]);

  const handleQuote = useCallback(
    (content: string) => {
      if (!repostingPost) return;
      repostMutation.mutate(
        // La citation publie autant que le repost sec : elle porte la même loi.
        // Les sites réel et post l'envoient déjà sur leurs DEUX gestes.
        { postId: repostingPost.targetId, data: { content, isQuote: true, targetType: repostingPost.type } },
        {
          onSuccess: () => {
            setRepostingPost(null);
            showToast(t('toast.quoted', 'Quoted!'), 'success');
          },
          onError: () => showToast(t('toast.error', 'Error'), 'error'),
        },
      );
    },
    [repostingPost, repostMutation, showToast, t],
  );

  const handleDismissNewPosts = useCallback(() => {
    setNewPostsCount(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Task W7 — le micro n'est plus un dialogue séparé avec son PROPRE service
  // d'upload en deux temps : c'est désormais un OUTIL de
  // `ComposerDocumentSurface`, dont le fichier produit entre dans le MÊME
  // pool que photo/vidéo (`useAttachmentUpload`). Le fichier publie donc par
  // `handlePublish`, comme n'importe quel autre média — l'ancien relais audio
  // n'a plus de raison d'exister, et avec lui les deux champs qu'il posait
  // (transcription mobile, langue d'origine devinée) : `ComposerDocumentPayload`
  // ne les déclare plus (voir la note « Aucune langue d'origine n'y figure »
  // de `components/composer/payload.ts`).
  //
  // DETTE SOLDÉE (lot W7bis, 2026-08-25) — cette note décrivait le défaut
  // inverse ; elle est conservée au PASSÉ pour que la prochaine lecture ne
  // rouvre pas la question. `useAttachmentUpload` passait par
  // `POST /attachments/upload`, qui crée des `MessageAttachment`, pendant que
  // `PostService.createPost` ne réclame que des `PostMedia` : aucun média
  // n'était rattaché et aucune transcription ne partait. Le correctif est
  // dans le TRANSPORT, comme annoncé : `services/attachmentTransport.ts`
  // résout un `uploadContext` en transport, et `ComposerDocumentSurface`
  // déclare `uploadContext: 'post'`. Le fichier voyage donc par TUS
  // (`uploadcontext: 'post'` → `isPostMediaUploadContext` →
  // `prisma.postMedia.create`), `mediaIds` désigne bien des `PostMedia`, et
  // `postMedia.findFirst({ mimeType: { startsWith: 'audio/' } })` déclenche
  // Whisper — `ComposerDocumentPayload` ne porte AUCUN `mobileTranscription`,
  // donc la condition `audioMedia && !data.mobileTranscription` est vraie.

  // ─── Status / mood ────────────────────────────────────────────────────
  const [statusComposerOpen, setStatusComposerOpen] = useState(false);

  const handleStatusPress = useCallback(
    (statusId: string) => showToast(t('toast.status', 'Status'), 'info', t('toast.statusSelected', { id: statusId })),
    [showToast, t],
  );

  const handleStatusPublish = useCallback(
    (status: ComposerStatusPayload) => {
      setStatusComposerOpen(false);
      createStatusMutation.mutate(
        {
          moodEmoji: status.moodEmoji,
          content: status.content,
          originalLanguage: userLanguage,
          visibility: status.visibility,
          ...(status.visibilityUserIds ? { visibilityUserIds: status.visibilityUserIds } : {}),
          ...(status.mentions ? { mentions: status.mentions } : {}),
        },
        {
          onSuccess: () =>
            showToast(t('toast.moodPublished', 'Mood published!'), 'success', `${status.moodEmoji} ${status.content || ''}`),
          onError: () => showToast(t('toast.moodPublishError', "Couldn't publish your mood"), 'error'),
        },
      );
    },
    [createStatusMutation, showToast, t, userLanguage],
  );

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <DashboardLayout title={t('title', 'Feed')} className="!max-w-none !px-0">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="sr-only">{t('srHeading', 'News feed — posts, reels and stories')}</h1>
        <FeedTabs active="posts" />

        {/* Story Tray */}
        <section aria-label={t('sections.stories', 'Public stories')}>
          <h2 className="sr-only">{t('sections.storiesShort', 'Stories')}</h2>
          <StoryTray
            stories={storyItems}
            onStoryPress={handleStoryPress}
            onAddStory={() => setStoryComposerOpen(true)}
            isLoading={storiesLoading}
            className="mb-4"
          />
        </section>

        {/* Status Bar */}
        <section aria-label={t('sections.moods', 'Moods')}>
          <h2 className="sr-only">{t('sections.moods', 'Moods')}</h2>
          <StatusBar
            statuses={statusItems}
            onStatusPress={handleStatusPress}
            onAddStatus={() => setStatusComposerOpen(true)}
            userLanguage={userLanguage}
            preferredLanguages={preferredLanguages}
            isLoading={statusesQuery.isLoading}
            className="mb-6"
          />
        </section>

        {/* Post Composer */}
        <section aria-label={t('sections.compose', 'Compose a post')}>
          <h2 className="sr-only">{t('sections.compose', 'Compose a post')}</h2>
          <div className="flex gap-3 items-start mb-6">
            <div className="flex-1">
              <MeeshyComposer
                door={FEED_COMPOSER_DOOR}
                currentUser={currentUser ? { username: currentUser.username, avatar: currentUser.avatar } : null}
                onPublish={handlePublish}
                /* La porte `feedComposer` OFFRE `story` (table partagée) et le
                   meuble sait la peindre : ces DEUX props ne sont donc pas
                   optionnelles ICI. Sans `onPublishStory`, le bouton Publier
                   de la surface story est le no-op silencieux que la doc de
                   prop de `MeeshyComposer.tsx` décrit — la surface se démonte
                   et le brouillon part avec elle. Sans
                   `storyDefaultVisibility`, la MÊME story naît PUBLIC par
                   cette porte et `storyPrefs.defaultVisibility` par le
                   dialogue hérité : deux audiences pour un même contenu, sur
                   le contrôle le plus sensible. */
                onPublishStory={handleStoryPublish}
                storyDefaultVisibility={storyPrefs.defaultVisibility}
                armCaptureToken={captureArmToken}
                onCaptureArmed={handleCaptureArmed}
                disabled={createPostMutation.isPending}
              />
            </div>
            <button
              onClick={() => setCaptureArmToken((token) => (token ?? 0) + 1)}
              className="mt-3 flex-shrink-0 w-12 h-12 rounded-full bg-[var(--gp-terracotta)] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
              aria-label={t('audioPostLabel', 'Record an audio post')}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          </div>
        </section>

        {/* Stale indicator — only when cached data is older than 30s AND a refetch is in flight */}
        <div aria-live="polite" className="sr-only">
          {cacheState === 'stale' && feedQuery.isFetching ? t('updating', 'Updating feed…') : ''}
        </div>
        {cacheState === 'stale' && feedQuery.isFetching && (
          <div className="flex items-center justify-center gap-2 py-1 mb-2 text-xs text-[var(--gp-text-muted)]" data-testid="stale-indicator">
            <div className="w-3 h-3 border border-[var(--gp-text-muted)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            {t('updatingShort', 'Updating…')}
          </div>
        )}

        {/* Skeletons ONLY on cold cache */}
        {cacheState === 'empty' && feedQuery.isLoading && (
          <div className="space-y-6" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-8 w-48" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {feedQuery.isError && (
          <div className="text-center py-12" role="alert">
            <p className="text-[var(--gp-text-muted)] mb-4">{t('loadError', 'Unable to load feed.')}</p>
            <Button variant="secondary" size="sm" onClick={() => feedQuery.refetch()}>
              {t('retry', 'Retry')}
            </Button>
          </div>
        )}

        {/* New posts banner */}
        {newPostsCount > 0 && (
          <button
            onClick={handleDismissNewPosts}
            className="w-full py-2.5 mb-4 rounded-xl bg-[var(--gp-terracotta)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            data-testid="new-posts-banner"
            aria-live="polite"
          >
            {newPostsCount === 1 ? t('newPostsOne', { count: newPostsCount }) : t('newPostsOther', { count: newPostsCount })}
          </button>
        )}

        {/* Posts */}
        {feedQuery.isSuccess && (
          <section aria-label={t('sections.posts', 'Posts')} className="space-y-6">
            <h2 className="sr-only">{t('sections.posts', 'Posts')}</h2>
            {posts.map((post) => {
              const postReactions = post.currentUserReactions ?? [];
              const isLiked = postReactions.includes('❤️') || (post.isLikedByMe ?? false);
              const isBookmarked = !!post.bookmarkedAt;
              const userReaction = postReactions[0];
              // Constat 2 (F7c) — même extracteur PUR que `StoryViewer`
              // (`postBackgroundSound`) : un seul résolveur de crédit.
              const { sound: backgroundSound, meta: backgroundSoundMeta } = postBackgroundSound(post);
              return (
                <article
                  key={post.id}
                  ref={(el) => observeImpression(el, post.id)}
                  onMouseEnter={() => prefetchPost(post.id)}
                >
                  <PostCard
                    author={{
                      name: post.author?.displayName ?? post.author?.username ?? t('unknownAuthor', 'Unknown'),
                      avatar: post.author?.avatar ?? undefined,
                    }}
                    lang={post.originalLanguage ?? 'unknown'}
                    content={post.content ?? ''}
                    translations={postToTranslations(post)}
                    userLanguage={userLanguage}
                    preferredLanguages={preferredLanguages}
                    time={formatRelativeTime(post.createdAt, t)}
                    likes={post.likeCount}
                    comments={post.commentCount}
                    isLiked={isLiked}
                    isBookmarked={isBookmarked}
                    isAuthor={post.authorId === currentUserId}
                    isPinned={post.isPinned}
                    reactionSummary={post.reactionSummary ?? undefined}
                    userReaction={userReaction}
                    media={post.media}
                    mentions={post.mentions}
                    viewerId={currentUserId}
                    repostOf={post.repostOf}
                    isQuote={post.isQuote}
                    backgroundSound={backgroundSound}
                    backgroundSoundMeta={backgroundSoundMeta}
                    backgroundSoundMuted={!unmutedBackgroundSoundPostIds.has(post.id)}
                    onToggleBackgroundSoundMute={() => toggleBackgroundSoundMute(post.id)}
                    onLike={() => handleLike(post.id, isLiked)}
                    onReact={(emoji) => handleReact(post.id, emoji, postReactions)}
                    onComment={() => handleComment(post.id)}
                    onShare={() => handleShare(post.id)}
                    onBookmark={() => handleBookmark(post.id, isBookmarked)}
                    onTranslate={() => handleTranslate(post.id)}
                    onRepost={() => handleRepostOpen(post.id)}
                    onEdit={() => handleEditPost(post.id)}
                    onDelete={() => handleDeletePost(post.id)}
                    onPin={() => handlePinPost(post.id, post.isPinned)}
                    onReport={() => handleReportPost(post.id)}
                    onDownloadMedia={(mediaId) => handleDownloadMedia(post.id, mediaId)}
                    onDownloadRepostMedia={(mediaId) => post.repostOf?.id && handleDownloadMedia(post.repostOf.id, mediaId)}
                    onTapRepost={(repostId) => router.push(`/feeds/post/${repostId}`)}
                    onClick={() => {
                      if (post.type === 'REEL') {
                        router.push(`/reel/${post.id}`);
                      } else {
                        router.push(`/feeds/post/${post.id}`);
                      }
                    }}
                  />
                </article>
              );
            })}

            {posts.length === 0 && !feedQuery.isLoading && (
              <div className="text-center py-12">
                <p className="text-[var(--gp-text-muted)]">{t('empty', 'No posts yet. Be the first to share something!')}</p>
              </div>
            )}

            <div ref={loadMoreRef} className="h-10">
              {feedQuery.isFetchingNextPage && (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-[var(--gp-terracotta)] border-t-transparent rounded-full animate-spin" aria-label={t('loadingMore', 'Loading more posts')} />
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Story Viewer */}
      {storyViewerOpen && activeStoryData.length > 0 && (
        <StoryViewer
          stories={activeStoryData}
          initialIndex={storyViewerIndex}
          userLanguage={userLanguage}
          currentUserId={currentUserId}
          onClose={handleStoryViewerClose}
          onView={handleStoryView}
          onReply={handleStoryReply}
          onDelete={handleStoryDelete}
          onReport={handleReportStory}
          onShare={handleShareStory}
          onRepost={activeStoryGroupIsRepostable ? handleRepostStory : undefined}
          onRepostAsPost={activeStoryGroupIsRepostable ? handleRepostStoryAsPost : undefined}
        />
      )}

      {/* Story Composer */}
      <StoryComposer
        open={storyComposerOpen}
        onClose={handleStoryComposerClose}
        onPublish={handleStoryPublish}
        defaultVisibility={storyPrefs.defaultVisibility}
      />

      {/* Status Composer — porte moodChip (Task W7). L'hôte fournit la
          coquille (Dialog) ; ComposerMoodSurface peint son propre bouton
          Publier. `onPublish` reste requis par le contrat mais n'est jamais
          servi par ce format — voir MeeshyComposer.tsx, § Ce que ce fichier
          ne peint pas. */}
      <Dialog
        open={statusComposerOpen}
        onClose={() => setStatusComposerOpen(false)}
        labelledBy={MOOD_DIALOG_TITLE_ID}
        /* `ComposerMoodSurface` a grandi par rapport au composer hérité (six
           puces d'audience, plus un sélecteur de personnes sous EXCEPT/ONLY)
           et peint son bouton Publier en bas : la coquille doit défiler,
           comme le note déjà `StoryComposer` sur le dialogue voisin. */
        className="max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <h2 id={MOOD_DIALOG_TITLE_ID} className="text-base font-semibold text-[var(--gp-text-primary)]">
            {t('statusComposer.title')}
          </h2>
        </DialogHeader>
        <DialogBody>
          <MeeshyComposer door={MOOD_DOOR} onPublish={handlePublish} onPublishStatus={handleStatusPublish} />
        </DialogBody>
      </Dialog>

      {/* Post Editor */}
      {editingPost && (
        <PostEditor
          open
          initialContent={editingPost.content}
          initialVisibility={editingPost.visibility}
          initialVisibilityUserIds={editingPost.visibilityUserIds}
          onSave={handleSaveEdit}
          onClose={() => setEditingPost(null)}
          saving={updatePostMutation.isPending}
        />
      )}

      {/* Repost Modal */}
      {repostingPost && (
        <RepostModal
          open
          originalAuthor={repostingPost.author}
          originalContent={repostingPost.content}
          onRepost={handleRepost}
          onQuote={handleQuote}
          onClose={() => setRepostingPost(null)}
          saving={repostMutation.isPending}
        />
      )}
    </DashboardLayout>
  );
}

export default PostsFeedScreen;
