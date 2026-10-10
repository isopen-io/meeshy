import { ImageSegmenter } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';

import modelUrl from './selfie-segmenter.tflite?url';
import type { MaskFrame, SegmenterPort } from './video-effects-blur';

/**
 * **LE MODÈLE DE SEGMENTATION** (#8471) — le « selfie segmenter » de MediaPipe
 * (Apache-2.0, ~250 Ko en float16, entrée 256 × 256), exécuté par
 * `@mediapipe/tasks-vision` (Apache-2.0) en WebAssembly sur le PROCESSEUR :
 * le GPU reste au compositeur. Tout est servi par Meeshy — aucun tiers ne voit
 * passer une image ni une requête :
 *
 * - ce chunk (`budgets.json` › `call_video_segmentation`) n'est chargé qu'au
 *   premier flou que la caméra ne fait pas, et jamais précaché ;
 * - le chargeur et le binaire WebAssembly (`assets/vision_wasm_module_internal-*`,
 *   ~3,4 Mo compressés) et le modèle (`assets/selfie-segmenter-*.tflite`) sont
 *   des fichiers à part, téléchargés à ce moment-là seulement.
 *
 * Le chargeur est importé ICI (il pose `ModuleFactory`), ce qui marche dans
 * un worker module comme sur le fil principal (le repli) — MediaPipe, laissé
 * seul, l'injecterait en `<script>` classique hors worker.
 */

type ConfidenceMask = { readonly width: number; readonly height: number; readonly getAsFloat32Array: () => Float32Array };

/** Le masque de la PERSONNE : le dernier des masques de confiance (le seul, pour ce modèle). */
export function personMask(masks: readonly ConfidenceMask[] | undefined): MaskFrame | null {
  const mask = masks?.[masks.length - 1];
  return mask === undefined ? null : { width: mask.width, height: mask.height, data: Float32Array.from(mask.getAsFloat32Array()) };
}

export async function loadSelfieSegmenter(): Promise<SegmenterPort> {
  await import(/* @vite-ignore */ wasmLoaderUrl);
  const segmenter = await ImageSegmenter.createFromOptions(
    { wasmLoaderPath: '', wasmBinaryPath: wasmBinaryUrl },
    { baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false },
  );
  return {
    segment: (image, timestampMs) => {
      const result = segmenter.segmentForVideo(image, timestampMs);
      try {
        return personMask(result.confidenceMasks);
      } finally {
        result.close();
      }
    },
    close: () => segmenter.close(),
  };
}
