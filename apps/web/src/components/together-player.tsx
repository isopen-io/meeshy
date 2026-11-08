import { useCallback, useState } from 'react';

import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { TogetherSession } from '@/lib/together/together-live';
import { useTogetherSync } from '@/lib/together/use-together-sync';

/**
 * **LE LECTEUR « ENSEMBLE »** (#17055) — flottant, en bas de l'écran, sur toutes les
 * routes : on continue sa conversation pendant qu'on regarde. Les commandes sont
 * celles du navigateur (clavier, lecteur d'écran, plein écran) ; leurs gestes
 * partent chez l'autre, et les siens reviennent ici (`useTogetherSync`).
 */

export type TogetherSource = { readonly status: 'loading' } | { readonly status: 'ready'; readonly src: string } | { readonly status: 'unavailable' };

export function TogetherPlayerView({
  language,
  session,
  partnerName,
  source,
  clockOffsetMs,
  now,
  onSync,
  onLeave,
}: {
  readonly language: InterfaceLanguage;
  readonly session: TogetherSession;
  readonly partnerName: string;
  readonly source: TogetherSource;
  readonly clockOffsetMs: number;
  readonly now: () => number;
  readonly onSync: (state: { readonly playing: boolean; readonly positionMs: number }) => void;
  readonly onLeave: () => void;
}) {
  const [element, setElement] = useState<HTMLMediaElement | null>(null);
  const bind = useCallback((media: HTMLMediaElement | null) => setElement(media), []);
  useTogetherSync({ element, playback: session.playback, clockOffsetMs, now, onSync });
  const title = translateCircles(language, 'together.with', { name: partnerName });

  return (
    <section
      aria-label={title}
      data-together-player={session.sessionId}
      className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-4 sm:inset-x-auto sm:end-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)', pointerEvents: 'none' }}
    >
      <div
        className="grid w-full max-w-sm gap-2 overflow-hidden rounded-card p-2 shadow-lg"
        style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: '1px solid var(--color-edge)', pointerEvents: 'auto' }}
      >
        <div className="flex items-center justify-between gap-2 ps-2">
          <h2 className="text-body font-semibold">
            <span aria-hidden="true">{session.media === 'video' ? '🎬 ' : '🎧 '}</span>
            {title}
          </h2>
          <button
            type="button"
            data-together-leave=""
            onClick={onLeave}
            className="rounded-full px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, color: 'var(--color-error)', outlineColor: 'var(--color-brand)' }}
          >
            {translateCircles(language, 'together.leave')}
          </button>
        </div>
        {source.status === 'unavailable' ? (
          <p data-together-unavailable="" className="px-2 pb-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateCircles(language, 'together.unavailable')}
          </p>
        ) : source.status === 'loading' ? (
          <div aria-hidden="true" className="aspect-video w-full rounded-card bg-media-backdrop" />
        ) : session.media === 'video' ? (
          <video ref={bind} data-together-media="video" src={source.src} controls playsInline preload="auto" className="aspect-video w-full rounded-card bg-media-backdrop" />
        ) : (
          <audio ref={bind} data-together-media="audio" src={source.src} controls preload="auto" className="w-full" />
        )}
      </div>
    </section>
  );
}
