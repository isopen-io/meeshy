import { developedSize, developPhoto, type DecodedPhoto, type PhotoEnv, type PhotoLook, type PhotoOutput, type PhotoSize } from './photo-develop-core';

/**
 * **LE TRAVAIL D'IMAGE, DÉCRIT PAR DES DONNÉES** (#11310) — ce que le fil
 * principal confie à un worker, et ce que le worker en fait. Une demande est
 * une valeur clonable (un fichier, ou un cadre transféré) : le worker n'en
 * reçoit ni fonction ni élément du DOM.
 *
 * La chaîne est la même pour une photo de la caméra du système (look, JPEG) et
 * pour toute pièce qui part sur le réseau (WebP, repli JPEG, PNG si
 * transparente) : décoder, RÉDUIRE AU DÉCODAGE (`createImageBitmap` avec
 * `resizeWidth` — la photo de 12 Mpx ne vit jamais en pleine taille sur un
 * canevas), retoucher, encoder. L'orientation est appliquée au décodage ; les
 * métadonnées (EXIF, GPS) ne survivent pas à l'encodage.
 *
 * Le navigateur est INJECTÉ (`ImageJobEnv`) : `bun test` n'a ni worker ni
 * canevas.
 */

export type ImageJobInput =
  | { readonly kind: 'file'; readonly blob: Blob }
  /** Un cadre déjà recadré et réduit à la taille voulue (`photo-develop.ts`), transféré au worker. */
  | { readonly kind: 'frame'; readonly bitmap: ImageBitmap };

export type ImageJob = {
  readonly input: ImageJobInput;
  readonly maxEdge: number;
  readonly look: PhotoLook | null;
  readonly output: PhotoOutput;
};

export type ImageJobRequest = { readonly id: number; readonly job: ImageJob };

export type ImageJobReply = { readonly id: number; readonly blob: Blob | null };

export type ImageJobEnv = PhotoEnv & {
  readonly decode: (blob: Blob) => Promise<DecodedPhoto>;
  /** L'image ramenée à `size` par le décodeur lui-même (`createImageBitmap`, `resizeQuality: 'high'`). */
  readonly scale: (image: CanvasImageSource, size: PhotoSize) => Promise<DecodedPhoto>;
};

const sameSize = (a: PhotoSize, b: PhotoSize): boolean => a.width === b.width && a.height === b.height;

async function developDecoded(decoded: DecodedPhoto, job: ImageJob, env: ImageJobEnv): Promise<Blob | null> {
  const target = developedSize(decoded.size, job.maxEdge);
  const scaled = sameSize(target, decoded.size) ? null : await env.scale(decoded.image, target);
  try {
    const source = scaled === null ? decoded : scaled;
    return await developPhoto({ image: source.image, size: source.size }, env, { maxEdge: job.maxEdge, look: job.look, output: job.output });
  } finally {
    scaled?.close();
  }
}

/** Le travail, de bout en bout. `null` : image illisible ou environnement sans canevas — l'appelant garde l'original. */
export async function runImageJob(job: ImageJob, env: ImageJobEnv): Promise<Blob | null> {
  try {
    if (job.input.kind === 'frame') {
      const { bitmap } = job.input;
      try {
        return await developPhoto({ image: bitmap, size: { width: bitmap.width, height: bitmap.height } }, env, { maxEdge: job.maxEdge, look: job.look, output: job.output });
      } finally {
        bitmap.close();
      }
    }
    const decoded = await env.decode(job.input.blob);
    try {
      return await developDecoded(decoded, job, env);
    } finally {
      decoded.close();
    }
  } catch {
    return null;
  }
}

export type ImageJobHost = { readonly receive: (request: ImageJobRequest) => Promise<void> };

/** La colle du worker : une demande entre, UNE réponse sort sous le même identifiant — même en panne. */
export function createImageJobHost(params: { readonly env: ImageJobEnv; readonly post: (reply: ImageJobReply) => void }): ImageJobHost {
  return {
    receive: async ({ id, job }) => params.post({ id, blob: await runImageJob(job, params.env) }),
  };
}
