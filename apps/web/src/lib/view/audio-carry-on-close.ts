import { useCallback, useEffect, useRef } from 'react';

import { carryAudio, type CarriedAudio } from './audio-carry';

export type CarryProvider = () => Omit<CarriedAudio, 'title'> | null;

/**
 * FERMER LA VISIONNEUSE N'ARRÊTE PAS LE VOCAL (#9256) — miroir
 * d'`AudioFullscreenView` iOS, qui n'a pas de `.onDisappear` : la page audio
 * ACTIVE enregistre de quoi reprendre sa lecture, et la visionneuse, en se
 * démontant, la confie au mini-lecteur (`carryAudio`).
 *
 * L'enregistrement porte l'id de sa page : seule la page COURANTE au moment
 * de fermer est reprise — une page audio quittée pour une vidéo, puis
 * démontée, ne relance jamais un vocal qu'on n'écoutait plus.
 */
export function useCarryOnClose({ currentId, title }: { readonly currentId: string | undefined; readonly title: string | null }) {
  const registeredRef = useRef<{ readonly id: string; readonly carry: CarryProvider } | null>(null);
  const currentRef = useRef({ currentId, title });
  currentRef.current = { currentId, title };

  useEffect(
    () => () => {
      const registered = registeredRef.current;
      const resumed = registered !== null && registered.id === currentRef.current.currentId ? registered.carry() : null;
      if (resumed !== null) carryAudio({ ...resumed, title: currentRef.current.title });
    },
    [],
  );

  return useCallback((id: string, carry: CarryProvider | null): void => {
    registeredRef.current = carry === null ? null : { id, carry };
  }, []);
}
