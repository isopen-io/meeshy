import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { loadPhotoSource } from '@/lib/appearance/photo-source';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { knownPersonByIdInConversations } from '@/lib/profile/known-people-cache';
import { togetherStore, type TogetherInvitation, type TogetherSession, type TogetherStoreApi } from '@/lib/together/together-live';
import { useTogetherClient } from '@/lib/together/use-together-client';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

import { TogetherPlayerView, type TogetherSource } from './together-player';

/**
 * **REGARDER OU ÉCOUTER ENSEMBLE, ONGLET OUVERT** (#17055, sous-lot web de #17011)
 * — armé dans le chrome différé, sur toutes les routes d'un compte connecté.
 *
 * - Une invitation reçue est un bandeau NON MODAL : « Rejoindre » ouvre la séance
 *   d'un geste, « Refuser » la ferme chez l'autre ; sans réponse, elle s'éteint à
 *   son terme.
 * - Une invitation envoyée attend : « En attente de X · Annuler ».
 * - La séance ouverte est un lecteur flottant (`together-player.tsx`) : lecture,
 *   pause et déplacement se suivent chez les deux.
 * - Les personnes sont nommées par les caches de l'onglet ; inconnues, elles sont
 *   « Quelqu'un », jamais inventées.
 */

const nameOf = (language: InterfaceLanguage, userId: string): string => {
  const known = knownPersonByIdInConversations(appQueryClient, userId);
  return known?.displayName ?? known?.username ?? translateCircles(language, 'together.someone');
};

export function TogetherInvitationView({
  language,
  invitation,
  name,
  onJoin,
  onDecline,
}: {
  readonly language: InterfaceLanguage;
  readonly invitation: Pick<TogetherInvitation, 'sessionId' | 'media'>;
  readonly name: string;
  readonly onJoin: () => void;
  readonly onDecline: () => void;
}) {
  const title = translateCircles(language, invitation.media === 'video' ? 'together.invite.video' : 'together.invite.audio', { name });
  return (
    <div
      role="region"
      aria-label={title}
      data-together-invitation={invitation.sessionId}
      className="fixed inset-x-0 top-0 z-[80] flex justify-center px-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', pointerEvents: 'none' }}
    >
      <div
        className="grid max-w-md gap-2 rounded-card px-4 py-3 shadow-lg"
        style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-on-state)', pointerEvents: 'auto' }}
      >
        <p role="status" aria-live="polite" className="text-body font-semibold">
          <span aria-hidden="true">{invitation.media === 'video' ? '🎬 ' : '🎧 '}</span>
          {title}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-together-decline=""
            onClick={onDecline}
            className="rounded-full px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, border: '1.5px solid var(--color-on-state)', outlineColor: 'var(--color-on-state)' }}
          >
            {translateCircles(language, 'together.decline')}
          </button>
          <button
            type="button"
            data-together-join=""
            aria-label={translateCircles(language, 'together.join.a11y', { name })}
            onClick={onJoin}
            className="rounded-full px-4 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, backgroundColor: 'var(--color-on-state)', color: 'var(--color-brand)', outlineColor: 'var(--color-on-state)' }}
          >
            {translateCircles(language, 'together.join')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TogetherWaitingView({ language, name, onCancel }: { readonly language: InterfaceLanguage; readonly name: string; readonly onCancel: () => void }) {
  return (
    <div data-together-waiting="" className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)', pointerEvents: 'none' }}>
      <div className="flex items-center gap-3 rounded-full py-1 pl-4 pr-1 shadow-lg" style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: '1px solid var(--color-edge)', pointerEvents: 'auto' }}>
        <span role="status" aria-live="polite" className="text-body">
          {translateCircles(language, 'together.waiting', { name })}
        </span>
        <button
          type="button"
          data-together-cancel=""
          onClick={onCancel}
          className="rounded-full px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, color: 'var(--color-brand)', outlineColor: 'var(--color-brand)' }}
        >
          {translateCircles(language, 'together.cancel')}
        </button>
      </div>
    </div>
  );
}

function useSessionSource(session: TogetherSession | null): TogetherSource {
  const [source, setSource] = useState<TogetherSource>({ status: 'loading' });
  const sessionId = session?.sessionId;
  useEffect(() => {
    if (session === null) return undefined;
    let live = true;
    setSource({ status: 'loading' });
    loadPhotoSource({ queryClient: appQueryClient, deps: apiDeps, conversationId: session.conversationId, attachmentId: session.attachmentId }).then(
      (found) => {
        if (live) setSource(found === null ? { status: 'unavailable' } : { status: 'ready', src: found.full });
      },
      () => {
        if (live) setSource({ status: 'unavailable' });
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
  return source;
}

export function TogetherHost({
  language,
  store = togetherStore,
  watch = watchRealtime,
  now = Date.now,
}: {
  readonly language: InterfaceLanguage;
  readonly store?: TogetherStoreApi;
  readonly watch?: WatchRealtime;
  readonly now?: () => number;
}) {
  const ready = useCirclesCatalog(language);
  const client = useTogetherClient({ watch, store, listen: true });
  const invitation = useStore(store, (state) => state.invitation);
  const outgoing = useStore(store, (state) => state.outgoing);
  const session = useStore(store, (state) => state.session);
  const clockOffsetMs = useStore(store, (state) => state.clockOffsetMs);
  const source = useSessionSource(session);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const wait = store.getState().msUntilInvitationExpiry();
    if (wait === null) return undefined;
    const timer = setTimeout(() => store.getState().expireInvitation(), wait + 1);
    return () => clearTimeout(timer);
  }, [store, invitation?.sessionId]);

  const wasLive = useRef(false);
  useEffect(() => {
    if (session !== null) wasLive.current = true;
    else if (wasLive.current && ready) {
      wasLive.current = false;
      setNotice(translateCircles(language, 'together.ended'));
    }
  }, [session, ready, language]);

  useEffect(() => () => client.leave(), [client]);

  if (!ready) return null;
  const announcement = notice === null ? null : (
    <p role="status" className="sr-only" data-together-notice="">
      {notice}
    </p>
  );

  if (session !== null) {
    return (
      <>
        <TogetherPlayerView
          language={language}
          session={session}
          partnerName={nameOf(language, session.partnerId)}
          source={source}
          clockOffsetMs={clockOffsetMs ?? 0}
          now={now}
          onSync={(state) => void client.sync(state)}
          onLeave={() => client.leave()}
        />
        {announcement}
      </>
    );
  }
  if (invitation !== null) {
    const join = (): void => {
      void client.join(invitation.sessionId).then((outcome) => {
        if (outcome === 'gone') setNotice(translateCircles(language, 'together.gone'));
      });
    };
    return (
      <>
        <TogetherInvitationView language={language} invitation={invitation} name={nameOf(language, invitation.fromUserId)} onJoin={join} onDecline={() => client.decline(invitation.sessionId)} />
        {announcement}
      </>
    );
  }
  if (outgoing !== null) {
    return (
      <>
        <TogetherWaitingView language={language} name={nameOf(language, outgoing.toUserId)} onCancel={() => client.leave()} />
        {announcement}
      </>
    );
  }
  return announcement;
}
