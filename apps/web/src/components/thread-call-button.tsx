import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { ChromeActionDisc, CHROME_ACTION_HIT_CLASS } from './chrome-action';
import { Glyph, GlyphSvg } from './glyph';
import { CALLS_GLYPHS } from './glyphs-calls';
import { apiConfig } from '@/lib/api/config';
import { sessionStore } from '@/lib/api/session';
import { callActions } from '@/lib/calls/call-actions';
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
 */
export function ThreadCallButton({
  conversationId,
  title,
  avatar,
  group,
}: {
  readonly conversationId: string;
  readonly title: string;
  readonly avatar: string | null;
  readonly group: boolean;
}) {
  const language = currentInterfaceLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const live = useStore(callStore, (state) => liveCallIn(state, conversationId) !== null);
  /* La passerelle refuse l'appel à un invité anonyme (`CallEventsHandler.ts`,
     `allowAnonymous: false`) : un bouton qui échouerait à coup sûr ne s'affiche pas. */
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated') || apiConfig.source === 'fixtures';

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
