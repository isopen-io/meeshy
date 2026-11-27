import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { authorPostsInfiniteOptions, flattenAuthorPosts } from '@/lib/api/author-posts';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { storyTrayQueryOptions } from '@/lib/api/stories';
import { createFeedAutoplayStore, useFeedAutoplayRoot } from '@/lib/feed/use-feed-autoplay';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  SEND_CONTENT_KINDS,
  planSendContent,
  sendContentCardRatio,
  sendContentChoices,
  sendContentListing,
  sendContentOutcomeOf,
  sendContentPagesFurther,
  type SendContentKind,
  type SendContentOutcome,
} from '@/lib/profile/send-content';
import { sendQueue } from '@/lib/send/send-queue-instance';
import type { SendQueue } from '@/lib/send/send-queue';
import { createSendSheetPorts } from '@/lib/send/send-sheet-ports';
import type { SendSheetPorts } from '@/lib/send/send-sheet-run';
import { myActiveStories } from '@/lib/view/my-stories';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

import { MeeshyButton } from './kit/meeshy-button';
import { MeeshyChipRow } from './kit/meeshy-chip-row';
import { MeeshySkeleton } from './kit/meeshy-skeleton';
import { ProfileSendContentGrid } from './profile-send-content-grid';

/**
 * **LA FEUILLE « LUI ENVOYER UN CONTENU »** (#20245, référence `ProfileSendContentSheet.swift`) — onglets
 * Publications / Réels / Stories, grille de trois cartes, « Envoyer à X » en bas.
 *
 * **Cache d'abord** : mes publications viennent de la MÊME caisse que ma fiche (`authorPostsInfiniteOptions`),
 * mes stories du MÊME plateau que le rail (`storyTrayQueryOptions`) ; les squelettes ne paraissent que sur un cache
 * vide. Une page de plus se demande d'elle-même quand l'onglet n'a encore rien à montrer.
 *
 * **L'envoi passe par la file durable** (`sendQueue`) : il survit à la fermeture de la feuille et au réseau
 * coupé, et la garde de chiffrement de bout en bout du moteur d'envoi s'applique (fail-closed).
 */

export type SendContentPerson = { readonly id: string; readonly name: string };

const SKELETON_CARDS = 6;
/** Le même délai de fraîcheur que le rail (`useStoryTray`). */
const STORY_TRAY_STALE_TIME = 60_000;

