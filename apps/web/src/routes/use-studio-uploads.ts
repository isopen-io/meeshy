import { useCallback, useEffect, useRef } from 'react';

import type { ApiFailure } from '@/lib/api/http';
import type { PostMediaUploadDeps } from '@/lib/api/post-media-upload';
import { withPage, type StudioDraft } from '@/lib/stories/studio';
import { pageWithSoundUpload, pageWithVisualUpload, type StudioDoor, type StudioPage, type StudioUploadState } from '@/lib/stories/studio-page';
import { uploadStateOf, type PendingUpload } from '@/lib/stories/studio-publish';

/** Les montées EN VOL sont adressées par PAGE — un fichier posé sur la page 2
 * ne se confond pas avec celui de la page 1 quand l'auteur bascule pendant le
 * transport (#7684). */
export const uploadKey = (pageId: string, door: StudioDoor): string => `${pageId}:${door}`;

export const ALL_DOORS: readonly StudioDoor[] = ['visual', 'overlay', 'sound'];

/** Ce qu'UNE porte occupe sur une page — le fond, le calque ou le son. */
export const slotOf = (page: StudioPage, door: StudioDoor) => (door === 'sound' ? page.sound : door === 'visual' ? page.background : page.overlay);

/**
 * **LES MONTÉES DU STUDIO** — extraites de `story-compose.tsx` (lot 6, budget
 * de taille) sans changement de comportement : lancer, abandonner, réessayer,
 * et REPRENDRE une montée qu'Annuler a rendue (#8413). `paused` (une
 * retouche, #8416) n'envoie rien.
 */
export function useStudioUploads({
  pages,
  page,
  upload,
  setDraft,
  paused,
}: {
  readonly pages: readonly StudioPage[];
  readonly page: StudioPage;
  readonly upload: PostMediaUploadDeps;
  readonly setDraft: (change: (current: StudioDraft) => StudioDraft) => void;
  readonly paused: boolean;
}) {
  const pendingRef = useRef<Record<string, PendingUpload | null>>({});
  const abortRef = useRef<Record<string, AbortController | null>>({});
  /** Le fichier dont la montée est EN COURS, par emplacement — la reprise
   * après Annuler / Rétablir ne relance que ce qui ne monte plus. */
  const uploadingRef = useRef<Record<string, string | null>>({});

  useEffect(
    () => () => {
      Object.values(abortRef.current).forEach((controller) => controller?.abort());
    },
    [],
  );

  /** Un accusé de montée ne s'applique qu'au fichier qu'il concerne : après
   * Annuler, l'emplacement peut porter un AUTRE fichier que celui en vol. */
  const applyUpload = (pageId: string, door: StudioDoor, previewUrl: string, state: StudioUploadState) => {
    setDraft((current) =>
      withPage(current, pageId, (p) => {
        if (slotOf(p, door)?.previewUrl !== previewUrl) return p;
        return door === 'sound' ? pageWithSoundUpload(p, state) : pageWithVisualUpload(p, door, state);
      }),
    );
  };

  const startUpload = (pageId: string, door: StudioDoor, file: File, previewUrl: string) => {
    const key = uploadKey(pageId, door);
    uploadingRef.current[key] = previewUrl;
    abortRef.current[key]?.abort();
    const controller = new AbortController();
    abortRef.current[key] = controller;
    const pending: PendingUpload = import('@/lib/api/post-media-upload')
      .then(({ uploadPostMedia }) =>
        uploadPostMedia({
          ...upload,
          file,
          uploadContext: 'story',
          signal: controller.signal,
          onProgress: (progress) => {
            if (!controller.signal.aborted) applyUpload(pageId, door, previewUrl, { phase: 'uploading', progress });
          },
        }),
      )
      .catch((): ApiFailure => ({ ok: false, status: 0, error: 'Module de téléversement indisponible', code: 'NETWORK' }));
    pendingRef.current[key] = pending;
    void pending.then((result) => {
      if (pendingRef.current[key] !== pending) return;
      const state = uploadStateOf(result);
      if (state !== null) applyUpload(pageId, door, previewUrl, state);
    });
  };

  /** Une montée qu'on ABANDONNE — la page ou le média qu'elle servait est
   * retiré : elle ne coûte plus de bande passante, et son accusé ne revient
   * sur rien. */
  const forgetUpload = useCallback((pageId: string, door: StudioDoor) => {
    const key = uploadKey(pageId, door);
    abortRef.current[key]?.abort();
    abortRef.current[key] = null;
    pendingRef.current[key] = null;
    uploadingRef.current[key] = null;
  }, []);

  const retry = (door: StudioDoor) => {
    const asset = slotOf(page, door);
    if (asset === null || asset.file === undefined) return;
    applyUpload(page.id, door, asset.previewUrl, { phase: 'uploading', progress: 0 });
    startUpload(page.id, door, asset.file, asset.previewUrl);
  };

  /** LA REPRISE DES MONTÉES — un média rendu par Annuler (une page ou un fond
   * retirés, dont la montée avait été abandonnée) remonte seul : sans cela,
   * Publier attendrait un transfert qui ne reviendra jamais. */
  useEffect(() => {
    if (paused) return;
    pages.forEach((p) =>
      ALL_DOORS.forEach((door) => {
        const asset = slotOf(p, door);
        if (asset === null || asset.upload.phase !== 'uploading' || asset.file === undefined) return;
        if (uploadingRef.current[uploadKey(p.id, door)] === asset.previewUrl) return;
        startUpload(p.id, door, asset.file, asset.previewUrl);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  return { pendingRef, startUpload, forgetUpload, retry };
}
