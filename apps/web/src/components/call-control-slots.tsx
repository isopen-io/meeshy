import { lazy, Suspense } from 'react';
import { useStore } from 'zustand/react';

import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callNoticeStore } from '@/lib/calls/call-control-state';
import type { CallModeration } from '@/lib/calls/call-moderation';
import type { CallMember } from '@/lib/calls/call-store';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES PLACES DES CONTRÔLES D'UN APPEL DANS L'ÉCRAN** (#8438, #8439, #8433) —
 * l'écran d'appel (`call_overlay`) ne porte que la PLACE ; ce qui s'y pose est
 * chargé à part :
 *
 * - le menu de modération (`call-moderation-menu.tsx`), chez qui modère
 *   SEULEMENT — un participant ordinaire ne le télécharge jamais ;
 * - les réactions qui montent et le mot d'un contrôle
 *   (`call-control-overlays.tsx`), dès qu'un appel est en cours ou qu'un mot
 *   est à dire.
 *
 * Les glyphes du menu lui sont REMIS : il n'importe rien de ce chunk.
 */

const CallModerationMenu = lazy(() => import('./call-moderation-menu').then((module) => ({ default: module.CallModerationMenu })));
const CallControlFeedback = lazy(() => import('./call-control-overlays').then((module) => ({ default: module.CallControlFeedback })));

const MODERATION_GLYPHS = {
  more: <GlyphSvg glyph={CALL_VIEW_GLYPHS.dotsThree} size={20} />,
  mute: <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={20} />,
  remove: <GlyphSvg glyph={CALL_VIEW_GLYPHS.userMinus} size={20} />,
};

export function CallModerationSlot({ member, language, moderation, prominent = false }: { readonly member: CallMember; readonly language: InterfaceLanguage; readonly moderation: CallModeration | null; readonly prominent?: boolean }) {
  if (moderation === null || !moderation.canModerate(member.userId)) return null;
  return (
    <Suspense fallback={null}>
      <CallModerationMenu member={member} language={language} moderation={moderation} glyphs={MODERATION_GLYPHS} prominent={prominent} />
    </Suspense>
  );
}

export function CallControlFeedbackSlot({ language, nameOf, live }: { readonly language: InterfaceLanguage; readonly nameOf: (userId: string) => string | null; readonly live: boolean }) {
  const speaking = useStore(callNoticeStore, (state) => state.notice !== null);
  if (!live && !speaking) return null;
  return (
    <Suspense fallback={null}>
      <CallControlFeedback language={language} nameOf={nameOf} live={live} />
    </Suspense>
  );
}
