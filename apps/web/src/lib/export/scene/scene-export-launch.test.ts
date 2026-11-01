import { afterEach, describe, expect, test } from 'bun:test';

import * as exportJobs from './scene-export-jobs';
import { launchSceneExport, type SceneExportLaunchDeps, type SceneExportRunner } from './scene-export-launch';
import type { SceneExportSubject } from './scene-export-subject';

const subject: SceneExportSubject = {
  key: 'post:p1',
  fileStem: 'post-p1',
  document: { v: 3, scenes: [] },
  carrier: { postId: 'p1', media: [] },
  watermark: '@ana',
};

const depsOf = (params: { readonly online?: boolean; readonly run: SceneExportRunner }): SceneExportLaunchDeps & { readonly contexts: { count: number } } => {
  const contexts = { count: 0 };
  return {
    contexts,
    online: () => params.online ?? true,
    preferredLanguages: () => ['es', 'fr'],
    audioContext: () => {
      contexts.count += 1;
      return null;
    },
    run: params.run,
  };
};

afterEach(() => {
  for (const job of exportJobs.getSnapshot().jobs) exportJobs.cancel(job.key);
});

describe('« Sauvegarder » d’une publication, au geste', () => {
  test('l’export entre au bandeau, tourne avec le Prisme du lecteur, puis dit son issue', async () => {
    const seen: { mode: string; languages: readonly string[] }[] = [];
    const deps = depsOf({
      run: async (input) => {
        seen.push({ mode: input.mode, languages: input.preferredLanguages });
        expect(exportJobs.getSnapshot().jobs.map((job) => job.key)).toEqual(['post:p1']);
        return 'saved';
      },
    });
    expect(await launchSceneExport({ subject, mode: 'imager', deps })).toBe('saved');
    expect(seen).toEqual([{ mode: 'imager', languages: ['es', 'fr'] }]);
    expect(deps.contexts.count).toBe(1);
    expect(exportJobs.getSnapshot().jobs).toEqual([]);
    expect(exportJobs.getSnapshot().notice?.notice).toBe('saved');
  });

  test('« Partager » tourne en mode partage et annonce « partagé »', async () => {
    const modes: string[] = [];
    const deps = depsOf({
      run: async (input) => {
        modes.push(input.mode);
        return 'shared';
      },
    });
    expect(await launchSceneExport({ subject, mode: 'share', deps })).toBe('shared');
    expect(modes).toEqual(['share']);
    expect(exportJobs.getSnapshot().notice?.notice).toBe('shared');
  });

  test('un contexte audio né dans le geste de l’hôte est celui de l’export', async () => {
    const handed = { closed: 0 } as unknown as AudioContext & { closed: number };
    const seen: (AudioContext | null)[] = [];
    const deps = depsOf({
      run: async (input) => {
        seen.push(input.audioContext);
        return 'saved';
      },
    });
    await launchSceneExport({ subject, mode: 'imager', audioContext: handed, deps });
    expect(seen).toEqual([handed]);
    expect(deps.contexts.count).toBe(0);
  });

  test('hors ligne, rien ne part et l’export le dit', async () => {
    const deps = depsOf({ online: false, run: async () => 'saved' });
    expect(await launchSceneExport({ subject, mode: 'save', deps })).toBe('offline');
    expect(deps.contexts.count).toBe(0);
    expect(exportJobs.getSnapshot().notice?.notice).toBe('offline');
  });

  test('un second geste pendant l’export de la même publication ne double rien', async () => {
    let release: (result: 'saved') => void = () => undefined;
    const deps = depsOf({ run: () => new Promise((resolve) => (release = resolve)) });
    const first = launchSceneExport({ subject, mode: 'save', deps });
    expect(await launchSceneExport({ subject, mode: 'save', deps })).toBe('busy');
    release('saved');
    expect(await first).toBe('saved');
  });

  test('un moteur qui lève libère le job et dit l’échec', async () => {
    const deps = depsOf({ run: async () => Promise.reject(new Error('chunk')) });
    expect(await launchSceneExport({ subject, mode: 'save', deps })).toBe('failed');
    expect(exportJobs.getSnapshot().jobs).toEqual([]);
  });
});
