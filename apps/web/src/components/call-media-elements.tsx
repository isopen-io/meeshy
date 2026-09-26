import { useEffect, useRef } from 'react';

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

export function StreamVideo({ stream, mirrored, className, label }: { readonly stream: MediaStream | null; readonly mirrored: boolean; readonly className?: string; readonly label?: string }) {
  const ref = useSrcObject<HTMLVideoElement>(stream);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-label={label}
      className={className}
      style={{ objectFit: 'cover', transform: mirrored ? 'scaleX(-1)' : undefined, backgroundColor: '#000' }}
    />
  );
}

export function StreamAudio({ stream }: { readonly stream: MediaStream }) {
  const ref = useSrcObject<HTMLAudioElement>(stream);
  return <audio ref={ref} autoPlay data-call-audio="" />;
}
