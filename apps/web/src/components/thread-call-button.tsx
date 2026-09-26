import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { ChromeActionDisc, CHROME_ACTION_HIT_CLASS } from './chrome-action';
import { Glyph, GlyphSvg } from './glyph';
import { CALLS_GLYPHS } from './glyphs-calls';
import { conversationActiveCallQueryKey, loadConversationActiveCallId } from '@/lib/api/call-sessions';
import { unwrap } from '@/lib/api/client';
import { apiConfig } from '@/lib/api/config';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { callActions } from '@/lib/calls/call-actions';
import { rememberCallIdentity } from '@/lib/calls/call-notice';
import { callStore, liveCallIn, type CallMedia } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE BOUTON D'APPEL DU FIL** (#6382, #8045) — iOS pose deux boutons,
 * vocal et vidéo (`ConversationView+Header.swift`, `HeaderCallButtonsView`) ;
 * l'en-tête web tient déjà 208 px à 320 de large (retour + chip + appel +
 * recherche + avatar), donc le même choix passe par UN bouton et un menu de
 * deux lignes — deux gestes, le plafond de la dimension 7.
 *
 * Pendant un appel dans CETTE conversation, le bouton devient « Revenir à
 * l'appel », vert (iOS : l'indicateur vert « tap to return »).
 *
 * **Un appel en cours SANS le lecteur devient « Rejoindre »** (H3, lot 3) —
 * la pastille verte du legacy (`OngoingCallBanner`) et d'iOS. Deux sources,
 * cache d'abord : l'`activeCall` que la ligne de liste porte déjà (tenu à jour
 * par `conversation:updated`), puis `GET /conversations/:id/active-call`
 * sondé toutes les 15 s tant que le fil est visible (le rythme du legacy
 * `use-call-banner.ts`) — la réponse de la passerelle, quand elle est là,
 * l'emporte sur la ligne.
 */
export const THREAD_ACTIVE_CALL_POLL_MS = 15_000;

export function ThreadCallButton({
  conversationId,
  title,
  avatar,
  group,
  liveCallHint = null,
}: {
  readonly conversationId: string;
  readonly title: string;
  readonly avatar: string | null;
  readonly group: boolean;
  /** L'appel en cours que la ligne de liste connaît déjà (`activeCall`), `null` sinon. */
  readonly liveCallHint?: { readonly id: string; readonly kind: string } | null;
}) {
  const language = currentInterfaceLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const live = useStore(callStore, (state) => liveCallIn(state, conversationId) !== null);
  /* La passerelle refuse l'appel à un invité anonyme (`CallEventsHandler.ts`,
     `allowAnonymous: false`) : un bouton qui échouerait à coup sûr ne s'affiche pas. */
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated') || apiConfig.source === 'fixtures';

  const served = useQuery(
    {
      queryKey: conversationActiveCallQueryKey(conversationId),
      queryFn: async ({ signal }) => unwrap(await loadConversationActiveCallId(apiDeps, conversationId, signal)),
      enabled: signedIn && !live,
      refetchInterval: THREAD_ACTIVE_CALL_POLL_MS,
      staleTime: THREAD_ACTIVE_CALL_POLL_MS,
      retry: false,
    },
    appQueryClient,
  );
  const joinableId = served.data !== undefined ? served.data : (liveCallHint?.id ?? null);
  const joinMedia: CallMedia = liveCallHint?.kind === 'video' ? 'video' : 'audio';

  useEffect(() => {
    rememberCallIdentity(conversationId, { title, avatar, isGroup: group });
  }, [conversationId, title, avatar, group]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const call = (media: CallMedia) => {
    setOpen(false);
    callActions.start({ conversationId, media, title, avatar, isGroup: group });
  };

  if (!signedIn) return null;
  if (!live && joinableId !== null) {
    return (
      <button
        type="button"
        className="grid min-h-11 shrink-0 place-items-center focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--color-success)' }}
        aria-label={translate(language, 'callJoin.header')}
        onClick={() => callActions.join({ conversationId, callId: joinableId, media: joinMedia, title, avatar, isGroup: group })}
        data-thread-call="join"
      >
        <span
          aria-hidden="true"
          className="flex items-center gap-1 whitespace-nowrap rounded-chip px-2.5 text-check font-semibold"
          style={{ height: 30, color: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 14%, transparent)' }}
        >
          <Glyph name="phone" size={12} />
          {translate(language, 'callJoin.action')}
        </span>
      </button>
    );
  }
  if (live) {
    return (
      <button type="button" className={CHROME_ACTION_HIT_CLASS} style={{ color: 'var(--color-ok)' }} aria-label={translate(language, 'call.action.return')} onClick={callActions.expand} data-thread-call="return">
        <ChromeActionDisc>
          <Glyph name="phone" size={13} />
        </ChromeActionDisc>
      </button>
    );
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        className={CHROME_ACTION_HIT_CLASS}
        style={{ color: 'var(--accent)' }}
        aria-label={translate(language, 'call.action.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-thread-call="menu"
      >
        <ChromeActionDisc>
          <Glyph name="phone" size={13} />
        </ChromeActionDisc>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 grid min-w-44 overflow-hidden rounded-card py-1 shadow-lg"
          style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)' }}
        >
          <button type="button" role="menuitem" className="flex min-h-11 items-center gap-3 px-4 text-left text-body" onClick={() => call('audio')}>
            <Glyph name="phone" size={18} style={{ color: 'var(--accent)' }} />
            {translate(language, 'call.action.audio')}
          </button>
          <button type="button" role="menuitem" className="flex min-h-11 items-center gap-3 px-4 text-left text-body" onClick={() => call('video')}>
            <GlyphSvg glyph={CALLS_GLYPHS.videoCamera} size={18} style={{ color: 'var(--accent)' }} />
            {translate(language, 'call.action.video')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
