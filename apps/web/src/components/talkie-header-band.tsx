import { useEffect, useRef, useState } from 'react';

import { translateCircles, type CirclesCatalogKey } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  createTalkieWaveTrail,
  isRealtimeDelivery,
  talkieElapsed,
  talkieWaveBarCount,
  talkieWaveBarHeights,
  talkieWaveMirroredBarHeights,
  talkieWaveSmoothed,
  type TalkieHeaderDelivery,
  type TalkieHeaderVoice,
  type TalkieLevelReading,
} from '@/lib/talkie/talkie-header-law';

import { GlyphSvg } from './glyph';
import { GLYPHS } from './glyphs';
import { FEED_GLYPHS } from './glyphs-feed';
import { MEDIA_TRANSPORT_GLYPHS } from './glyphs-media-transport';
import { SETTINGS_GLYPHS } from './glyphs-settings';

/**
 * **LE TALKIE ÉLARGI SUR TOUTE LA BARRE D'EN-TÊTE** (#17338, transposition de
 * `TalkieHeaderLiveBar.swift`) — et ce qu'il dit AVANT la fin :
 * - **en direct**, un spectre miroir suit la voix à l'instant, sous une pastille
 *   « En direct » dont le point blanc pulse, sur le dégradé de la conversation ;
 * - **hors ligne** (réveil, ou repli en message vocal), le fond s'assombrit, le
 *   liseré passe en pointillé, une bande défile vers une tête de lecture rouge et
 *   un point rouge clignote.
 *
 * Elle ne prend aucun geste (`pointer-events-none`) : le pointeur qui tient le
 * bouton dessous reste le sien. L'onde se dessine sur un canevas à chaque image
 * en lisant le compteur de niveau : rien ne se re-rend pour elle. Avec
 * `prefers-reduced-motion`, la houle et la pulsation s'arrêtent et l'onde suit
 * la voix à 10 Hz.
 */

export type ThreadTalkieLive = { readonly voice: TalkieHeaderVoice; readonly delivery: TalkieHeaderDelivery };

export const THREAD_TALKIE_REST: ThreadTalkieLive = { voice: 'none', delivery: 'live' };

const BADGE_KEY = {
  live: 'talkie.header.badge.live',
  relayed: 'talkie.header.badge.relayed',
  recorded: 'talkie.header.badge.recorded',
} as const satisfies Readonly<Record<TalkieHeaderDelivery, CirclesCatalogKey>>;

/** La voix qui arrive s'annonce déjà par l'indicateur de réception ; celle qui part dit ce qu'elle devient. */
export const TALKIE_ANNOUNCE_KEY = {
  live: 'talkie.header.announce.live',
  relayed: 'talkie.header.announce.relayed',
  recorded: 'talkie.header.announce.recorded',
} as const satisfies Readonly<Record<TalkieHeaderDelivery, CirclesCatalogKey>>;

export function talkieAnnouncement(language: InterfaceLanguage, live: ThreadTalkieLive): string {
  return live.voice === 'outgoing' ? translateCircles(language, TALKIE_ANNOUNCE_KEY[live.delivery]) : '';
}

// Rouge d'enregistrement : APLAT (dot, tête de lecture) posé sur une surface
// TOUJOURS sombre (le dégradé de la conversation, assombri d'un voile hors ligne).
// La charte veut alors `ios-error-strong` (miroir iOS `MeeshyColors.errorStrong`,
// #ef4444) — le jeton `error` schématisé tombe à un rouge foncé illisible sur du
// verre sombre en thème clair.
const RECORDING_RED = 'var(--ios-error-strong)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const REDUCED_MOTION_PERIOD_MS = 100;

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;

type WaveMode = 'mirror' | 'tape';

const MIRROR_BAR = { width: 3.5, gap: 3 } as const;
const TAPE_BAR = { width: 3, gap: 3 } as const;

function drawBars(context: CanvasRenderingContext2D, { heights, barWidth, gap, originX, height, strength }: {
  readonly heights: readonly number[];
  readonly barWidth: number;
  readonly gap: number;
  readonly originX: number;
  readonly height: number;
  readonly strength: boolean;
}): void {
  heights.forEach((barHeight, index) => {
    const x = originX + index * (barWidth + gap);
    const fill = strength && height > barWidth ? (barHeight - barWidth) / (height - barWidth) : 1;
    // harmony-exempt: encre blanche « on-media » peinte en CANVAS (hors du DOM, même raison que lib/canvas/) — l'alpha suit l'amplitude de la voix
    context.fillStyle = `rgba(255, 255, 255, ${strength ? 0.6 + 0.4 * fill : 1})`;
    const y = (height - barHeight) / 2;
    if (typeof context.roundRect !== 'function') return context.fillRect(x, y, barWidth, barHeight);
    context.beginPath();
    context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
    context.fill();
    return undefined;
  });
}

