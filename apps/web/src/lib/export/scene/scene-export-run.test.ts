import { describe, expect, test } from 'bun:test';

import type { PreparedSceneExport } from './scene-export-assets';
import type { ImagerLengthChoice, ImagerQuarter } from './scene-export-length';
import type { RenderOutcome } from './scene-export-render';
import { runSceneExport, type SceneDelivery, type SceneExportMode, type SceneExportRunDeps } from './scene-export-run';

function preparedOf(totalMs: number, disposed: { count: number }): PreparedSceneExport {
  return {
    plan: { slides: [{ sceneIndex: 0, startMs: 0, durationMs: totalMs }], totalMs, sounds: [], still: false },
    assets: { image: () => null, video: () => null },
    videos: new Map(),
    buffers: new Map(),
    missing: [],
    dispose: () => (disposed.count += 1),
  };
}

function scenario(params: {
  readonly totalMs: number;
  readonly mode: SceneExportMode;
  readonly quarter?: ImagerQuarter | null;
  readonly outcome?: RenderOutcome;
  readonly delivery?: SceneDelivery;
}) {
  const disposed = { count: 0 };
  const rendered: number[] = [];
  const offered: (readonly ImagerLengthChoice[])[] = [];
  const delivered: { fileName: string; mimeType: string }[] = [];
  const progress: number[] = [];
  const deps: SceneExportRunDeps = {
    prepare: async () => preparedOf(params.totalMs, disposed),
    render: async ({ lengthMs, onProgress }) => {
      rendered.push(lengthMs);
      onProgress(0.5);
      onProgress(1);
      return params.outcome ?? { kind: 'video', blob: new Blob(['v'], { type: 'video/mp4' }), mimeType: 'video/mp4' };
    },
    deliver: async (_blob, fileName, mimeType) => {
      delivered.push({ fileName, mimeType });
      return params.delivery ?? 'delivered';
    },
    chooseLength: async (choices) => {
      offered.push(choices);
      return params.quarter === undefined ? 4 : params.quarter;
    },
  };
  const result = runSceneExport({ mode: params.mode, fileStem: 'story-1', deps, signal: new AbortController().signal, onProgress: (f) => progress.push(f) });
  return { result, rendered, offered, delivered, progress, disposed };
}

describe('un export, du geste au fichier', () => {
  test('« Enregistrer » rend toute la composition, sans rien demander, et la livre en MP4', async () => {
    const run = scenario({ totalMs: 240_000, mode: 'save' });
    expect(await run.result).toBe('saved');
    expect(run.offered).toHaveLength(0);
    expect(run.rendered).toEqual([240_000]);
    expect(run.delivered).toEqual([{ fileName: 'meeshy-story-1.mp4', mimeType: 'video/mp4' }]);
    expect(run.progress.at(-1)).toBe(1);
    expect(run.disposed.count).toBe(1);
  });

  test('« Imager » 2/4 d’une story de 4 min rend 2 min, après avoir offert les quatre parts', async () => {
    const run = scenario({ totalMs: 240_000, mode: 'imager', quarter: 2 });
    expect(await run.result).toBe('saved');
    expect(run.offered[0]?.map((choice) => choice.durationMs)).toEqual([60_000, 120_000, 180_000, 240_000]);
    expect(run.rendered).toEqual([120_000]);
  });

  test('« Imager » sous une minute ne propose aucun choix', async () => {
    const run = scenario({ totalMs: 45_000, mode: 'imager' });
    await run.result;
    expect(run.offered).toHaveLength(0);
    expect(run.rendered).toEqual([45_000]);
  });

  test('renoncer au choix de longueur annule sans rien rendre', async () => {
    const run = scenario({ totalMs: 240_000, mode: 'imager', quarter: null });
    expect(await run.result).toBe('cancelled');
    expect(run.rendered).toHaveLength(0);
    expect(run.disposed.count).toBe(1);
  });

  test('une scène statique sort en PNG', async () => {
    const run = scenario({ totalMs: 6000, mode: 'save', outcome: { kind: 'image', blob: new Blob(['p'], { type: 'image/png' }) } });
    expect(await run.result).toBe('saved');
    expect(run.delivered[0]?.fileName).toBe('meeshy-story-1.png');
  });

  test('un navigateur sans enregistreur le dit, et rien ne se livre', async () => {
    const run = scenario({ totalMs: 6000, mode: 'save', outcome: { kind: 'unsupported' } });
    expect(await run.result).toBe('unsupported');
    expect(run.delivered).toHaveLength(0);
  });

  test('une activation de geste expirée pendant le rendu demande de retaper', async () => {
    expect(await scenario({ totalMs: 6000, mode: 'save', delivery: 'retry' }).result).toBe('retry');
  });
});
