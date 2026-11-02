import { useCallback, useMemo } from 'react';

import type { FeedMedia } from '@/lib/api/feed-pages';
import { commentMediaAttachment, commentMediaPage } from '@/lib/comments/comment-media-viewer';
import { gestureAudioContext, watermarkHandle, type SceneExportSubject } from '@/lib/export/scene/scene-export-subject';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { MediaViewerPage } from '@/lib/view/viewer-page-offers';

import MediaViewer from './media-viewer';

export type CommentImagerLauncher = (input: { readonly subject: SceneExportSubject; readonly audioContext: AudioContext | null }) => Promise<unknown>;

/* Le moteur de composition ne se charge qu'au geste « Imager ». */
const defaultLauncher: CommentImagerLauncher = (input) =>
  import('@/lib/export/scene/scene-export-launch').then(({ launchSceneExport }) => launchSceneExport({ ...input, mode: 'imager' }));

/**
 * LE PLEIN ÉCRAN DES MÉDIAS D'UN COMMENTAIRE (#13881) — chunk À LA DEMANDE,
 * chargé au toucher d'une photo ou au bouton plein écran d'une vidéo. La
 * visionneuse commune, avec ce qu'un média nu sait faire : Partager, Imager.
 *
 * « Imager » REFERME la visionneuse : la composition se suit dans le bac des
 * exports, qui vit dans `#root` — inerte tant que la couche est ouverte. Le
 * contexte audio naît DANS le geste (la piste sonore d'une vidéo en dépend),
 * avant le chargement du moteur.
 */
export default function CommentMediaViewer({
  media,
  startIndex,
  commentId,
  authorUsername,
  onClose,
  launcher = defaultLauncher,
}: {
  readonly media: readonly FeedMedia[];
  readonly startIndex: number;
  readonly commentId: string;
  readonly authorUsername?: string | null | undefined;
  readonly onClose: () => void;
  readonly launcher?: CommentImagerLauncher;
}) {
  const watermark = watermarkHandle(authorUsername);
  const items = useMemo(() => media.map((piece) => commentMediaAttachment(piece, commentId)), [media, commentId]);
  const imager = useCallback(
    (subject: SceneExportSubject) => {
      const audioContext = gestureAudioContext();
      onClose();
      void launcher({ subject, audioContext }).catch(() => void audioContext?.close().catch(() => undefined));
    },
    [launcher, onClose],
  );
  const actionsAt = useCallback(
    (index: number): MediaViewerPage | null => {
      const piece = media[index];
      return piece === undefined ? null : commentMediaPage({ piece, commentId, watermark, imager });
    },
    [media, commentId, watermark, imager],
  );
  const language = currentInterfaceLanguage();
  return <MediaViewer items={items} startIndex={startIndex} actionsAt={actionsAt} onClose={onClose} languages={[language]} fallbackLanguage={language} />;
}
