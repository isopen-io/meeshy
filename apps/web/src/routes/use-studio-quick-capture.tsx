import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';

import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import type { CameraEngine, CameraOpenResult } from '@/lib/stories/studio-camera-engine';
import { readFlashIntensity, writeFlashIntensity } from '@/lib/stories/studio-flash-intensity';
import { quickCaptureHintLines, quickCaptureOffered } from '@/lib/stories/studio-quick-capture';
import type { StudioCameraIntent, StudioHoldDrag } from '@/routes/story-compose-camera';
import type { StudioSceneCapture } from '@/routes/story-compose-scene';

/** LA CAMÉRA, CHARGÉE À LA DEMANDE — elle ne pèse sur le chunk du studio que
 * si l'auteur touche une scène vide. */
const StudioCamera = lazy(() => import('@/routes/story-compose-camera').then((m) => ({ default: m.StudioCamera })));

/** LE MOTEUR DE LA CAMÉRA, CHARGÉ À LA DEMANDE (#10322) — comme son écran :
 * il ne pèse sur le chunk du studio que si l'auteur peut ouvrir la caméra.
 * Préchargé dès qu'une scène vide l'offre, il est déjà là au geste. */
let browserEngine: Promise<CameraEngine> | null = null;
const loadBrowserEngine = (): Promise<CameraEngine> => {
  browserEngine ??= import('@/lib/stories/studio-camera-engine').then((m) => m.createBrowserCameraEngine());
  return browserEngine;
};

/** Le flux demandé au geste, et s'il a été repris par l'écran de la caméra. */
type EarlyStream = { readonly pending: Promise<CameraOpenResult>; readonly adopted: boolean };

/** `localStorage` peut LEVER à la seule lecture (données bloquées). */
function viewerStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * **LA CAPTURE RAPIDE D'UNE SCÈNE VIDE** (#8654, jumelle de #8653) — l'état
 * de la caméra du studio, sorti de `story-compose.tsx` (budget de taille) :
 * `capture` pour la scène (l'indication grise et ses gestes, `null` quand le
 * geste n'est pas offert), `cameraLayer` pour l'écran. Ce que la caméra rend
 * est POSÉ par `onTake` ; la quitter ne touche pas au brouillon.
 *
 * Le FLASH choisi dans la caméra est gardé le temps du studio : la capture
 * rapide suivante l'honore sans rouvrir de réglage. L'INTENSITÉ du blanc
 * (#8672) est, elle, mémorisée par lecteur d'une ouverture à l'autre.
 */
export function useStudioQuickCapture({
  lang,
  kind,
  scene,
  onTake,
  engine: injected,
  armsOnOpen = false,
}: {
  readonly lang: InterfaceLanguage;
  readonly kind: PublicationKind;
  /** Ce que `quickCaptureOffered` lit de la scène — la caméra, le hook la connaît. */
  readonly scene: Omit<Parameters<typeof quickCaptureOffered>[0], 'cameraOpen'>;
  readonly onTake: (file: File) => void;
  /** Injectable pour les témoins ; la production prend le moteur navigateur. */
  readonly engine?: CameraEngine;
  /** LA CAMÉRA DE LA BARRE (#9123) : le viseur s'ouvre ARMÉ, le geste de
   * l'auteur a déjà dit « prendre » — règle d'ORIGINE, distincte de #4851. */
  readonly armsOnOpen?: boolean;
}): {
  readonly capture: StudioSceneCapture | null;
  readonly cameraOpen: boolean;
  readonly cameraLayer: ReactNode;
  /** « Reprendre une photo » (#8716) — le viseur ARMÉ sur une scène qui a
   * déjà un fond : la prise le remplace, la sortie le laisse intact. */
  readonly retake: () => void;
} {
  const [intent, setIntent] = useState<StudioCameraIntent | null>(armsOnOpen ? 'arm' : null);
  const [holding, setHolding] = useState(false);
  const [flash, setFlash] = useState(false);
  const [intensity, setIntensity] = useState(() => readFlashIntensity(viewerStorage()));
  const holdDrag = useRef<StudioHoldDrag['current']>(null);
  const photo = kind !== 'REEL';
  const [engine, setEngine] = useState<CameraEngine | null>(injected ?? null);
  const earlyRef = useRef<EarlyStream | null>(null);
  const engineNow = (): Promise<CameraEngine> =>
    engine !== null
      ? Promise.resolve(engine)
      : loadBrowserEngine().then((loaded) => {
          setEngine(loaded);
          return loaded;
        });

  /* LE FLUX DEMANDÉ AU GESTE (#10307) — la caméra du téléphone s'allume
     pendant que l'écran de la caméra se charge ; l'écran le reprend
     (`preopened`). Un flux que personne n'a repris est relâché. */
  const dropEarly = () => {
    const early = earlyRef.current;
    earlyRef.current = null;
    if (early === null || early.adopted) return;
    void early.pending.then((result) => {
      if (result.ok) void engineNow().then((loaded) => loaded.release(result.stream));
    });
  };
  const open = (next: StudioCameraIntent) => {
    if (intent === null && earlyRef.current === null) {
      const pending = engine !== null ? engine.open('environment') : engineNow().then(
            (loaded) => loaded.open('environment'),
            (): CameraOpenResult => ({ ok: false }),
          );
      earlyRef.current = { pending, adopted: false };
    }
    setIntent(next);
  };
  const preopened = (): Promise<CameraOpenResult> | null => {
    const early = earlyRef.current;
    if (early === null || early.adopted) return null;
    earlyRef.current = { ...early, adopted: true };
    return early.pending;
  };
  useEffect(() => dropEarly, []);

  const close = () => {
    dropEarly();
    setIntent(null);
    setHolding(false);
  };

  const capture: StudioSceneCapture | null =
    quickCaptureOffered({ ...scene, cameraOpen: intent !== null })
      ? {
          hintLines: quickCaptureHintLines(kind),
          // Le premier toucher ARME le viseur (#8711) : le second, sur lui, prend.
          onTap: () => open('arm'),
          onHoldStart: () => {
            setHolding(true);
            open('hold');
          },
          onHoldEnd: () => setHolding(false),
          onHoldMove: (dx, dy) => holdDrag.current?.(dx, dy),
          onPhoto: photo ? () => open('arm') : null,
          onFilm: () => open('film'),
        }
      : null;

  const wanted = capture !== null || intent !== null;
  useEffect(() => {
    if (wanted && engine === null) void engineNow().catch(() => undefined);
  }, [wanted, engine]);

  const cameraLayer =
    intent === null || engine === null ? null : (
      <Suspense fallback={null}>
        <StudioCamera
          lang={lang}
          kind={kind}
          intent={intent}
          holding={holding}
          flash={flash}
          onFlash={setFlash}
          intensity={intensity}
          onIntensity={(next) => {
            setIntensity(next);
            writeFlashIntensity(viewerStorage(), next);
          }}
          holdDrag={holdDrag}
          engine={engine}
          preopened={preopened}
          onTake={(file) => {
            close();
            onTake(file);
          }}
          onClose={close}
        />
      </Suspense>
    );

  return { capture, cameraOpen: intent !== null, cameraLayer, retake: () => open('arm') };
}
