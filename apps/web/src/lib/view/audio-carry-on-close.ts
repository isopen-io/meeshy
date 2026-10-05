import { useCallback, useEffect, useRef } from 'react';

import { carryAudio, type CarriedAudio } from './audio-carry';

export type CarryProvider = () => Pick<CarriedAudio, 'attachment' | 'trackUrl' | 'trackLanguage' | 'positionMs' | 'rate'> | null;

/** Ce que la visionneuse sait de la page courante, et que le mini-lecteur garde (#9279). */
export type CarryContext = {
  readonly currentId: string | undefined;
  readonly title: string | null;
  readonly conversationId: string | null;
  readonly messageId: string | null;
};

/**
 * FERMER LA VISIONNEUSE N'ARRÊTE PAS LE VOCAL (#9256) — miroir
 * d'`AudioFullscreenView` iOS, qui n'a pas de `.onDisappear` : la page audio
 * ACTIVE enregistre de quoi reprendre sa lecture, et la visionneuse, en se
 * démontant, la confie au mini-lecteur (`carryAudio`).
 *
 * L'enregistrement porte l'id de sa page : seule la page COURANTE au moment
 * de fermer est reprise — une page audio quittée pour une vidéo, puis
 * démontée, ne relance jamais un vocal qu'on n'écoutait plus.
 *
 * #9279 — la reprise emporte aussi sa conversation : le toucher du
 * mini-lecteur l'ouvre, et il s'y efface. #9294 — et son message : la
 * conversation s'ouvre sur la bulle du vocal.
 */
export function useCarryOnClose(context: CarryContext) {
  const registeredRef = useRef<{ readonly id: string; readonly carry: CarryProvider } | null>(null);
  const currentRef = useRef(context);
  currentRef.current = context;

  useEffect(
    () => () => {
      const registered = registeredRef.current;
      const { currentId, title, conversationId, messageId } = currentRef.current;
      const resumed = registered !== null && registered.id === currentId ? registered.carry() : null;
      if (resumed !== null) carryAudio({ ...resumed, title, conversationId, messageId });
    },
    [],
  );

  return useCallback((id: string, carry: CarryProvider | null): void => {
    registeredRef.current = carry === null ? null : { id, carry };
  }, []);
}
