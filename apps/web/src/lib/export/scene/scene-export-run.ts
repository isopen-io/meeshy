import { extensionOfType } from '@/lib/export/message-card-output';

import type { PreparedSceneExport } from './scene-export-assets';
import { imagerLengthChoices, renderedLengthMs, type ImagerLengthChoice, type ImagerQuarter } from './scene-export-length';
import type { RenderOutcome } from './scene-export-render';

/**
 * **UN EXPORT, DU GESTE AU FICHIER** (#13873) — préparer (tirer et décoder
 * chaque pièce), choisir la longueur (« Imager » seul, au-delà d'une minute),
 * rendre, livrer. Chaque étape est injectée : le navigateur les fournit
 * (`scene-export-browser.ts`), les témoins les simulent.
 *
 * « Enregistrer » rend TOUTE la composition ; « Imager » rend la même, et
 * propose 1/4 · 2/4 · 3/4 · 4/4 quand elle dépasse une minute — la longueur
 * rendue DEPUIS LE DÉBUT. La progression va de 0 à 1 : la préparation en
 * occupe le premier vingtième, le rendu le reste.
 */

export type SceneExportMode = 'save' | 'imager';

export type SceneExportResult = 'saved' | 'cancelled' | 'failed' | 'retry' | 'unsupported';

export type SceneDelivery = 'delivered' | 'cancelled' | 'failed' | 'retry';

export type SceneExportRunDeps = {
  readonly prepare: (signal: AbortSignal) => Promise<PreparedSceneExport | 'cancelled'>;
  readonly render: (params: {
    readonly prepared: PreparedSceneExport;
    readonly lengthMs: number;
    readonly signal: AbortSignal;
    readonly onProgress: (fraction: number) => void;
  }) => Promise<RenderOutcome>;
  readonly deliver: (blob: Blob, fileName: string, mimeType: string) => Promise<SceneDelivery>;
  /** « Imager » au-delà d'une minute : la part choisie, `null` si l'utilisateur renonce. */
  readonly chooseLength: (choices: readonly ImagerLengthChoice[]) => Promise<ImagerQuarter | null>;
};

const PREPARE_SHARE = 0.05;

async function lengthFor(mode: SceneExportMode, totalMs: number, deps: SceneExportRunDeps): Promise<number | null> {
  const choices = mode === 'imager' ? imagerLengthChoices(totalMs) : [];
  if (choices.length === 0) return totalMs;
  const quarter = await deps.chooseLength(choices);
  return quarter === null ? null : renderedLengthMs({ totalMs, quarter });
}

export async function runSceneExport(params: {
  readonly mode: SceneExportMode;
  readonly fileStem: string;
  readonly deps: SceneExportRunDeps;
  readonly signal: AbortSignal;
  readonly onProgress: (fraction: number) => void;
  /** La livraison commence : l'annulation n'est plus possible. */
  readonly onDelivering?: () => void;
}): Promise<SceneExportResult> {
  const { deps, signal } = params;
  const prepared = await deps.prepare(signal).catch(() => null);
  if (prepared === 'cancelled') return 'cancelled';
  if (prepared === null) return 'failed';
  try {
    params.onProgress(PREPARE_SHARE);
    const lengthMs = await lengthFor(params.mode, prepared.plan.totalMs, deps);
    if (lengthMs === null || signal.aborted) return 'cancelled';
    const outcome = await deps.render({
      prepared,
      lengthMs,
      signal,
      onProgress: (fraction) => params.onProgress(PREPARE_SHARE + (1 - PREPARE_SHARE) * Math.min(1, Math.max(0, fraction))),
    });
    if (outcome.kind !== 'video' && outcome.kind !== 'image') return outcome.kind;
    params.onDelivering?.();
    const mimeType = outcome.kind === 'video' ? outcome.mimeType : outcome.blob.type || 'image/png';
    const delivered = await deps.deliver(outcome.blob, `meeshy-${params.fileStem}.${extensionOfType(mimeType)}`, mimeType);
    return delivered === 'delivered' ? 'saved' : delivered;
  } catch {
    return signal.aborted ? 'cancelled' : 'failed';
  } finally {
    prepared.dispose();
  }
}
