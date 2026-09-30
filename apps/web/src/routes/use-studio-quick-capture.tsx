import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';

import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import { readFlashIntensity, writeFlashIntensity } from '@/lib/stories/studio-capture-gestures';
import { quickCaptureHintLines, quickCaptureOffered } from '@/lib/stories/studio-quick-capture';
import type { StudioCameraIntent, StudioHoldDrag } from '@/routes/story-compose-camera';
import type { StudioSceneCapture } from '@/routes/story-compose-scene';

/** LA CAMÉRA, CHARGÉE À LA DEMANDE — elle ne pèse sur le chunk du studio que
 * si l'auteur touche une scène vide. */
const StudioCamera = lazy(() => import('@/routes/story-compose-camera').then((m) => ({ default: m.StudioCamera })));

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
  engine,
}: {
  readonly lang: InterfaceLanguage;
  readonly kind: PublicationKind;
  /** Ce que `quickCaptureOffered` lit de la scène — la caméra, le hook la connaît. */
  readonly scene: Omit<Parameters<typeof quickCaptureOffered>[0], 'cameraOpen'>;
  readonly onTake: (file: File) => void;
  /** Injectable pour les témoins ; la production prend le moteur navigateur. */
  readonly engine?: CameraEngine;
}): {
  readonly capture: StudioSceneCapture | null;
  readonly cameraOpen: boolean;
  readonly cameraLayer: ReactNode;
  /** « Reprendre une photo » (#8716) — le viseur ARMÉ sur une scène qui a
   * déjà un fond : la prise le remplace, la sortie le laisse intact. */
  readonly retake: () => void;
} {
  const [intent, setIntent] = useState<StudioCameraIntent | null>(null);
  const [holding, setHolding] = useState(false);
  const [flash, setFlash] = useState(false);
  const [intensity, setIntensity] = useState(() => readFlashIntensity(viewerStorage()));
  const holdDrag = useRef<StudioHoldDrag['current']>(null);
  const photo = kind !== 'REEL';

  const close = () => {
    setIntent(null);
    setHolding(false);
  };

  const capture: StudioSceneCapture | null =
    quickCaptureOffered({ ...scene, cameraOpen: intent !== null })
      ? {
          hintLines: quickCaptureHintLines(kind),
          // Le premier toucher ARME le viseur (#8711) : le second, sur lui, prend.
          onTap: () => setIntent('arm'),
          onHoldStart: () => {
            setHolding(true);
            setIntent('hold');
          },
          onHoldEnd: () => setHolding(false),
          onHoldMove: (dx, dy) => holdDrag.current?.(dx, dy),
          onPhoto: photo ? () => setIntent('arm') : null,
          onFilm: () => setIntent('film'),
        }
      : null;

  const cameraLayer =
    intent === null ? null : (
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
          {...(engine !== undefined ? { engine } : {})}
          onTake={(file) => {
            close();
            onTake(file);
          }}
          onClose={close}
        />
      </Suspense>
    );

  return { capture, cameraOpen: intent !== null, cameraLayer, retake: () => setIntent('arm') };
}
