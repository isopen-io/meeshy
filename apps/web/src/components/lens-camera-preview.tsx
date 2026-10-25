import { useEffect, useRef, useState } from 'react';

import { createCameraEffects, type CameraEffectsPort } from '@/lib/calls/camera-effects';
import { browserColorSupport, NO_EFFECTS } from '@/lib/calls/video-effects';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { lensEditorText } from '@/lib/lens-packs/editor-texts';
import type { LensSettings } from '@/lib/meeshy-lens/lens-stage';

/**
 * **L'APERÇU CAMÉRA D'UNE LENS EN COMPOSITION** (W16, #11322) — la caméra ne
 * s'ouvre qu'au geste. Son image passe par le MÊME moteur que la vidéo d'un
 * appel (`createCameraEffects`, dont le traitement vit dans le worker des
 * effets, `video-effects-pipeline.ts`) : ce que le partenaire voit est ce que
 * la lens rendra. Chaque retouche du brouillon est REPOSÉE (`refresh`) sur
 * l'image en cours, sans rouvrir la caméra ; arrêter ou quitter la rend
 * (`release`). Rien ne part sur le réseau.
 *
 * Les reposes passent UNE À UNE, chacune sur la piste que la précédente a
 * laissée : une repose que l'arrêt a devancée rend ce qu'elle a bâti (sinon
 * un traitement survivrait à l'aperçu), et une retouche faite pendant que la
 * caméra s'ouvrait est reposée dès que l'aperçu vit.
 */
export type CameraPreviewPort = {
  readonly acquire: () => Promise<MediaStreamTrack>;
  readonly effects: (lens: () => LensSettings | undefined) => CameraEffectsPort;
  readonly attach: (video: HTMLVideoElement | null, track: MediaStreamTrack | null) => void;
};

export const browserCameraPreviewPort: CameraPreviewPort = {
  acquire: () => import('@/lib/calls/call-media').then((module) => module.acquireCamera({ facing: 'user' })),
  effects: (lens) =>
    createCameraEffects({
      effects: () => NO_EFFECTS,
      lens,
      colorSupported: browserColorSupport,
      loadPipeline: () => import('@/lib/calls/video-effects-pipeline').then((module) => (camera, settings) => module.createEffectsPipeline(camera, settings)),
    }),
  attach: (video, track) => {
    if (video === null) return;
    video.srcObject = track === null || typeof MediaStream === 'undefined' ? null : new MediaStream([track]);
    if (track !== null) void video.play().catch(() => undefined);
  },
};

type Live = { readonly sent: MediaStreamTrack; readonly effects: CameraEffectsPort };
type Phase = 'idle' | 'opening' | 'live' | 'refused';

export function LensCameraPreview({
  language,
  settings,
  port = browserCameraPreviewPort,
}: {
  readonly language: InterfaceLanguage;
  readonly settings: LensSettings | null;
  readonly port?: CameraPreviewPort;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const video = useRef<HTMLVideoElement>(null);
  const current = useRef<LensSettings | null>(settings);
  const live = useRef<Live | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);

  const stop = (): void => {
    const shown = live.current;
    if (shown === null) return;
    live.current = null;
    shown.effects.release(shown.sent);
    port.attach(video.current, null);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const shown = live.current;
      live.current = null;
      shown?.effects.release(shown.sent);
    };
  }, []);

  const repose = (): void => {
    queue.current = queue.current.then(async () => {
      const shown = live.current;
      if (shown === null) return;
      const next = await shown.effects.refresh(shown.sent).catch(() => shown.sent);
      if (live.current !== shown) {
        if (next !== shown.sent) shown.effects.release(next);
        return;
      }
      if (next === shown.sent) return;
      live.current = { ...shown, sent: next };
      port.attach(video.current, next);
    });
  };

  useEffect(() => {
    current.current = settings;
    if (live.current !== null) repose();
  }, [settings, port]);

  const start = async (): Promise<void> => {
    setPhase('opening');
    const camera = await port.acquire().catch(() => null);
    if (camera === null) {
      if (mounted.current) setPhase('refused');
      return;
    }
    try {
      const asked = current.current;
      const effects = port.effects(() => current.current ?? undefined);
      const sent = await effects.wrap(camera);
      if (!mounted.current) {
        effects.release(sent);
        return;
      }
      live.current = { sent, effects };
      port.attach(video.current, sent);
      setPhase('live');
      if (current.current !== asked) repose();
    } catch {
      camera.stop();
      if (mounted.current) setPhase('refused');
    }
  };

  const end = (): void => {
    stop();
    setPhase('idle');
  };

  const isLive = phase === 'live';

  return (
    <section aria-labelledby="lens-preview-title" data-lens-preview className="grid gap-2 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <h4 id="lens-preview-title" className="text-caption font-semibold">
        {lensEditorText(language, 'preview.title')}
      </h4>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {lensEditorText(language, 'preview.hint')}
      </p>
      <video
        ref={video}
        {...(isLive ? { 'data-lens-preview-live': '' } : {})}
        hidden={!isLive}
        aria-label={lensEditorText(language, 'preview.title')}
        muted
        playsInline
        autoPlay
        className="aspect-[3/4] w-full max-w-xs justify-self-center rounded-2xl object-cover"
        style={{ backgroundColor: 'var(--color-ios-fill)' }}
      />
      {isLive ? (
        <button type="button" data-lens-preview-stop onClick={end} className="min-h-11 justify-self-start rounded-full px-4" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
          {lensEditorText(language, 'preview.stop')}
        </button>
      ) : (
        <button
          type="button"
          data-lens-preview-try
          disabled={phase === 'opening'}
          aria-busy={phase === 'opening'}
          onClick={() => void start()}
          className="min-h-11 justify-self-start rounded-full px-4 font-semibold"
          style={{ backgroundColor: 'var(--color-ios-fill)' }}
        >
          {lensEditorText(language, 'preview.try')}
        </button>
      )}
      {phase === 'refused' ? (
        <p role="alert" data-lens-preview-refused className="text-caption" style={{ color: 'var(--color-error)' }}>
          {lensEditorText(language, 'preview.refused')}
        </p>
      ) : null}
    </section>
  );
}
