import { lazy, Suspense, useState } from 'react';
import { useStore } from 'zustand/react';

import { CallQualityIndicator } from '@/components/call-quality';
import { GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { browserPipSupport, requestCallPip, shouldOfferPip } from '@/lib/calls/call-pip';
import { callRecording, callRecordingStore } from '@/lib/calls/call-recording-live';
import type { ActiveCall } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES OUTILS DE L'EN-TÊTE D'APPEL** (#8046) — à droite de l'en-tête de
 * l'écran d'appel, en face de « Réduire » : l'indicateur de qualité (#8047), l'image dans l'image (quand le
 * navigateur la sait et qu'une vidéo peut flotter) et les périphériques. La
 * feuille des périphériques est un chunk à part, chargée au premier geste.
 */

const CallDevicesSheet = lazy(() => import('./call-devices-sheet').then((module) => ({ default: module.CallDevicesSheet })));

export function CallScreenTools({ call }: { readonly call: ActiveCall }) {
  const language = currentInterfaceLanguage();
  const [devicesOpen, setDevicesOpen] = useState(false);
  const live = call.phase.kind !== 'ended' && call.phase.kind !== 'incoming';
  if (!live) return <span className="size-11" />;
  const offerPip = shouldOfferPip(call, browserPipSupport());
  return (
    <div className="flex items-center gap-1">
      {call.quality === null ? null : <CallQualityIndicator quality={call.quality} language={language} />}
      {call.callId !== null && call.phase.kind === 'connected' ? <RecordButton /> : null}
      {offerPip ? (
        <button type="button" aria-label={translate(language, 'call.pip.enter')} onClick={requestCallPip} className="grid size-11 place-items-center rounded-full" style={{ color: '#fff' }} data-call-pip="">
          <GlyphSvg glyph={CALL_DEVICES_GLYPHS.pictureInPicture} size={22} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={translate(language, 'call.devices.open')}
        aria-haspopup="dialog"
        aria-expanded={devicesOpen}
        onClick={() => setDevicesOpen(true)}
        className="grid size-11 place-items-center rounded-full"
        style={{ color: '#fff' }}
        data-call-devices-open=""
      >
        <GlyphSvg glyph={CALL_DEVICES_GLYPHS.slidersHorizontal} size={22} />
      </button>
      {devicesOpen ? (
        <Suspense fallback={null}>
          <CallDevicesSheet onClose={() => setDevicesOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * ENREGISTRER L'APPEL (#8064) — la demande part à la passerelle, qui recueille
 * l'accord de tous ; rien ne s'enregistre avant. Le même bouton renonce à une
 * demande ou arrête l'enregistrement en cours.
 */
function RecordButton() {
  const language = currentInterfaceLanguage();
  const kind = useStore(callRecordingStore, (state) => state.view.kind);
  const idle = kind === 'idle';
  return (
    <button
      type="button"
      aria-label={translate(language, idle ? 'callRecording.start' : 'callRecording.stop')}
      aria-pressed={kind === 'recording'}
      disabled={kind === 'asking'}
      onClick={() => void (idle ? callRecording.request() : callRecording.stop())}
      className="grid size-11 place-items-center rounded-full"
      style={{ color: '#fff' }}
      data-call-record={kind}
    >
      <span aria-hidden className={idle ? 'size-4 rounded-full border-2' : 'size-3.5 rounded-[3px]'} style={idle ? { borderColor: '#fff' } : { background: '#ef4444' }} />
    </button>
  );
}
