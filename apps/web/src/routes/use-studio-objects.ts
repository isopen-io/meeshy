import { useState } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import { withTextDuplicated, withTextLayer, withTextMoved, withVisualPose, withoutText, type StudioDraft } from '@/lib/stories/studio';
import type { StudioPage } from '@/lib/stories/studio-page';
import { clampPose, type StudioPose } from '@/lib/stories/studio-pose';
import type { StudioObjectAction } from '@/routes/story-compose-object-menu';

/**
 * **LES OBJETS DE LA SCÈNE, CÔTÉ ÉCRAN** (lot 6, directive porteur 2026-09-27
 * soir) — ce que la sélection silencieuse touche, l'objet en ÉDITION (sa
 * plaque de verre en bas), le menu d'un objet (appui long, clic droit) et ses
 * actions. Extrait de `story-compose.tsx` (budget de taille).
 */
export function useStudioObjects({
  page,
  lang,
  kind,
  edit,
  select,
  removeOverlay,
  closeFrame,
}: {
  readonly page: StudioPage;
  readonly lang: InterfaceLanguage;
  readonly kind: PublicationKind;
  readonly edit: (change: (current: StudioDraft) => StudioDraft, key?: string | null) => void;
  readonly select: (id: string) => void;
  readonly removeOverlay: () => void;
  readonly closeFrame: () => void;
}) {
  /** L'OBJET EN ÉDITION (double-tap ou « Modifier ») — `null` : la scène se
   * règle à la main. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Le menu d'un objet — son objet et le point où il s'ouvre. */
  const [objectMenu, setObjectMenu] = useState<{ readonly id: string; readonly point: { readonly x: number; readonly y: number } } | null>(null);

  /** Les objets SAISISSABLES — un texte écrit, le calque. */
  const stageObjects = [
    ...page.texts.filter((layer) => layer.text.trim() !== '').map((layer) => ({ id: layer.id, pose: layer.pose })),
    ...(page.overlay !== null ? [{ id: 'overlay', pose: page.overlay.pose }] : []),
  ];
  /** Une édition dont l'objet a disparu (retiré, annulé) se referme seule. */
  const editing =
    editingId !== null && (editingId === 'overlay' ? page.overlay !== null : page.texts.some((layer) => layer.id === editingId)) ? editingId : null;

  const startEditing = (id: string) => {
    select(id);
    closeFrame();
    setEditingId(id);
  };

  const commitPoseOf = (id: string, pose: StudioPose) =>
    edit((current) => (id === 'overlay' ? withVisualPose(current, 'overlay', pose) : withTextLayer(current, id, (layer) => ({ ...layer, pose: clampPose(pose) }))));

  /** Seules les actions qui ont un EFFET : pas de « Monter » au sommet, pas
   * de « Dupliquer » pour le calque (une scène n'en porte qu'un). Un média
   * hors story « sort de la scène ». */
  const objectActions = (id: string): readonly StudioObjectAction[] => {
    if (id === 'overlay') {
      return [
        { id: 'edit', label: translate(lang, 'story.studio.object.edit'), onSelect: () => startEditing('overlay') },
        { id: 'remove', label: translate(lang, kind === 'STORY' ? 'story.studio.object.remove' : 'story.studio.object.leave'), destructive: true, onSelect: removeOverlay },
      ];
    }
    const index = page.texts.findIndex((layer) => layer.id === id);
    return [
      ...(index < page.texts.length - 1 ? [{ id: 'raise', label: translate(lang, 'story.studio.object.raise'), onSelect: () => edit((current) => withTextMoved(current, id, 1)) }] : []),
      ...(index > 0 ? [{ id: 'lower', label: translate(lang, 'story.studio.object.lower'), onSelect: () => edit((current) => withTextMoved(current, id, -1)) }] : []),
      { id: 'duplicate', label: translate(lang, 'story.studio.object.duplicate'), onSelect: () => edit((current) => withTextDuplicated(current, id)) },
      { id: 'edit', label: translate(lang, 'story.studio.object.edit'), onSelect: () => startEditing(id) },
      { id: 'remove', label: translate(lang, 'story.studio.object.remove'), destructive: true, onSelect: () => edit((current) => withoutText(current, id)) },
    ];
  };

  return { stageObjects, editing, setEditingId, objectMenu, setObjectMenu, startEditing, commitPoseOf, objectActions };
}
