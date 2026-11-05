import { extensionOfType } from '@/lib/export/message-card-output';

import type { PreparedSceneExport } from './scene-export-assets';
import type { RenderOutcome } from './scene-export-render';

/**
 * **UN EXPORT, DU GESTE AU FICHIER** (#13873) — préparer (tirer et décoder
 * chaque pièce), rendre, livrer. Chaque étape est injectée : le navigateur les
 * fournit (`scene-export-browser.ts`), les témoins les simulent.
 *
 * « Enregistrer » et « Partager » (#13881) rendent TOUTE la composition — le
 * premier la range, le second la remet à la feuille de partage. « Imager »
 * n'est plus un mode de cet export (#16393) : il ouvre l'atelier de carte, qui
 * pose le rendu de la scène comme média. La progression va de 0 à 1 : la
 * préparation en occupe le premier vingtième, le rendu le reste.
 */

export type SceneExportMode = 'save' | 'share';

export type SceneExportResult = 'saved' | 'shared' | 'cancelled' | 'failed' | 'retry' | 'unsupported';

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
};

const PREPARE_SHARE = 0.05;

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
    if (signal.aborted) return 'cancelled';
    const lengthMs = prepared.plan.totalMs;
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
    if (delivered !== 'delivered') return delivered;
    return params.mode === 'share' ? 'shared' : 'saved';
  } catch {
    return signal.aborted ? 'cancelled' : 'failed';
  } finally {
    prepared.dispose();
  }
}
