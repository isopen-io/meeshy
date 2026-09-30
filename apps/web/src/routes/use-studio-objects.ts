import { createElement, useState } from 'react';

import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { withTextDuplicated, withTextLayer, withTextMoved, withVisualPose, withoutText, type StudioDraft } from '@/lib/stories/studio';
import type { StudioPage } from '@/lib/stories/studio-page';
import { clampPose, type StudioPose } from '@/lib/stories/studio-pose';
import type { StudioObjectActionId } from '@/lib/stories/studio-scene-columns';
import { studioOverlayBackgroundAction } from '@/lib/stories/studio-scene-menu';
import type { StudioObjectAction } from '@/routes/story-compose-object-menu';
import { ObjectActionMark } from '@/routes/story-compose-scene-marks';

/** Une action d'objet NOMMÉE — la colonne droite la range par son `id`. */
export type StudioSceneObjectAction = StudioObjectAction & { readonly id: StudioObjectActionId };

const ACTION_LABELS = {
  edit: 'story.studio.object.edit',
  raise: 'story.studio.object.raise',
  lower: 'story.studio.object.lower',
  duplicate: 'story.studio.object.duplicate',
  'set-background': 'story.studio.object.setBackground',
  'replace-background': 'story.studio.object.replaceBackground',
  remove: 'story.studio.object.remove',
} as const satisfies Record<StudioObjectActionId, InterfaceCatalogKey>;

/**
 * **LES OBJETS DE LA SCÈNE, CÔTÉ ÉCRAN** (lot 6, directive porteur 2026-09-27
 * soir) — ce que la sélection silencieuse touche, l'objet en ÉDITION (sa
 * plaque de verre en bas), le menu d'un objet (appui long, clic droit) et ses
 * actions. Extrait de `story-compose.tsx` (budget de taille).
 */
export function useStudioObjects({
  page,
  lang,
  edit,
  select,
  removeOverlay,
  overlayToBackground,
  closeFrame,
}: {
  readonly page: StudioPage;
  readonly lang: InterfaceLanguage;
  readonly edit: (change: (current: StudioDraft) => StudioDraft, key?: string | null) => void;
  readonly select: (id: string) => void;
  readonly removeOverlay: () => void;
  /** « Mettre en fond » / « Remplacer le fond » (#8716) — le calque devient le
   * fond ; l'ancien part, et ses montées en vol avec lui. */
  readonly overlayToBackground: () => void;
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
   * de « Dupliquer » pour le calque (une scène n'en porte qu'un). Aucun
   * « Sortir de la scène » (#8515) : il SUPPRIMAIT le média, et iOS ne le sert
   * pas (`ComposerHostRules.swift`, `leaveScene` : ce que devient un objet
   * sorti n'est tranché nulle part) — retirer se dit « Retirer ». */
  const action = (id: StudioObjectActionId, onSelect: () => void): StudioSceneObjectAction => ({
    id,
    label: translate(lang, ACTION_LABELS[id]),
    glyph: createElement(ObjectActionMark, { action: id }),
    ...(id === 'remove' ? { destructive: true } : {}),
    onSelect,
  });
  const objectActions = (id: string): readonly StudioSceneObjectAction[] => {
    if (id === 'overlay') {
      return [
        action('edit', () => startEditing('overlay')),
        action(studioOverlayBackgroundAction({ hasBackground: page.background !== null }), overlayToBackground),
        action('remove', removeOverlay),
      ];
    }
    const index = page.texts.findIndex((layer) => layer.id === id);
    return [
      ...(index < page.texts.length - 1 ? [action('raise', () => edit((current) => withTextMoved(current, id, 1)))] : []),
      ...(index > 0 ? [action('lower', () => edit((current) => withTextMoved(current, id, -1)))] : []),
      action('duplicate', () => edit((current) => withTextDuplicated(current, id))),
      action('edit', () => startEditing(id)),
      action('remove', () => edit((current) => withoutText(current, id))),
    ];
  };

  return { stageObjects, editing, setEditingId, objectMenu, setObjectMenu, startEditing, commitPoseOf, objectActions };
}
