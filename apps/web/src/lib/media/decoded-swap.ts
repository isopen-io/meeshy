import { useEffect, useRef, useState } from 'react';

/** Décode une image HORS du DOM — résout quand elle peut se peindre sans
 * attente ; un échec résout aussi (la bascule ne reste jamais bloquée). */
export type ImageDecode = (src: string) => Promise<void>;

export const browserImageDecode: ImageDecode = (src) => {
  const image = new Image();
  image.src = src;
  return image.decode().catch(() => undefined);
};

/** Le temps pendant lequel l'image qui PART reste sous celle qui arrive. */
export const DECODED_SWAP_FADE_MS = 320;

/**
 * **UNE IMAGE NE CÈDE SA PLACE QU'À UNE IMAGE DÉCODÉE** (#8534, porteur
 * 2026-09-28 : « un scintillement, comme si l'image était rechargée ; la
 * bascule doit être imperceptible ») — `shown` garde la source déjà peinte
 * tant que la suivante n'est pas décodée ; à la bascule, `leaving` porte
 * l'ancienne le temps d'un fondu (l'hôte la peint dessous). Une première
 * source, ou un changement qui garde la même `src`, passe tout de suite :
 * il n'y a rien à remplacer.
 */
export function useDecodedSwap<T extends { readonly src: string }>(
  value: T | null,
  decode: ImageDecode = browserImageDecode,
): { readonly shown: T | null; readonly leaving: T | null } {
  const [shown, setShown] = useState<T | null>(value);
  const [leaving, setLeaving] = useState<T | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const current = shownRef.current;
    if (value === null || current === null || current.src === value.src) {
      setShown(value);
      return;
    }
    let cancelled = false;
    void decode(value.src).then(() => {
      if (cancelled) return;
      setLeaving(shownRef.current);
      setShown(value);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (leaving === null) return;
    const timer = setTimeout(() => setLeaving(null), DECODED_SWAP_FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return { shown, leaving };
}
