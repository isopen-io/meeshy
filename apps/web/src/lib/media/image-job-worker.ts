import { createImageJobHost, type ImageJobEnv, type ImageJobReply, type ImageJobRequest } from './image-job';
import { canvasPhotoEnv } from './photo-develop-core';

/**
 * **LE WORKER D'IMAGE** (#11310) — la colle : `self`, le décodeur et la
 * réduction du navigateur, le canevas hors écran. Toute la logique vit dans
 * `image-job.ts`. Bâti par Vite en worker MODULE (`image-job-client.ts`).
 */

type WorkerScope = {
  onmessage: ((event: MessageEvent<ImageJobRequest>) => void) | null;
  readonly postMessage: (message: ImageJobReply) => void;
};

const scope = self as unknown as WorkerScope;

const bitmapPhoto = (bitmap: ImageBitmap) => ({ image: bitmap, size: { width: bitmap.width, height: bitmap.height }, close: () => bitmap.close() });

const env: ImageJobEnv = {
  surface: canvasPhotoEnv.surface,
  decode: async (blob) => bitmapPhoto(await createImageBitmap(blob, { imageOrientation: 'from-image' })),
  scale: async (image, size) => bitmapPhoto(await createImageBitmap(image, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' })),
};

const host = createImageJobHost({ env, post: (reply) => scope.postMessage(reply) });

scope.onmessage = (event) => void host.receive(event.data);
