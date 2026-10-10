import { useEffect, useState } from 'react';

import { findCachedConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { visibleTiles } from '@/lib/calls/call-capture-tiles';
import { frameDate, montageCircle, type MontageCall, type MontageCircle } from '@/lib/calls/call-montage-circle';
import type { CaptureFrame } from '@/lib/calls/frames/frame-spec';
import type { createFrameStudio, FrameStudio, FrameTier } from '@/lib/calls/frames/frame-studio';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES CADRES DANS LE MODE MONTAGE** (#8742, #8743) — ce que le mode
 * Montage tient des cadres de capture sans les importer : l'atelier arrive
 * par `loadFrames` (un `import()` que l'écran d'appel lui remet, pour que le
 * catalogue et ses peintres vivent dans LEUR chunk, `call_frame_studio`,
 * chargé à l'entrée du mode et jamais avant) ; ses polices partent avec lui.
 *
 * Le cercle de l'appel (qui, quels mots) se relit à chaque rendu : une
 * arrivée ou un départ change `n` dans la même image.
 */

export type FrameStudioModule = { readonly createFrameStudio: typeof createFrameStudio };

export type FrameStudioLoader = () => Promise<FrameStudioModule>;

export type CircleOf = (call: MontageCall, language: InterfaceLanguage) => MontageCircle;

/** Le cercle depuis la session (qui je suis) et la conversation en cache (pseudos, titre, accent) — aucune requête. */
export const browserCircle: CircleOf = (call, language) =>
  montageCircle({
    call,
    viewer: resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }),
    conversation: findCachedConversation(appQueryClient, call.conversationId),
    date: frameDate(new Date(), language),
  });

type Input = {
  readonly loadFrames: FrameStudioLoader | undefined;
  readonly call: MontageCall | undefined;
  readonly circleOf: CircleOf;
  readonly language: InterfaceLanguage;
};

export function useMontageFrames({ loadFrames, call, circleOf, language }: Input): { readonly studio: FrameStudio | null; readonly circle: MontageCircle | null } {
  const [studio, setStudio] = useState<FrameStudio | null>(null);
  useEffect(() => {
    if (loadFrames === undefined) return undefined;
    const alive = { current: true };
    loadFrames().then(
      (module) => {
        if (alive.current) setStudio(module.createFrameStudio());
      },
      () => undefined,
    );
    return () => {
      alive.current = false;
    };
  }, []);
  return { studio, circle: call === undefined ? null : circleOf(call, language) };
}

/** Peint `frame` dans `canvas`, à sa taille, avec les visages que la scène montre à cet instant. */
export function paintFramed(canvas: HTMLCanvasElement | null, stage: Element | null, studio: FrameStudio, frame: CaptureFrame, circle: MontageCircle, tier: FrameTier): void {
  const context = canvas?.getContext('2d') ?? null;
  if (canvas === null || context === null) return;
  const size = { width: canvas.width, height: canvas.height };
  const faces = studio.faces(circle.people, stage === null ? [] : visibleTiles(stage));
  context.clearRect(0, 0, size.width, size.height);
  studio.draw(context, frame, { people: circle.people, faces, texts: circle.texts, size }, tier);
}
