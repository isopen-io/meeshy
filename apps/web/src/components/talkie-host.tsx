import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { knownPersonByIdInConversations } from '@/lib/profile/known-people-cache';
import { bindTalkieLive, talkieStore, type LiveTalkie, type TalkieStoreApi } from '@/lib/talkie/talkie-live';
import { talkiePlayer, type TalkieSink } from '@/lib/talkie/talkie-player';
import { bindTalkieWake } from '@/lib/talkie/talkie-wake-intent';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

/**
 * **LE TALKIE REÇU, ONGLET OUVERT** (#16638, sous-lot `proche-talkie@web`) — un
 * Proche appuie et parle : sa voix sort ici SANS décrocher, fragment par
 * fragment, dès qu'elle arrive (D-4).
 *
 * - L'indicateur est DISCRET et NON MODAL (`role="status"`) : on continue ce
 *   qu'on faisait pendant qu'on écoute. Le Bring, lui, prend l'écran ; le
 *   talkie ne le prend jamais.
 * - « Couper » fait taire CETTE prise de parole sur cet onglet, au geste. Pour ne
 *   plus l'entendre du tout, c'est « Couper son talkie » sur la fiche du lien.
 * - L'émetteur est nommé par les caches de l'onglet ; inconnu, il est
 *   « Quelqu'un », jamais inventé.
 * - Onglet fermé : la notification du worker (« X vous parle ») rouvre l'app,
 *   qui rattrape la voix (`talkie-wake-intent.ts`, #17144).
 */

const viewerIdOf = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? null;

export function TalkieIncomingView({
  language,
  talkie,
  name,
  onMute,
}: {
  readonly language: InterfaceLanguage;
  readonly talkie: LiveTalkie;
  readonly name: string;
  readonly onMute: () => void;
}) {
  const title = translateCircles(language, 'talkie.incoming.title', { name });
  const mute = translateCircles(language, 'talkie.incoming.mute');
  return (
    <div
      role="status"
      aria-live="polite"
      data-talkie-incoming={talkie.talkieId}
      className="fixed inset-x-0 top-0 z-[80] flex justify-center px-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', pointerEvents: 'none' }}
    >
      <div
        className="flex items-center gap-3 rounded-full py-1 pl-4 pr-1 shadow-lg"
        style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-on-state)', pointerEvents: 'auto' }}
      >
        <span aria-hidden="true" className="motion-safe:animate-pulse">
          🎙️
        </span>
        <span className="text-body font-semibold">{title}</span>
        <button
          type="button"
          data-talkie-mute={talkie.talkieId}
          aria-label={`${mute} — ${title}`}
          onClick={onMute}
          className="grid place-items-center rounded-full px-4 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, backgroundColor: 'var(--color-on-state)', color: 'var(--color-brand)', outlineColor: 'var(--color-on-state)' }}
        >
          {mute}
        </button>
      </div>
    </div>
  );
}

export function TalkieHost({
  language,
  store = talkieStore,
  sink = talkiePlayer,
  watch = watchRealtime,
}: {
  readonly language: InterfaceLanguage;
  readonly store?: TalkieStoreApi;
  readonly sink?: TalkieSink;
  readonly watch?: WatchRealtime;
}) {
  const ready = useCirclesCatalog(language);
  const talkie = useStore(store, (state) => state.active[0] ?? null);
  const count = useStore(store, (state) => state.active.length);

  useEffect(
    () =>
      watch((socket) => {
        const unbindLive = bindTalkieLive({ socket, store, sink, viewerId: viewerIdOf });
        const unbindWake = bindTalkieWake({ socket, sink });
        return () => {
          unbindWake();
          unbindLive();
        };
      }),
    [watch, store, sink],
  );

  useEffect(() => {
    const wait = store.getState().msUntilExpiry();
    if (wait === null) return undefined;
    const timer = setTimeout(() => store.getState().expire().forEach((talkieId) => sink.silence(talkieId)), wait);
    return () => clearTimeout(timer);
  }, [store, sink, count, talkie?.talkieId]);

  if (talkie === null || !ready) return null;
  const known = knownPersonByIdInConversations(appQueryClient, talkie.fromUserId);
  const name = known?.displayName ?? known?.username ?? translateCircles(language, 'talkie.incoming.someone');
  const mute = (): void => {
    store.getState().close(talkie.talkieId);
    sink.silence(talkie.talkieId);
  };
  return <TalkieIncomingView language={language} talkie={talkie} name={name} onMute={mute} />;
}