/** L'onde : un canevas redessiné à chaque image (ou à 10 Hz sans animation) depuis le compteur, hors de tout état observé. */
function TalkieWaveCanvas({ mode, meter }: { readonly mode: WaveMode; readonly meter: TalkieLevelReading }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null) return undefined;
    const reduced = prefersReducedMotion();
    const trail = createTalkieWaveTrail();
    let smoothed = 0;
    const frame = (nowMs: number): void => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const bar = mode === 'mirror' ? MIRROR_BAR : TAPE_BAR;
      const count = talkieWaveBarCount({ width, barWidth: bar.width, gap: bar.gap });
      const span = count * bar.width + Math.max(count - 1, 0) * bar.gap;
      if (mode === 'mirror') {
        smoothed = talkieWaveSmoothed(smoothed, meter.level());
        const heights = talkieWaveMirroredBarHeights({ level: smoothed, barCount: count, timeS: reduced ? 0 : nowMs / 1_000, minHeight: bar.width, maxHeight: height });
        drawBars(context, { heights, barWidth: bar.width, gap: bar.gap, originX: Math.max((width - span) / 2, 0), height, strength: true });
        return;
      }
      trail.advance(nowMs, meter.level());
      const heights = talkieWaveBarHeights({ levels: trail.levels(), barCount: count, minHeight: bar.width, maxHeight: height });
      drawBars(context, { heights, barWidth: bar.width, gap: bar.gap, originX: Math.max(width - span, 0), height, strength: false });
    };
    if (reduced) {
      const timer = setInterval(() => frame(performance.now()), REDUCED_MOTION_PERIOD_MS);
      return () => clearInterval(timer);
    }
    let handle = 0;
    const loop = (nowMs: number): void => {
      frame(nowMs);
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [mode, meter]);

  return <canvas ref={canvasRef} data-talkie-wave={mode} aria-hidden="true" className="block size-full" />;
}

/** Le chrono m:ss : seul lui se re-rend, une fois par seconde. */
function TalkieChrono() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span data-talkie-chrono="" className="shrink-0 text-caption font-semibold tabular-nums" style={{ color: 'var(--color-on-media-2)' }}>
      {talkieElapsed(now - startedAt)}
    </span>
  );
}

function badgeGlyph({ delivery, voice }: ThreadTalkieLive) {
  if (delivery === 'relayed') return SETTINGS_GLYPHS.moon;
  if (delivery === 'recorded') return FEED_GLYPHS.waveform;
  return voice === 'incoming' ? MEDIA_TRANSPORT_GLYPHS.speakerHigh : GLYPHS.microphone;
}

function TalkieDeliveryBadge({ language, live }: { readonly language: InterfaceLanguage; readonly live: ThreadTalkieLive }) {
  const realtime = isRealtimeDelivery(live.delivery);
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-mini font-extrabold uppercase"
      style={{ color: 'var(--color-on-media)', letterSpacing: '0.04em', backgroundColor: realtime ? 'var(--color-media-hairline)' : 'var(--color-media-fill)' }}
    >
      <span aria-hidden="true" className="relative grid size-3.5 place-items-center">
        {realtime ? (
          <>
            <span className="absolute inset-0 rounded-full motion-safe:animate-ping" style={{ backgroundColor: 'color-mix(in srgb, var(--color-on-media) 35%, transparent)' }} />
            <span className="relative rounded-full" style={{ width: 7, height: 7, backgroundColor: 'var(--color-on-media)' }} />
          </>
        ) : (
          <span className="rounded-full motion-safe:animate-pulse" style={{ width: 8, height: 8, backgroundColor: RECORDING_RED, boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-on-media) 80%, transparent)' }} />
        )}
      </span>
      <GlyphSvg glyph={badgeGlyph(live)} size={11} />
      <span className="whitespace-nowrap">{translateCircles(language, BADGE_KEY[live.delivery])}</span>
    </span>
  );
}

export function TalkieHeaderBand({
  language,
  live,
  accent,
  secondary,
  meter,
}: {
  readonly language: InterfaceLanguage;
  readonly live: ThreadTalkieLive;
  readonly accent: string;
  readonly secondary: string;
  readonly meter: TalkieLevelReading;
}) {
  const realtime = isRealtimeDelivery(live.delivery);
  return (
    <div data-talkie-band="" data-talkie-delivery={live.delivery} aria-hidden="true" className="pointer-events-none absolute inset-x-3 inset-y-1.5 z-10">
      <div
        className="relative flex size-full items-center gap-2 overflow-hidden rounded-full px-3 transition-[box-shadow] duration-300"
        style={{
          background: `linear-gradient(to right, ${accent}, ${secondary})`,
          boxShadow: `0 0 ${realtime ? 10 : 4}px color-mix(in srgb, ${accent} ${realtime ? 55 : 20}%, transparent)`,
        }}
      >
        {realtime ? null : <span className="absolute inset-0" style={{ backgroundColor: 'var(--color-scrim-soft)' }} />}
        <span className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, color-mix(in srgb, var(--color-on-media) 28%, transparent), transparent 50%)' }} />
        <span
          className="absolute inset-0 rounded-full"
          style={{ border: realtime ? '1px solid color-mix(in srgb, var(--color-on-media) 40%, transparent)' : '1px dashed color-mix(in srgb, var(--color-on-media) 45%, transparent)' }}
        />
        <span className="relative flex size-full items-center gap-2">
          <TalkieDeliveryBadge language={language} live={live} />
          <span className="relative h-full min-w-0 flex-1 py-1.5">
            {realtime ? (
              <TalkieWaveCanvas key="mirror" mode="mirror" meter={meter} />
            ) : (
              <>
                {/* harmony-exempt: masque de luminance (fondu d'entrée de la bande défilante) — #000 = opaque, pas une couleur */}
                <span className="block size-full pe-1" style={{ maskImage: 'linear-gradient(to right, transparent, #000 40%, #000)', WebkitMaskImage: 'linear-gradient(to right, transparent, #000 40%, #000)' }}>
                  <TalkieWaveCanvas key="tape" mode="tape" meter={meter} />
                </span>
                <span data-talkie-playhead="" className="absolute inset-y-1 end-0 rounded-full" style={{ width: 2, backgroundColor: RECORDING_RED }} />
              </>
            )}
          </span>
          <TalkieChrono />
        </span>
      </div>
    </div>
  );
}
