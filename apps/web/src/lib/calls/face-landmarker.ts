import { FaceLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';

import modelUrl from './face-landmarker.task?url';
import type { LandmarkerPort } from './face-landmark-detector';

/**
 * **LE MODÈLE À 478 POINTS** (W15, #11321) — MediaPipe Face Landmarker
 * (Apache-2.0, `face_landmarker.task` en float16, ~3,7 Mo : détecteur de
 * visage, maillage de 478 repères, sans les blendshapes), exécuté par
 * `@mediapipe/tasks-vision` en WebAssembly sur le PROCESSEUR. Comme le
 * segmenter (`video-effects-segmentation.ts`), tout est servi par Meeshy :
 * aucun tiers ne voit passer une image ni une requête.
 *
 * - il VIT DANS LE CHUNK DU SEGMENTER (`video-effects-segmentation.ts` le
 *   ré-exporte ; `budgets.json` › `call_video_segmentation`) : le paquet
 *   MediaPipe (~44 Ko gzip) est le même, et deux chunks qui l'importent
 *   en auraient fait un troisième, commun, que ni le budget ni le précache
 *   (`vite/pwa.ts` › `globIgnores`) ne nomment. Il n'est chargé qu'à la
 *   première lens ancrée au visage d'un appareil de palier A, jamais précaché ;
 * - le chargeur et le binaire WebAssembly sont ceux du segmenter (mêmes URL,
 *   donc téléchargés une fois) ; le modèle est un fichier à part
 *   (`assets/face-landmarker-*.task`, ~3,7 Mo).
 *
 * Un seul visage est suivi (celui de la caméra) ; le chargeur est importé ICI
 * pour que le chunk marche dans un worker module comme sur le fil principal.
 */
export async function loadFaceLandmarker(): Promise<LandmarkerPort> {
  await import(/* @vite-ignore */ wasmLoaderUrl);
  const landmarker = await FaceLandmarker.createFromOptions(
    { wasmLoaderPath: '', wasmBinaryPath: wasmBinaryUrl },
    { baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false },
  );
  return {
    detect: (image, timestampMs) => {
      const result = landmarker.detectForVideo(image as Parameters<typeof landmarker.detectForVideo>[0], timestampMs);
      const face = result.faceLandmarks[0];
      return face === undefined ? null : face.map(({ x, y, z }) => ({ x, y, z }));
    },
    close: () => landmarker.close(),
  };
}