export function ProfileSendContentSheet({
  language,
  person,
  viewerId,
  contentLanguage,
  readerLanguages,
  onClose,
  onOutcome,
  queue = sendQueue,
  ports,
}: {
  readonly language: InterfaceLanguage;
  readonly person: SendContentPerson;
  readonly viewerId: string;
  readonly contentLanguage: string;
  readonly readerLanguages: readonly string[];
  readonly onClose: () => void;
  readonly onOutcome: (outcome: SendContentOutcome, message: string) => void;
  readonly queue?: SendQueue;
  readonly ports?: SendSheetPorts;
}) {
  useBackDismiss(onClose, { escape: true });
  const [kind, setKind] = useState<SendContentKind>('publication');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const store = useMemo(() => createFeedAutoplayStore(), []);
  const { registerScene } = useFeedAutoplayRoot(scroller, store);
  const now = useMemo(() => new Date(), []);

  const posts = useInfiniteQuery({ ...authorPostsInfiniteOptions({ ...apiDeps, authorId: viewerId }), enabled: viewerId !== '' }, appQueryClient);
  const tray = useQuery({ ...storyTrayQueryOptions(apiDeps), staleTime: STORY_TRAY_STALE_TIME, enabled: viewerId !== '' }, appQueryClient);
  const stories = useMemo(() => myActiveStories({ stories: tray.data ?? [], viewerId, now: now.getTime() }), [tray.data, viewerId, now]);
  const served = useMemo(() => flattenAuthorPosts(posts.data), [posts.data]);
  const choices = useMemo(() => sendContentChoices({ kind, posts: served, stories }), [kind, served, stories]);
  const selected = choices.find((post) => post.id === selectedId) ?? null;

  const story = kind === 'story';
  const input = {
    hasChoices: choices.length > 0,
    settled: story ? !tray.isPending : !posts.isPending,
    loading: story ? tray.isFetching && tray.data === undefined : posts.isFetchingNextPage || (posts.isFetching && posts.data === undefined),
    failed: story ? tray.isError : posts.isError || posts.isFetchNextPageError,
    hasMore: story ? false : posts.hasNextPage,
  };
  const listing = sendContentListing(input);
  const further = sendContentPagesFurther(input);
  const { fetchNextPage } = posts;
  useEffect(() => {
    if (further) void fetchNextPage();
  }, [further, fetchNextPage, kind]);

  const send = useCallback(() => {
    if (selected === null || sending) return;
    const planned = planSendContent({ post: selected, person, viewerId });
    if (!planned.ok) {
      onOutcome('refused', translateCircles(language, 'sendContent.refused', { name: person.name }));
      return;
    }
    setSending(true);
    const queued = queue.submit(
      { entries: planned.entries, payload: planned.payload, language: contentLanguage, labels: { [planned.entries[0]?.key ?? '']: person.name }, viewerId },
      ports ?? createSendSheetPorts({ language: contentLanguage }),
    );
    const key = planned.entries[0]?.key ?? '';
    const settle = (): boolean => {
      const outcome = sendContentOutcomeOf(queued.run.getState().statuses[key]);
      if (outcome === null) return false;
      setSending(false);
      const message =
        outcome === 'sent'
          ? translateCircles(language, 'sendContent.sent', { name: person.name })
          : outcome === 'offline'
            ? translateCircles(language, 'sendContent.offline')
            : translateCircles(language, 'sendContent.refused', { name: person.name });
      onOutcome(outcome, message);
      if (outcome !== 'refused') onClose();
      return true;
    };
    if (settle()) return;
    const stop = queued.run.subscribe(() => {
      if (settle()) stop();
    });
  }, [selected, sending, person, viewerId, queue, contentLanguage, ports, language, onOutcome, onClose]);

  const title = translateCircles(language, 'sendContent.title');
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center" data-send-content-sheet="">
      <div aria-hidden="true" data-send-content-scrim="" onClick={onClose} className="absolute inset-0" style={{ background: 'var(--color-scrim)' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[90dvh] w-full max-w-xl flex-col rounded-t-card sm:rounded-card"
        style={{ background: 'var(--color-ios-card)' }}
      >
        <div ref={scroller} className="scrollbar-none grid flex-1 content-start gap-3 overflow-y-auto px-4 pb-4 pt-5">
          <h2 className="text-body font-bold">{title}</h2>
          <MeeshyChipRow
            label={translateCircles(language, 'sendContent.kinds')}
            semantics="tabs"
            mode="single"
            surface="theme"
            layout="scroll"
            chips={SEND_CONTENT_KINDS.map((entry) => ({ id: entry, title: translateCircles(language, `sendContent.kind.${entry}`) }))}
            selection={[kind]}
            onChange={(next, tapped) => {
              if (!next.includes(tapped)) return;
              setKind(tapped as SendContentKind);
              setSelectedId(null);
            }}
          />
          {listing === 'choices' ? (
            <ProfileSendContentGrid
              posts={choices}
              kind={kind}
              selectedId={selectedId}
              language={language}
              readerLanguages={readerLanguages}
              now={now}
              store={store}
              registerScene={registerScene}
              onSelect={setSelectedId}
            />
          ) : listing === 'loading' ? (
            <div data-send-content-loading="" className="grid grid-cols-3 gap-2" aria-busy="true">
              {Array.from({ length: SKELETON_CARDS }, (_, index) => (
                <MeeshySkeleton key={index} shape={{ kind: 'card', aspect: sendContentCardRatio(kind), radius: 12 }} />
              ))}
            </div>
          ) : listing === 'failed' ? (
            <div data-send-content-failed="" className="grid justify-items-start gap-2">
              <p className="text-caption">{translateCircles(language, 'sendContent.failed')}</p>
              <MeeshyButton title={translateCircles(language, 'sendContent.retry')} kind="tinted" onPress={() => void (story ? tray.refetch() : posts.refetch())} />
            </div>
          ) : (
            <p data-send-content-empty="" className="text-caption">
              {translateCircles(language, 'sendContent.empty')}
            </p>
          )}
        </div>
        <div className="px-4 pb-safe pt-2">
          <MeeshyButton
            title={translateCircles(language, 'sendContent.send', { name: person.name })}
            width="fill"
            isPending={sending}
            disabled={selected === null}
            disabledReason={selected === null ? translateCircles(language, 'sendContent.pickFirst') : undefined}
            onPress={send}
          />
        </div>
      </div>
    </div>
  );
}
