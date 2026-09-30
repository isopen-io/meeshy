import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';
import { lazy, Suspense, useState } from 'react';

import type { CallMember, CallQuality } from '@/lib/calls/call-store';
import { useChromeHold } from '@/lib/calls/use-call-chrome';
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

const TONE: Readonly<Record<ConnectionQualityLevel, string>> = { excellent: 'var(--ios-success)', good: 'var(--ios-success)', fair: 'var(--ios-warning)', poor: 'var(--ios-error)' };
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
        return <rect key={index} x={index * 6} y={18 - height} width="4" height={height} rx="1" fill={lit ? TONE[level] : 'var(--color-media-hairline)'} data-bar={lit ? 'on' : 'off'} />;
      })}
    </svg>
  );
}

type CallQualityChipProps = {
  readonly title: string;
  readonly clock: string | null;
  readonly quality: CallQuality | null;
  readonly language: InterfaceLanguage;
  /** Teinte plus sombre au-dessus d'un fond clair (écran partagé à la une). */
  readonly prominent: boolean;
  /** Le détail ouvert retient l'écran (#8735) : `true` à l'ouverture, `false` à la fermeture. */
  readonly onHold?: (held: boolean) => void;
};

/**
 * LA PUCE « NOM · DURÉE » DE L'EN-TÊTE (#8391) — à droite de l'en-tête d'appel,
 * un verre qui porte le nom, la durée et les barres de qualité ; la toucher
 * ouvre le détail. Son nom accessible DIT ce qu'elle montre puis le niveau :
 * la légende visible est contenue dans le nom (WCAG 2.5.3). Sans relevé, la
 * puce n'est qu'une étiquette : aucun bouton ne promet un détail absent.
 * Le détail ouvert RETIENT l'écran d'appel (`onHold`, #8735) : il ne s'efface
 * pas sous qui le lit.
 */
export function CallQualityChip({ title, clock, quality, language, prominent, onHold }: CallQualityChipProps) {
  const [open, setOpen] = useState(false);
  useChromeHold(open && quality !== null, onHold);
  const shown = clock === null ? title : `${title} · ${clock}`;
  const glass = `${prominent ? 'glass-call-prominent' : 'glass-call'} flex min-h-11 min-w-0 max-w-[60vw] items-center gap-2 rounded-full px-3 text-body font-semibold tabular-nums`;
  if (quality === null) {
    return (
      <span className={glass} data-call-chip="">
        <span className="truncate">{shown}</span>
      </span>
    );
  }
  const label = `${shown} — ${translate(language, 'call.quality.indicator', { level: translate(language, LEVEL_KEY[quality.level]) })}`;
  return (
    <div className="relative min-w-0">
      <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} className={glass} data-call-chip="" data-call-quality={quality.level}>
        <span className="truncate">{shown}</span>
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
          <span key={`capture-${member.userId}`} role="alert" className="rounded-full px-3 py-1 text-mini font-semibold" style={{ background: 'color-mix(in srgb, var(--ios-error-strong) 85%, transparent)', color: 'var(--color-ios-on-brand)' }} data-call-alert="capturing">
            {translate(language, 'call.alert.capturing', { name: member.name })}
          </span>
        ))}
      {peers
        .filter((member) => member.weakNetwork)
        .map((member) => (
          <span key={`network-${member.userId}`} className="glass-call rounded-full px-3 py-1 text-mini" data-call-alert="weak-network">
            {translate(language, 'call.alert.weakNetwork', { name: member.name })}
          </span>
        ))}
    </div>
  );
}
