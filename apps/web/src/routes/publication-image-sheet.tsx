import { useEffect, useMemo, useState, type ComponentProps } from 'react';

import type { PublicationImageRequest } from '@/lib/export/publication-image-store';
import { mediaAuthorOf, type MessageCardMediaItem, type MessageCardSubject } from '@/lib/export/message-card-subject';
import type { RenderedSceneFile } from '@/lib/export/scene/scene-export-browser';
import type { SceneExportSubject } from '@/lib/export/scene/scene-export-subject';
import { translate } from '@/lib/i18n-catalog';
import { translateExportCard } from '@/lib/i18n-export-card-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { ExportCatalogGate } from './export-catalog-gate';
import { MessageExportSheet } from './thread-export-sheet';

/**
 * **« IMAGER » UNE PUBLICATION, DANS L'ATELIER DE CARTE** (#16393, #16166) —
 * le même atelier qu'un message et qu'un commentaire : fonds, filigrane,
 * cadres, dispositions. Une œuvre composée (post à scène, réel, story) y
 * arrive TOUT DE SUITE, en préparation : le moteur d'export de scène rend la
 * composition entière (`renderSceneFile`, sans feuille ni bandeau), puis le
 * fichier devient le média de la carte. Rien ne part avant lui.
 */
export type SceneFileRenderer = (scene: SceneExportSubject, signal: AbortSignal) => Promise<RenderedSceneFile | null>;

const browserSceneRenderer: SceneFileRenderer = async (scene, signal) => {
  const [{ renderSceneFile }, { currentReaderLanguages }] = await Promise.all([import('@/lib/export/scene/scene-export-browser'), import('@/lib/export/scene/scene-export-launch')]);
  return renderSceneFile({
    subject: scene,
    audioContext: null,
    preferredLanguages: currentReaderLanguages(),
    placeHere: translate(currentInterfaceLanguage(), 'scene.place.here'),
    signal,
  });
};

const SCENE_WIDTH = 720;
const SCENE_HEIGHT = 1280;

export type PublicationSheetPorts = Partial<Pick<ComponentProps<typeof MessageExportSheet>, 'paint' | 'thumbnail' | 'loadSources' | 'deliver' | 'storage' | 'createObjectURL' | 'revokeObjectURL'>>;

type SceneMedia = { readonly state: 'none' } | { readonly state: 'preparing' } | { readonly state: 'ready'; readonly item: MessageCardMediaItem } | { readonly state: 'failed' };

export function sceneCardMediaOf(params: { readonly key: string; readonly file: RenderedSceneFile; readonly url: string; readonly subject: MessageCardSubject }): MessageCardMediaItem {
  const kind = params.file.mimeType.startsWith('video/') ? 'video' : 'image';
  return {
    id: `scene-${params.key}`,
    url: params.url,
    mimeType: params.file.mimeType,
    posterUrl: null,
    card: { kind, width: SCENE_WIDTH, height: SCENE_HEIGHT, mimeType: params.file.mimeType },
    author: mediaAuthorOf(params.subject.reply, false),
    hero: true,
  };
}

function useSceneMedia(request: PublicationImageRequest, render: SceneFileRenderer, objectUrls: { readonly create: (blob: Blob) => string; readonly revoke: (url: string) => void }): SceneMedia {
  const [media, setMedia] = useState<SceneMedia>(request.scene === null ? { state: 'none' } : { state: 'preparing' });
  useEffect(() => {
    const scene = request.scene;
    if (scene === null) {
      setMedia({ state: 'none' });
      return;
    }
    setMedia({ state: 'preparing' });
    const controller = new AbortController();
    let url: string | null = null;
    void render(scene, controller.signal)
      .catch(() => null)
      .then((file) => {
        if (controller.signal.aborted) return;
        if (file === null) {
          setMedia({ state: 'failed' });
          return;
        }
        url = objectUrls.create(file.blob);
        setMedia({ state: 'ready', item: sceneCardMediaOf({ key: request.key, file, url, subject: request.subject }) });
      });
    return () => {
      controller.abort();
      if (url !== null) objectUrls.revoke(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.key, request.scene, render]);
  return media;
}

export default function PublicationImageSheet({
  request,
  handle,
  onClose,
  ports = {},
  renderScene = browserSceneRenderer,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
}: {
  readonly request: PublicationImageRequest;
  readonly handle: string | null;
  readonly onClose: () => void;
  /** Les portes de l'atelier — injectées par les témoins. */
  readonly ports?: PublicationSheetPorts;
  readonly renderScene?: SceneFileRenderer;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
}) {
  const [announcement, setAnnouncement] = useState('');
  const scene = useSceneMedia(request, renderScene, { create: createObjectURL, revoke: revokeObjectURL });
  const subject = useMemo<MessageCardSubject>(
    () => (scene.state === 'ready' ? { ...request.subject, media: [scene.item, ...request.subject.media] } : request.subject),
    [request.subject, scene],
  );
  const language = currentInterfaceLanguage();
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only" data-publication-image-status="">
        {scene.state === 'failed' ? translateExportCard(language, 'export.announce.failed') : announcement}
      </p>
      <ExportCatalogGate>
        <MessageExportSheet
          subject={subject}
          subjectKey={`${request.key}|${scene.state}`}
          preparing={scene.state === 'preparing'}
          handle={handle}
          conversationTitle={null}
          announce={setAnnouncement}
          onClose={onClose}
          {...ports}
        />
      </ExportCatalogGate>
    </>
  );
}
