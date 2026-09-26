import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';
import { lazy, Suspense, useState } from 'react';

import type { CallMember, CallQuality } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA QUALITÉ D'UN APPEL, VUE** (#8047) — miroir de `CallSignalGlyph.swift` et
 * du `CallQualityOverlay` du legacy : quatre barres dans l'en-tête de l'écran
 * d'appel, qui s'ouvrent sur le détail du dernier relevé (perte, latence,
 * gigue, débits — dans les unités de la langue, `Intl.NumberFormat`), et les
 * alertes d'un pair (`call:quality-alert`, `call:screen-capture-alert`) dans
 * une région vivante : la capture d'écran est une ALERTE, un lien instable se
 * dit poliment. Le détail, ouvert d'un toucher, est un chunk à part
 * (`call-quality-detail.tsx`) : l'écran d'appel n'en paie que l'`import()`.
 */

const CallQualityDetail = lazy(() => import('./call-quality-detail').then((module) => ({ default: module.CallQualityDetail })));

const TONE: Readonly<Record<ConnectionQualityLevel, string>> = { excellent: '#34d399', good: '#34d399', fair: '#fbbf24', poor: '#f87171' };
const LIT: Readonly<Record<ConnectionQualityLevel, number>> = { excellent: 4, good: 3, fair: 2, poor: 1 };
const LEVEL_KEY = {
  excellent: 'call.quality.level.excellent',
  good: 'call.quality.level.good',
  fair: 'call.quality.level.fair',
  poor: 'call.quality.level.poor',
} as const;

function SignalBars({ level }: { readonly level: ConnectionQualityLevel }) {
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => {
        const lit = index < LIT[level];
        const height = 5 + index * 4;
        return <rect key={index} x={index * 6} y={18 - height} width="4" height={height} rx="1" fill={lit ? TONE[level] : 'rgba(255,255,255,0.28)'} data-bar={lit ? 'on' : 'off'} />;
      })}
    </svg>
  );
}

export function CallQualityIndicator({ quality, language }: { readonly quality: CallQuality; readonly language: InterfaceLanguage }) {
  const [open, setOpen] = useState(false);
  const label = translate(language, 'call.quality.indicator', { level: translate(language, LEVEL_KEY[quality.level]) });
  return (
    <div className="relative">
      <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} className="grid size-11 place-items-center rounded-full" data-call-quality={quality.level}>
        <SignalBars level={quality.level} />
      </button>
      {open ? (
        <Suspense fallback={null}>
          <CallQualityDetail quality={quality} language={language} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

export function CallPeerAlerts({ members, language }: { readonly members: Readonly<Record<string, CallMember>>; readonly language: InterfaceLanguage }) {
  const peers = Object.values(members);
  return (
    <div className="flex flex-col items-center gap-1 px-4" aria-live="polite">
      {peers
        .filter((member) => member.capturing)
        .map((member) => (
          <span key={`capture-${member.userId}`} role="alert" className="rounded-full px-3 py-1 text-mini font-semibold" style={{ background: 'rgba(239,68,68,0.85)', color: '#fff' }} data-call-alert="capturing">
            {translate(language, 'call.alert.capturing', { name: member.name })}
          </span>
        ))}
      {peers
        .filter((member) => member.weakNetwork)
        .map((member) => (
          <span key={`network-${member.userId}`} className="rounded-full px-3 py-1 text-mini" style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }} data-call-alert="weak-network">
            {translate(language, 'call.alert.weakNetwork', { name: member.name })}
          </span>
        ))}
    </div>
  );
}
