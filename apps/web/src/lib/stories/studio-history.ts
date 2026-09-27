import type { StudioDraft } from './studio';
import type { StudioPage, StudioSoundAsset, StudioVisualAsset } from './studio-page';

/**
 * **L'HISTORIQUE DU PLATEAU** (#8413) — annuler / rétablir, les tuiles du
 * rail droit (maquette plein écran, `iPad.dc.html` ; miroir
 * `ComposerHistoryService` iOS). Ce qu'il défait, ce sont les gestes sur la
 * SCÈNE — poser, retirer, écrire, déplacer, régler, créer une scène.
 * L'audience et le texte du post décident de l'ENVOI : ils n'y entrent pas
 * (`rebaseStudioLive`).
 *
 * Des brouillons ENTIERS, jamais des diffs : un brouillon est immuable, ses
 * pages inchangées sont partagées d'un pas à l'autre, et un pas coûte une
 * poignée de références.
 */
export const STUDIO_HISTORY_MAX = 50;

export type StudioHistory = {
  readonly past: readonly StudioDraft[];
  readonly future: readonly StudioDraft[];
  /** La CLÉ du dernier pas — deux gestes consécutifs de même clé (la frappe
   * dans un même texte) se coalisent en UN pas. `null` : jamais coalisé. */
  readonly lastKey: string | null;
};

export const emptyStudioHistory: StudioHistory = { past: [], future: [], lastKey: null };

/** Enregistre l'état d'AVANT un geste. IDEMPOTENT : un état déjà en tête
 * n'est pas ré-empilé — un rendu rejoué (mode strict) ne double aucun pas. */
export function recordStudioStep(history: StudioHistory, before: StudioDraft, key: string | null): StudioHistory {
  if (history.past[history.past.length - 1] === before) return history;
  if (key !== null && key === history.lastKey) return { ...history, future: [] };
  return { past: [...history.past, before].slice(-STUDIO_HISTORY_MAX), future: [], lastKey: key };
}

export function undoStudioStep(history: StudioHistory, current: StudioDraft): { readonly history: StudioHistory; readonly draft: StudioDraft } | null {
  const draft = history.past[history.past.length - 1];
  if (draft === undefined) return null;
  return { draft, history: { past: history.past.slice(0, -1), future: [current, ...history.future], lastKey: null } };
}

export function redoStudioStep(history: StudioHistory, current: StudioDraft): { readonly history: StudioHistory; readonly draft: StudioDraft } | null {
  const draft = history.future[0];
  if (draft === undefined) return null;
  return { draft, history: { past: [...history.past, current], future: history.future.slice(1), lastKey: null } };
}

/** Un média restauré qui est LE MÊME fichier qu'à l'écran (même aperçu
 * local) garde les faits établis DEPUIS : l'état de sa montée, son rapport,
 * sa durée. Sans cela, annuler un déplacement rendrait « en cours » un fond
 * déjà prêt, et Publier attendrait une montée qui ne reviendra jamais. */
function liveVisual(restored: StudioVisualAsset | null, current: StudioVisualAsset | null): StudioVisualAsset | null {
  if (restored === null || current === null || restored.previewUrl !== current.previewUrl) return restored;
  return {
    ...restored,
    upload: current.upload,
    ...(current.aspectRatio !== undefined ? { aspectRatio: current.aspectRatio } : {}),
    ...(current.durationMs !== undefined ? { durationMs: current.durationMs } : {}),
  };
}

function liveSound(restored: StudioSoundAsset | null, current: StudioSoundAsset | null): StudioSoundAsset | null {
  if (restored === null || current === null || restored.previewUrl !== current.previewUrl) return restored;
  return { ...restored, upload: current.upload, ...(current.durationMs !== undefined ? { durationMs: current.durationMs } : {}) };
}

export function rebaseStudioLive(restored: StudioDraft, current: StudioDraft): StudioDraft {
  const pageOf = (id: string): StudioPage | undefined => current.pages.find((page) => page.id === id);
  return {
    ...restored,
    visibility: current.visibility,
    postText: current.postText,
    pages: restored.pages.map((page) => {
      const live = pageOf(page.id);
      if (live === undefined) return page;
      return {
        ...page,
        background: liveVisual(page.background, live.background),
        overlay: liveVisual(page.overlay, live.overlay),
        sound: liveSound(page.sound, live.sound),
      };
    }),
  };
}
