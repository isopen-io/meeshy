import { lazy, Suspense, useState, type ReactNode } from 'react';

import { CallButton } from '@/components/call-glass-button';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import type { CallPanels } from '@/lib/calls/call-screen-layer';
import type { CallRowsKit } from '@/components/call-control-actions';
import type { CallControlSet } from '@/lib/calls/call-controls';
import type { ActiveCall } from '@/lib/calls/call-store';
import { useChromeHold } from '@/lib/calls/use-call-chrome';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA PILULE DE VERRE** (#8391, #8550) — la même en audio, en vidéo et en
 * groupe : `(…)` · Micro · Sortie · Fin. `(…)` est devant le micro : il
 * bascule l'affichage des actions (`aria-expanded`). Déployée, la pilule
 * GRANDIT vers le haut : sa ligne de commandes reste en bas, et au-dessus
 * d'elle, dans le MÊME cadre de verre, le bandeau des sous-titres puis UNE
 * chose : les rangées des familles (`call-control-actions.tsx`) OU le panneau
 * ouvert, qui les REMPLACE (#8578) — jamais les deux empilés.
 *
 * « Sortie » ouvre la feuille des appareils (caméra, micro, sortie audio —
 * `call-devices-sheet.tsx`, chunk à part chargé au premier geste). Ouverte,
 * elle RETIENT l'écran (`onHold`, #8735) : on ne retire pas une feuille
 * qu'on lit.
 *
 * Un toucher qui manque la pilule de peu reste à elle (#8735) : un débord
 * transparent autour d'elle garde les commandes au lieu de les effacer.
 */

const CallActionRows = lazy(() => import('./call-control-actions').then((module) => ({ default: module.CallActionRows })));

const CallDevicesSheet = lazy(() => import('./call-devices-sheet').then((module) => ({ default: module.CallDevicesSheet })));

type PillProps = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly set: CallControlSet;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly prominent: boolean;
  /** Le bandeau des sous-titres, posé en haut du cadre quand la pilule a grandi. */
  readonly framedCaptions: ReactNode;
  readonly panels: CallPanels;
  /** Ce que les rangées, chargées à part, reçoivent de l'écran d'appel. */
  readonly kit: CallRowsKit;
  /** Le panneau ouvert, À LA PLACE des rangées. */
  readonly panel: ReactNode;
  /** Une feuille ouverte (la sortie audio) retient l'écran : `true` à l'ouverture, `false` à la fermeture. */
  readonly onHold?: (held: boolean) => void;
};

export function CallControlPill({ call, language, set, expanded, onToggle, prominent, framedCaptions, panels, kit, panel, onHold }: PillProps) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  useChromeHold(devicesOpen, onHold);
  return (
    <>
      <div
        className={`${prominent ? 'glass-call-prominent' : 'glass-call'} relative isolate mx-auto flex flex-col rounded-sheet p-1.5 before:absolute before:-inset-2 before:-z-10 before:rounded-[34px] ${expanded ? 'w-[min(calc(100%-1.5rem),26rem)]' : 'w-fit'}`}
        data-call-control-pill={expanded ? 'grown' : 'pill'}
        data-call-chrome-keep=""
      >
        {expanded ? (
          <>
            <div className="flex max-h-[calc(100dvh-13rem)] min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain pt-1.5" data-call-deck="">
              {framedCaptions}
              {panel ?? (
                <Suspense fallback={null}>
                  <CallActionRows call={call} set={set} language={language} panels={panels} kit={kit} />
                </Suspense>
              )}
            </div>
            <hr className="mx-2 my-2 border-0 border-t border-media-hairline" />
          </>
        ) : null}
        <div className="flex items-center justify-center gap-2">
          <CallButton
            label={translate(language, 'call.more')}
            glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.dotsThree} size={24} />}
            onPress={onToggle}
            tone={expanded ? 'active' : 'bare'}
            expanded={expanded}
            controls={kit.actionsId}
            data={{ 'data-call-more': '' }}
          />
          <CallButton
            label={translate(language, call.micMuted ? 'call.mic.unmute' : 'call.mic.mute')}
            glyph={call.micMuted ? <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={22} /> : <Glyph name="microphone" size={22} />}
            onPress={callActions.toggleMic}
            tone={call.micMuted ? 'active' : 'bare'}
            pressed={call.micMuted}
          />
          <CallButton
            label={translate(language, 'call.devices.open')}
            glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.speakerHigh} size={22} />}
            onPress={() => setDevicesOpen(true)}
            popup
            expanded={devicesOpen}
            data={{ 'data-call-devices-open': '' }}
          />
          <CallButton label={translate(language, 'call.hangup')} glyph={<GlyphSvg glyph={CALL_SCREEN_GLYPHS.phoneDisconnect} size={24} />} onPress={callActions.hangup} tone="danger" />
        </div>
      </div>
      {devicesOpen ? (
        <Suspense fallback={null}>
          <CallDevicesSheet onClose={() => setDevicesOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
