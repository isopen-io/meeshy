import { useId, useRef } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { PeerAvatar } from '@/components/peer-avatar';
import { StreamVideo } from '@/components/call-media-elements';
import { useScreenZoom, type ScreenZoomLayer } from '@/components/use-screen-zoom';
import type { CallMember } from '@/lib/calls/call-store';
import { zoomLabel } from '@/lib/calls/camera-zoom';
import { useStowFade } from '@/lib/calls/use-pill-motion';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

export type GroupSharedScreenProps = {
  readonly member: CallMember;
  readonly stream: MediaStream | undefined;
  readonly language: InterfaceLanguage;
  /** La capsule et la puce rangées d'un toucher (U2.5) : la puce part vers le haut avec elle. */
  readonly stowed: boolean;
  /** La couleur STABLE de qui partage (loi 18.2), celle de son liseré et de ses sous-titres, que l'écran remet. */
  readonly color: string;
  readonly isDrag: ScreenZoomLayer['isDrag'];
};

/**
 * **L'ÉCRAN PARTAGÉ À LA UNE D'UN GROUPE** (U2) — chargé à part (`call-stage.tsx` › `groupScreenView`, préchargé avec
 * la grille) : un groupe sans partage ne le paie pas. Entier (`contain`), zoomé par UN calque GPU (`translate3d +
 * scale`, écrit une fois par image pendant le geste, U2.7, #17754) et, zoomé, déplacé au doigt, borné à son cadre ;
 * deux tapes le rendent entier et le recentrent. Le médaillon de qui partage porte SA couleur (loi 18.2). La puce
 * « Écran de X · 2× » se range et revient avec la capsule, vers le haut (U2.5), son propre fondu sous « Réduire les
 * animations ».
 */
export function GroupSharedScreen({ member, stream, language, stowed, color, isDrag }: GroupSharedScreenProps) {
  const title = translate(language, 'call.screen.of', { name: member.name });
  const layer = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const { zoom, transform, handlers } = useScreenZoom({ layer, isDrag });
  useStowFade(chip, stowed);
  const hint = useId();
  return (
    <div className="relative min-h-0 min-w-0 flex-1 origin-top-left overflow-hidden rounded-card" style={{ touchAction: 'none' }} data-call-slot={member.userId} aria-describedby={hint} data-call-shared-screen="" data-call-screen-zoom={String(zoom)} data-call-owns-drag={zoom > 1 ? '' : undefined} {...handlers}>
      <div ref={layer} className="absolute inset-0 transition-transform duration-200 motion-reduce:transition-none" style={{ transform, transformOrigin: 'center' }} data-call-screen-layer="">
        <StreamVideo stream={stream ?? null} mirrored={false} fit="contain" className="absolute inset-0 size-full" label={title} member={member.userId} />
      </div>
      <span id={hint} hidden>
        {translateCallControls(language, 'callControls.screenZoom.hint')}
      </span>
      <div className="absolute bottom-2 right-2 overflow-hidden rounded-full border-2" style={{ borderColor: color }} data-call-screen-medallion="">
        <PeerAvatar presenceKey={member.userId} initials={initialsOf(member.name)} color={color} size={44} {...(member.avatar === null ? {} : { src: member.avatar })} />
      </div>
      <span ref={chip} className="glass-call-prominent absolute start-2 top-2 flex max-w-[70%] items-center gap-1 rounded-full px-3 py-1 text-mini font-semibold" aria-hidden={stowed ? true : undefined} data-call-stow="top" data-call-chrome-keep="" data-call-stowed={stowed ? '' : undefined} data-call-screen-banner="">
        <GlyphSvg glyph={CALL_SCREEN_GLYPHS.monitorArrowUp} size={14} />
        <span className="truncate">{title}</span>
        {zoom > 1 ? <span aria-hidden="true">{` · ${zoomLabel(zoom, language)}`}</span> : null}
      </span>
    </div>
  );
}
