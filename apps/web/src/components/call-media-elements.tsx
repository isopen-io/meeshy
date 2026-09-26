import { useEffect, useRef } from 'react';
import { useStore } from 'zustand/react';

import { callOutputStore } from '@/lib/calls/call-output';

/**
 * **UN FLUX, UN ÉLÉMENT** (#6382) — `srcObject` ne passe pas par un attribut :
 * il se pose sur l'élément, à chaque changement de flux. Les vidéos sont
 * TOUJOURS muettes : le son d'un pair joue par son `<audio>`, monté par la
 * couche d'appel quel que soit l'affichage (plein écran ou pastille), pour
 * qu'un appel réduit continue de s'entendre.
 */

function useSrcObject<T extends HTMLMediaElement>(stream: MediaStream | null) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    if (stream !== null) void element.play?.().catch(() => undefined);
  }, [stream]);
  return ref;
}

/** `fit` : `cover` remplit le cadre (un visage) ; `contain` montre TOUT (un écran partagé, #8063 — rogner un écran en cache le texte). */
export function StreamVideo({
  stream,
  mirrored,
  className,
  label,
  fit = 'cover',
}: {
  readonly stream: MediaStream | null;
  readonly mirrored: boolean;
  readonly className?: string;
  readonly label?: string;
  readonly fit?: 'cover' | 'contain';
}) {
  const ref = useSrcObject<HTMLVideoElement>(stream);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-label={label}
      className={className}
      style={{ objectFit: fit, transform: mirrored ? 'scaleX(-1)' : undefined, backgroundColor: '#000' }}
    />
  );
}

type SinkableAudio = HTMLAudioElement & { readonly setSinkId?: (sinkId: string) => Promise<void> };

/**
 * La sortie choisie (#8046) : chaque pair, même arrivé APRÈS le choix, sort
 * sur le même casque. `''` rend la sortie par défaut du système. Là où
 * `setSinkId` manque (Safari iOS, WebView), le sélecteur ne propose pas de
 * sortie : rien à appliquer.
 */
export function StreamAudio({ stream }: { readonly stream: MediaStream }) {
  const ref = useSrcObject<HTMLAudioElement>(stream);
  const sinkId = useStore(callOutputStore, (state) => state.sinkId);
  useEffect(() => {
    const element = ref.current as SinkableAudio | null;
    if (element === null || typeof element.setSinkId !== 'function') return;
    void element.setSinkId(sinkId ?? '').catch(() => undefined);
  }, [sinkId, ref]);
  return <audio ref={ref} autoPlay data-call-audio="" data-call-sink={sinkId ?? 'default'} />;
}
