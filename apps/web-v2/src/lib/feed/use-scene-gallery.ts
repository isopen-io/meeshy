import { useCallback, useState } from 'react';

/**
 * `useSceneGallery` (#6902, § A de la spécification `scenes-plein-ecran`) —
 * L'HÔTE DE LA GALERIE PLEIN ÉCRAN D'UNE SCÈNE, monté PAR LE FIL ET LE
 * DÉTAIL (`routes/feed.tsx`, `routes/post.tsx`) : le tap sur une scène ouvre
 * la galerie EN PLACE, sur la scène touchée — jamais une navigation vers un
 * second écran (défaut mesuré § 0 de la spécification, la seule fonction).
 *
 * ÉTAT SEUL : cette fonction ne compose AUCUN lot (`composeSceneGalleryLot`,
 * `gallery-lot.ts`) — c'est le rôle de `SceneFullscreenGallery`
 * (`components/scene-fullscreen-gallery.tsx`), qui reçoit `open` et les
 * modèles déjà résolus par l'hôte, jamais une seconde résolution ici.
 */
export type SceneGalleryRequest = { readonly postId: string; readonly sceneIndex: number };

export type SceneGalleryHost = {
  readonly open: SceneGalleryRequest | null;
  readonly onOpenScene: (postId: string, sceneIndex: number) => void;
  readonly close: () => void;
};

export function useSceneGallery(initial: SceneGalleryRequest | null = null): SceneGalleryHost {
  const [open, setOpen] = useState<SceneGalleryRequest | null>(initial);
  const onOpenScene = useCallback((postId: string, sceneIndex: number) => setOpen({ postId, sceneIndex }), []);
  const close = useCallback(() => setOpen(null), []);
  return { open, onOpenScene, close };
}
