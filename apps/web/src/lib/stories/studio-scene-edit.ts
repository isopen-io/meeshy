import type { SceneTransition } from '@/lib/canvas/scene-transition';

import { currentStudioPage, withPage, type StudioDraft } from './studio';
import type { StudioPage, StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';

/**
 * **LES GESTES DE SCÈNE du composer plein écran** (#8715, #8794) — jumelles de
 * `makeSceneBackground` (« Mettre en fond » / « Remplacer le fond »,
 * `MeeshyComposerHost+SceneColumns.swift`), de `ComposerBackgroundMenuAction
 * .bringForward` et de `ComposerSceneEffects.transitions` iOS. Chaque geste
 * rend le MÊME brouillon quand il ne change rien : aucun pas d'historique ne
 * s'écrit à vide (`edit`, `story-compose.tsx`).
 */

/** Un média qui change de plan garde son fichier, sa montée, sa légende, son
 * texte alternatif, sa durée et son filtre ; il perd ce qui n'a de sens que
 * dans l'autre plan — la pose et la fenêtre du calque, le Cadre du fond. */
function movedAsset(asset: StudioVisualAsset): StudioVisualAsset {
  const { frame: _frame, timing: _timing, ...rest } = asset;
  return { ...rest, pose: IDENTITY_POSE };
}

/** **Le calque devient le fond** — l'ancien fond part (iOS le retire au même
 * geste) ; un seul « Annuler » rend les deux. */
export function pageWithOverlayAsBackground(page: StudioPage): StudioPage {
  if (page.overlay === null) return page;
  return { ...page, background: movedAsset(page.overlay), overlay: null, selected: page.selected === 'overlay' ? null : page.selected };
}

/** **Le fond passe au premier plan** — seulement quand aucun calque n'occupe
 * la place : une scène n'en porte qu'un. */
export function pageWithBackgroundForward(page: StudioPage): StudioPage {
  if (page.background === null || page.overlay !== null) return page;
  return { ...page, overlay: movedAsset(page.background), background: null };
}

export type StudioPageTransitions = { readonly opening: SceneTransition | null; readonly closing: SceneTransition | null };

export function pageWithTransitions(page: StudioPage, transitions: StudioPageTransitions): StudioPage {
  if ((page.opening ?? null) === transitions.opening && (page.closing ?? null) === transitions.closing) return page;
  const { opening: _opening, closing: _closing, ...rest } = page;
  return {
    ...rest,
    ...(transitions.opening !== null ? { opening: transitions.opening } : {}),
    ...(transitions.closing !== null ? { closing: transitions.closing } : {}),
  };
}

/** Un changement de la page COURANTE qui peut ne rien changer — le brouillon
 * reste alors le même objet. */
function onCurrentPage(draft: StudioDraft, change: (page: StudioPage) => StudioPage): StudioDraft {
  const page = currentStudioPage(draft);
  const next = change(page);
  return next === page ? draft : withPage(draft, draft.currentPage, () => next);
}

export const withOverlayAsBackground = (draft: StudioDraft): StudioDraft => onCurrentPage(draft, pageWithOverlayAsBackground);

export const withBackgroundForward = (draft: StudioDraft): StudioDraft => onCurrentPage(draft, pageWithBackgroundForward);

export const withPageTransitions = (draft: StudioDraft, transitions: StudioPageTransitions): StudioDraft =>
  onCurrentPage(draft, (page) => pageWithTransitions(page, transitions));

export const pageTransitionsOf = (page: StudioPage): StudioPageTransitions => ({ opening: page.opening ?? null, closing: page.closing ?? null });
