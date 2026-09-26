import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';
import { useState } from 'react';

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
 * dit poliment.
 */

const PANEL = 'rgba(17,16,24,0.94)';
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

const measure = (language: InterfaceLanguage, value: number, options: Intl.NumberFormatOptions): string => new Intl.NumberFormat(language, { maximumFractionDigits: 0, ...options }).format(value);

export function CallQualityDetail({ quality, language, onClose }: { readonly quality: CallQuality; readonly language: InterfaceLanguage; readonly onClose: () => void }) {
  const rows = [
    ['call.quality.loss', measure(language, quality.packetLoss / 100, { style: 'percent', maximumFractionDigits: 1 })],
    ['call.quality.latency', measure(language, quality.rtt, { style: 'unit', unit: 'millisecond' })],
    ['call.quality.jitter', measure(language, quality.jitter, { style: 'unit', unit: 'millisecond' })],
    ['call.quality.audioRate', measure(language, quality.audioKbps, { style: 'unit', unit: 'kilobit-per-second' })],
    ['call.quality.videoRate', measure(language, quality.videoKbps, { style: 'unit', unit: 'kilobit-per-second' })],
  ] as const;
  return (
    <div role="dialog" aria-label={translate(language, 'call.quality.detail')} className="fixed inset-x-4 z-10 mx-auto max-w-xs rounded-card p-3 shadow-lg" style={{ background: PANEL, color: '#fff', top: 'calc(env(safe-area-inset-top) + 3.5rem)' }} data-call-quality-detail="">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-body font-semibold">{translate(language, 'call.quality.detail')}</span>
        <button type="button" aria-label={translate(language, 'call.quality.close')} onClick={onClose} className="grid size-11 place-items-center rounded-full" data-call-quality-close="">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-mini">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt style={{ color: 'rgba(255,255,255,0.72)' }}>{translate(language, key)}</dt>
            <dd className="text-end tabular-nums" data-call-quality-row={key}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
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
      {open ? <CallQualityDetail quality={quality} language={language} onClose={() => setOpen(false)} /> : null}
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
