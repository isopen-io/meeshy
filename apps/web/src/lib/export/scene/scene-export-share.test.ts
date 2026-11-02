import { describe, expect, test } from 'bun:test';

import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';

import type { SceneDelivery } from './scene-export-run';
import { shareSceneFile } from './scene-export-share';

const video = (): Blob => new Blob(['v'], { type: 'video/mp4' });

type Trace = { readonly shared: string[]; readonly downloaded: string[]; readonly taps: number };

function hostOf(params: { readonly share?: 'ok' | 'expired-once' | 'expired' | 'abort' | 'none'; readonly anchor?: boolean }, trace: { shared: string[]; downloaded: string[] }): FileDeliveryHost {
  const expiredOnce = { left: params.share === 'expired-once' ? 1 : 0 };
  const share =
    params.share === undefined || params.share === 'none'
      ? {}
      : {
          canShareFiles: () => true,
          shareFiles: async (data: { readonly files: readonly File[] }) => {
            const name = data.files[0]?.name ?? '?';
            if (params.share === 'expired' || expiredOnce.left > 0) {
              expiredOnce.left -= 1;
              throw Object.assign(new Error('activation'), { name: 'NotAllowedError' });
            }
            if (params.share === 'abort') throw Object.assign(new Error('fermé'), { name: 'AbortError' });
            trace.shared.push(name);
          },
        };
  const anchor =
    params.anchor === true
      ? {
          document: {
            createElement: () => {
              const a = { href: '', download: '', click: () => trace.downloaded.push(a.download) };
              return a as unknown as HTMLElement;
            },
            body: { appendChild: (el: HTMLElement) => el, removeChild: (el: HTMLElement) => el },
          } as never,
          createObjectURL: () => 'blob:x',
          revokeObjectURL: () => undefined,
        }
      : {};
  return { ...anchor, ...share };
}

async function shareWith(params: { readonly share?: 'ok' | 'expired-once' | 'expired' | 'abort' | 'none'; readonly anchor?: boolean; readonly tap?: boolean }): Promise<{ readonly outcome: SceneDelivery } & Trace> {
  const trace = { shared: [] as string[], downloaded: [] as string[] };
  let taps = 0;
  const outcome = await shareSceneFile({
    blob: video(),
    fileName: 'meeshy-story-1.mp4',
    mimeType: 'video/mp4',
    host: hostOf(params, trace),
    awaitTap: (deliver) => {
      taps += 1;
      return params.tap === false ? Promise.resolve('cancelled') : deliver();
    },
  });
  return { outcome, ...trace, taps };
}

describe('« Partager » d’une story livre le FICHIER composé (#13881)', () => {
  test('Web Share Level 2 qui accepte le fichier le reçoit tel quel, sans toucher de plus', async () => {
    const run = await shareWith({ share: 'ok', anchor: true });
    expect(run.outcome).toBe('delivered');
    expect(run.shared).toEqual(['meeshy-story-1.mp4']);
    expect(run.downloaded).toEqual([]);
    expect(run.taps).toBe(0);
  });

  test('une activation expirée pendant le rendu attend un toucher neuf, qui ouvre la feuille', async () => {
    const run = await shareWith({ share: 'expired-once', anchor: true });
    expect(run.taps).toBe(1);
    expect(run.outcome).toBe('delivered');
    expect(run.shared).toEqual(['meeshy-story-1.mp4']);
    expect(run.downloaded).toEqual([]);
  });

  test('renoncer au toucher n’envoie rien', async () => {
    const run = await shareWith({ share: 'expired', anchor: true, tap: false });
    expect(run.outcome).toBe('cancelled');
    expect(run.shared).toEqual([]);
    expect(run.downloaded).toEqual([]);
  });

  test('fermer la feuille du système est une annulation, pas un téléchargement', async () => {
    const run = await shareWith({ share: 'abort', anchor: true });
    expect(run.outcome).toBe('cancelled');
    expect(run.downloaded).toEqual([]);
  });

  test('un navigateur qui ne partage pas de fichier le télécharge', async () => {
    const run = await shareWith({ share: 'none', anchor: true });
    expect(run.outcome).toBe('delivered');
    expect(run.downloaded).toEqual(['meeshy-story-1.mp4']);
    expect(run.taps).toBe(0);
  });

  test('un hôte sans aucune porte échoue franchement', async () => {
    expect((await shareWith({ share: 'none', anchor: false })).outcome).toBe('failed');
  });
});
