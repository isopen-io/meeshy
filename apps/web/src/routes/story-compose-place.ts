import { clampPose } from '@/lib/stories/studio-pose';
import { studioMediaKindOf } from '@/lib/stories/story-document';
import {
  pageWithMediaDuration,
  pageWithSound,
  pageWithVisual,
  pageWithVisualAspectRatio,
  type StudioDoor,
  type StudioUploadState,
} from '@/lib/stories/studio-page';
import { studioPlaceRefusal, withPage, withPlacedWhileAnimated, type StudioDraft } from '@/lib/stories/studio';
import { studioImportPlan } from '@/lib/stories/studio-import';
import type { StudioPlaceRefusalNotice } from '@/routes/story-compose-footer';
import { measureAspectRatio, measureDurationMs } from '@/routes/story-compose-measure';

const UPLOADING: StudioUploadState = { phase: 'uploading', progress: 0 };

/**
 * **POSER UN MÉDIA, OU EN IMPORTER PLUSIEURS** — sorti de `story-compose.tsx`
 * (#8533, budget de taille) : la porte d'un fichier, inchangée, et l'import
 * multiple de la porte du fond (`studioImportPlan`), qui ouvre une scène par
 * média en UN pas d'historique puis mesure et monte chacun sur SA page, par le
 * même chemin qu'un fichier seul.
 */
export function studioPlacer({
  latest,
  edit,
  setDraft,
  blobs,
  head,
  language,
  startUpload,
  retouching,
  refuse,
}: {
  readonly latest: { readonly current: StudioDraft };
  readonly edit: (change: (current: StudioDraft) => StudioDraft) => void;
  readonly setDraft: (change: (current: StudioDraft) => StudioDraft) => void;
  readonly blobs: { readonly current: Set<string> };
  /** La tête de lecture d'une scène animée — un calque y entre (lot 6). */
  readonly head: () => number;
  readonly language: string;
  readonly startUpload: (pageId: string, door: StudioDoor, file: File, previewUrl: string) => void;
  readonly retouching: boolean;
  readonly refuse: (notice: StudioPlaceRefusalNotice | null) => void;
}) {
  const localUrl = (file: File): string => {
    const url = URL.createObjectURL(file);
    blobs.current.add(url);
    return url;
  };

  /** Les mesures du fichier LOCAL et sa montée — un format que ce navigateur
   * ne sait pas décoder ne bloque ni l'aperçu ni la publication (§ 0, défaut 7).
   * Une retouche n'envoie RIEN (#8416). */
  const follow = (pageId: string, door: StudioDoor, file: File, previewUrl: string) => {
    if (door !== 'sound') {
      const mediaType = studioMediaKindOf(file.type);
      void measureAspectRatio(previewUrl, mediaType).then((aspectRatio) => {
        if (aspectRatio !== null) setDraft((current) => withPage(current, pageId, (p) => pageWithVisualAspectRatio(p, door, previewUrl, aspectRatio)));
      });
    }
    if (door === 'sound' || studioMediaKindOf(file.type) === 'video') {
      void measureDurationMs(previewUrl, door === 'sound' ? 'audio' : 'video').then((durationMs) => {
        if (durationMs !== null) setDraft((current) => withPage(current, pageId, (p) => pageWithMediaDuration(p, door, previewUrl, durationMs)));
      });
    }
    if (!retouching) startUpload(pageId, door, file, previewUrl);
  };

  const visualAsset = (file: File, previewUrl: string, pose = clampPose({ x: 0.5, y: 0.5, scale: 1, rotation: 0 })) => ({
    file,
    previewUrl,
    mediaType: studioMediaKindOf(file.type),
    upload: UPLOADING,
    caption: '',
    pose,
  });

  function place(door: StudioDoor, file: File) {
    const draft = latest.current;
    const refusal = studioPlaceRefusal(draft, door, file.type);
    if (refusal !== null) {
      refuse({ door, reason: refusal });
      return;
    }
    refuse(null);
    const pageId = draft.currentPage;
    const previewUrl = localUrl(file);
    if (door === 'sound') {
      edit((current) => withPage(current, pageId, (p) => pageWithSound(p, { file, previewUrl, upload: UPLOADING, plane: p.sound?.plane ?? 'background' })));
    } else {
      edit((current) => {
        const placed = withPage(current, pageId, (p) => pageWithVisual(p, door, visualAsset(file, previewUrl, p.overlay?.pose)));
        return door === 'overlay' ? withPlacedWhileAnimated(placed, 'overlay', head()) : placed;
      });
    }
    follow(pageId, door, file, previewUrl);
  }

  /** LA PORTE DU FOND accepte plusieurs fichiers (#8533) : un seul se pose
   * comme avant (il remplace le fond de la page courante) ; plusieurs
   * ouvrent autant de scènes. */
  function importMedia(files: readonly File[]) {
    const [only] = files;
    if (files.length <= 1) {
      if (only !== undefined) place('visual', only);
      return;
    }
    const plan = studioImportPlan(latest.current, files, language);
    refuse(plan.refused === null ? null : { door: 'visual', reason: plan.refused.reason, count: plan.refused.count });
    if (plan.placements.length === 0) return;
    const placed = plan.placements.map((placement) => ({ ...placement, previewUrl: localUrl(placement.file) }));
    edit(() => placed.reduce((draft, p) => withPage(draft, p.pageId, (page) => pageWithVisual(page, 'visual', visualAsset(p.file, p.previewUrl))), plan.draft));
    placed.forEach((p) => follow(p.pageId, 'visual', p.file, p.previewUrl));
  }

  return { place, importMedia };
}
