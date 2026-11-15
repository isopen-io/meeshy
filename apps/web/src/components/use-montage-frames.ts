import { useEffect, useMemo, useState } from 'react';

import { findCachedConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { packQueryKeys } from '@/lib/api/pack-query-keys';
import { loadCaptureFrameShelf, type CaptureFrameShelf } from '@/lib/api/packs-capture-frame';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { visibleTiles } from '@/lib/calls/call-capture-tiles';
import { frameDate, montageCircle, type MontageCall, type MontageCircle } from '@/lib/calls/call-montage-circle';
import type { Size } from '@/lib/calls/call-montage-shapes';
import type { FrameChrome } from '@/lib/calls/frames/frame-chrome-reserve';
import type { CaptureFrame } from '@/lib/calls/frames/frame-spec';
import { shelvedStudio } from '@/lib/calls/frames/frame-shelf';
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

/** Les ambiances installées (#10169) ; `null` = inconnu, rien ne se cache. */
export type ShelfLoader = (signal: AbortSignal) => Promise<CaptureFrameShelf>;

export const browserShelf: ShelfLoader = (signal) => loadCaptureFrameShelf({ ...apiDeps, signal });

const SHELF_KEY = packQueryKeys('capture-frame').installed;

/** La dernière étagère connue, dans le cache des requêtes : servie à l'entrée du mode, avant la relecture. */
const cachedShelf = (): CaptureFrameShelf => appQueryClient.getQueryData<readonly string[]>(SHELF_KEY) ?? null;

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
  readonly loadShelf: ShelfLoader;
};

/**
 * L'étagère des ambiances (#10169, LC) : la dernière connue tout de suite
 * (cache d'abord), relue à chaque entrée du mode — une ambiance retirée sur un
 * autre appareil l'est ici à la revalidation suivante. Elle ne restreint que
 * l'OFFRE de l'atelier (`shelvedStudio`) : un cadre se résout toujours.
 */
function useCaptureFrameShelf(enabled: boolean, loadShelf: ShelfLoader): CaptureFrameShelf {
  const [shelf, setShelf] = useState<CaptureFrameShelf>(cachedShelf);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    loadShelf(controller.signal).then(
      (next) => {
        if (controller.signal.aborted || next === null) return;
        appQueryClient.setQueryData(SHELF_KEY, next);
        setShelf(next);
      },
      () => undefined,
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return shelf;
}

export function useMontageFrames({ loadFrames, call, circleOf, language, loadShelf }: Input): { readonly studio: FrameStudio | null; readonly circle: MontageCircle | null } {
  const [studio, setStudio] = useState<FrameStudio | null>(null);
  const shelf = useCaptureFrameShelf(loadFrames !== undefined, loadShelf);
  const shelved = useMemo(() => (studio === null ? null : shelvedStudio(studio, shelf)), [studio, shelf]);
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
  return { studio: shelved, circle: call === undefined ? null : circleOf(call, language) };
}

/**
 * **LES BANDES QUE LES COMMANDES DU MODE COUVRENT** (#10481, jumelle de
 * `CallLiveFrameRule.chromeReserve`, iOS #9777) — mesurées sur l'écran tel
 * qu'il est rendu : en haut, l'encart sûr de l'écran d'appel (`stage`, son
 * `padding-top`) ; en bas, de la plus haute commande VISIBLE du mode
 * (`controls` : ambiances, carrousel, barre — et le statut ou l'aide quand
 * ils s'affichent ; un statut vide, transparent, ne couvre rien) jusqu'au
 * bord. L'atelier les rapporte à la toile de l'aperçu, posée `object-contain`.
 */
export function montageChrome({ stage, controls, viewport }: { readonly stage: Element | null; readonly controls: Element | null; readonly viewport: Size }): FrameChrome | null {
  const view = controls?.ownerDocument.defaultView ?? null;
  if (controls === null || view === null) return null;
  const top = stage === null ? 0 : Number.parseFloat(view.getComputedStyle(stage).paddingTop) || 0;
  const shown = [...controls.children].filter((child) => {
    const style = view.getComputedStyle(child);
    return style.opacity !== '0' && style.visibility !== 'hidden' && child.getBoundingClientRect().height > 0;
  });
  const highest = Math.min(...shown.map((child) => child.getBoundingClientRect().top), viewport.height);
  return { viewport, top, bottom: viewport.height - highest };
}

/** Peint `frame` dans `canvas`, à sa taille, avec les visages que la scène montre à cet instant — resserré entre les commandes `chrome` quand elles le couvrent. */
export function paintFramed(canvas: HTMLCanvasElement | null, stage: Element | null, studio: FrameStudio, frame: CaptureFrame, circle: MontageCircle, tier: FrameTier, chrome: FrameChrome | null = null): void {
  const context = canvas?.getContext('2d') ?? null;
  if (canvas === null || context === null) return;
  const size = { width: canvas.width, height: canvas.height };
  const faces = studio.faces(circle.people, stage === null ? [] : visibleTiles(stage));
  context.clearRect(0, 0, size.width, size.height);
  studio.draw(context, frame, { people: circle.people, faces, texts: circle.texts, size, ...(chrome === null ? {} : { chrome }) }, tier);
}
