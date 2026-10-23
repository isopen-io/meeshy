import { useEffect, useRef } from 'react';

import type { RecentMediaProtection } from './recent-media-policy';

type Remember = (media: { readonly src: string; readonly protection: RecentMediaProtection }) => Promise<unknown>;

/** Chargée À LA DEMANDE : un lecteur qui ne lit rien ne paie pas la garde. */
const rememberLazily: Remember = (media) => import('./recent-media-store').then(({ rememberRecentMedia }) => rememberRecentMedia(media));

/**
 * UN MÉDIA EST VU QUAND SA LECTURE DÉMARRE (#11326) — premier `playing` de
 * l'élément VISIBLE : la garde du seau « récents » range alors son fichier
 * entier (si la loi l'admet). Une fois par élément et par source ; un voisin
 * préchargé, qui ne joue pas, n'est jamais « vu ».
 */
export function useRememberSeenMedia({
  element,
  src,
  protection,
  active,
  remember = rememberLazily,
}: {
  readonly element: HTMLMediaElement | null;
  readonly src: string;
  readonly protection: RecentMediaProtection;
  readonly active: boolean;
  readonly remember?: Remember;
}): void {
  const remembered = useRef<string | null>(null);
  useEffect(() => {
    if (element === null || !active || remembered.current === src) return undefined;
    const onPlaying = (): void => {
      if (remembered.current === src) return;
      remembered.current = src;
      void remember({ src, protection }).catch(() => undefined);
    };
    element.addEventListener('playing', onPlaying);
    return () => element.removeEventListener('playing', onPlaying);
  }, [element, src, protection, active, remember]);
}
