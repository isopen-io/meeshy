import { lazy, Suspense, useState, type ReactNode } from 'react';

import { CALL_ACTIONS_ID, CallActionRows, type EffectsToggle } from '@/components/call-control-actions';
import { CallButton } from '@/components/call-glass-button';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import type { CallControlSet, ControlsArrangement } from '@/lib/calls/call-controls';
import type { ActiveCall } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA PILULE DE VERRE** (#8391) — la même en audio, en vidéo et en groupe :
 * `(…)` · Micro · Sortie · Fin. `(…)` est devant le micro : il bascule
 * l'affichage des actions (`aria-expanded`). En duo, elles sortent en rails
 * (`call-control-actions.tsx`) ; en groupe, la pilule GRANDIT vers le haut et
 * les monte en deux rangées légendées, séparées d'elle par un filet — et le
 * bandeau des sous-titres se pose en haut de ce cadre.
 *
 * « Sortie » ouvre la feuille des appareils (caméra, micro, sortie audio —
 * `call-devices-sheet.tsx`, chunk à part chargé au premier geste).
 */

const CallDevicesSheet = lazy(() => import('./call-devices-sheet').then((module) => ({ default: module.CallDevicesSheet })));

type PillProps = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly set: CallControlSet;
  readonly arrangement: ControlsArrangement;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly prominent: boolean;
  /** Le bandeau des sous-titres, posé en haut du cadre quand la pilule d'un groupe a grandi. */
  readonly framedCaptions: ReactNode;
  readonly effects: EffectsToggle;
};

export function CallControlPill({ call, language, set, arrangement, expanded, onToggle, prominent, framedCaptions, effects }: PillProps) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  const grown = expanded && arrangement === 'rows';
  return (
    <>
      <div className={`${prominent ? 'glass-call-prominent' : 'glass-call'} mx-auto flex flex-col rounded-[28px] p-1.5 ${grown ? 'w-[min(calc(100%-2rem),24rem)]' : 'w-fit'}`} data-call-control-pill={grown ? 'grown' : 'pill'}>
        {grown ? (
          <>
            {framedCaptions}
            <CallActionRows call={call} set={set} language={language} effects={effects} />
            <hr className="mx-2 my-2 border-0 border-t border-white/20" />
          </>
        ) : null}
        <div className="flex items-center justify-center gap-2">
          <CallButton
            label={translate(language, 'call.more')}
            glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.dotsThree} size={24} />}
            onPress={onToggle}
            tone={expanded ? 'active' : 'bare'}
            expanded={expanded}
            controls={CALL_ACTIONS_ID}
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
