import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';
import { lazy, Suspense, useState } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import type { CallHeaderCapsule } from '@/lib/calls/call-header';
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
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true" data-call-signal="">
      {[0, 1, 2, 3].map((index) => {
        const lit = index < LIT[level];
        const height = 5 + index * 4;
        return <rect key={index} x={index * 6} y={18 - height} width="4" height={height} rx="1" fill={lit ? TONE[level] : 'var(--color-media-hairline)'} data-bar={lit ? 'on' : 'off'} />;
      })}
    </svg>
  );
}

type CallQualityChipProps = {
  readonly capsule: CallHeaderCapsule;
  readonly clock: string | null;
  readonly quality: CallQuality | null;
  readonly language: InterfaceLanguage;
  /** Teinte plus sombre au-dessus d'un fond clair (écran partagé à la une). */
  readonly prominent: boolean;
};

/**
 * LA CAPSULE DE DROITE DE L'EN-TÊTE (#8391, #17341) — un verre qui porte ce que
 * `callHeaderCapsule` décide : en vidéo « nom donné · durée », en groupe « nom ·
 * nombre · durée », en audio le seul indicateur réseau ; les barres n'y paraissent
 * que si le lien est dégradé. La toucher ouvre le détail. Son nom accessible DIT
 * ce qu'elle montre (nom, nombre de participants, durée) puis le niveau : la
 * légende visible est contenue dans le nom (WCAG 2.5.3). Sans relevé, la capsule
 * n'est qu'une étiquette : aucun bouton ne promet un détail absent.
 */
export function CallQualityChip({ capsule, clock, quality, language, prominent }: CallQualityChipProps) {
  const [open, setOpen] = useState(false);
  const count = capsule.participantCount === null ? null : translate(language, 'call.members', { count: String(capsule.participantCount) });
  const title = capsule.receivedScreen === true && capsule.title !== null ? translate(language, 'call.screen.of', { name: capsule.title }) : capsule.title;
  const spoken = [title, count, capsule.duration ? clock : null].filter((part): part is string => part !== null && part !== '').join(' · ');
  const glass = `${prominent ? 'glass-call-prominent' : 'glass-call'} flex min-h-11 min-w-0 max-w-[60vw] items-center gap-2 rounded-full px-3 text-body font-semibold tabular-nums`;
  const content = (
    <>
      {capsule.receivedScreen === true ? (
        <span className="inline-flex shrink-0 items-center" aria-hidden="true" data-call-chip-screen="">
          <GlyphSvg glyph={CALL_SCREEN_GLYPHS.monitorArrowUp} size={16} />
        </span>
      ) : null}
      {title === null ? null : <span className="truncate">{title}</span>}
      {capsule.participantCount === null ? null : (
        <span className="inline-flex shrink-0 items-center gap-1" aria-hidden="true" data-call-chip-count="">
          <Glyph name="users" size={16} />
          {capsule.participantCount}
        </span>
      )}
      {capsule.duration && clock !== null ? <span className="shrink-0">{clock}</span> : null}
      {capsule.network && quality !== null ? <SignalBars level={quality.level} /> : null}
    </>
  );
  if (quality === null) {
    return (
      <span className={glass} data-call-chip="">
        {content}
      </span>
    );
  }
  const level = translate(language, 'call.quality.indicator', { level: translate(language, LEVEL_KEY[quality.level]) });
  const label = spoken === '' ? level : `${spoken} — ${level}`;
  return (
    <div className="relative min-w-0">
      <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} className={glass} data-call-chip="" data-call-quality={quality.level}>
        {content}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <CallQualityDetail quality={quality} language={language} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * La capsule de capture (R1, loi 13) : rouge, 44 px, posée UNE fois sous
 * l'en-tête, en audio comme en vidéo. Elle ne suit pas le chrome : une capture
 * ne se cache pas (iOS `CallCaptureAlertLayer`).
 */
export function CallCaptureAlerts({ members, language }: { readonly members: Readonly<Record<string, CallMember>>; readonly language: InterfaceLanguage }) {
  return (
    <div className="pointer-events-none flex max-w-full flex-col items-center gap-1 px-4" aria-live="assertive" data-call-capture-row="">
      {Object.values(members)
        .filter((member) => member.capturing)
        .map((member) => (
          <span key={`capture-${member.userId}`} role="alert" className="inline-flex h-11 max-w-full items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold leading-none" style={{ background: 'color-mix(in srgb, var(--ios-error-strong) 85%, transparent)', color: 'var(--color-ios-on-brand)' }} data-call-alert="capturing">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-2 border-current" data-call-alert-dot=""></span>
            <span className="truncate">{translate(language, 'call.alert.capturing', { name: member.name })}</span>
          </span>
        ))}
    </div>
  );
}

/** La place que la capsule prend sous l'en-tête (44 px et sa marge) : la vignette et ses commandes descendent d'autant. */
export const CALL_CAPTURE_ROW_CLEARANCE = 56;

export const someoneCaptures = (members: Readonly<Record<string, CallMember>>): boolean => Object.values(members).some((member) => member.capturing);

export function CallPeerAlerts({ members, language }: { readonly members: Readonly<Record<string, CallMember>>; readonly language: InterfaceLanguage }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4" aria-live="polite">
      {Object.values(members)
        .filter((member) => member.weakNetwork)
        .map((member) => (
          <span key={`network-${member.userId}`} className="glass-call rounded-full px-3 py-1 text-mini" data-call-alert="weak-network">
            {translate(language, 'call.alert.weakNetwork', { name: member.name })}
          </span>
        ))}
    </div>
  );
}
