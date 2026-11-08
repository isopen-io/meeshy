import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { MessageCardInput } from '@/lib/export/message-card-layout';
import type { MessageCardMediaItem } from '@/lib/export/message-card-subject';
import type { PublicationImageRequest } from '@/lib/export/publication-image-store';
import type { RenderedSceneFile } from '@/lib/export/scene/scene-export-browser';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadExportCardCatalog } from '@/lib/i18n-export-card-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import PublicationImageSheet, { type PublicationSheetPorts } from './publication-image-sheet';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadExportCardCatalog('fr');
});

afterEach(() => mounter.unmountAll());

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const SCENE = {
  key: 'post:p1',
  fileStem: 'reel-p1',
  document: { v: 3, scenes: [{ id: 's1', objects: [] }] },
  carrier: { postId: 'p1', media: [] },
  watermark: null,
} as const satisfies PublicationImageRequest['scene'];

const requestOf = (scene: PublicationImageRequest['scene']): PublicationImageRequest => ({
  key: 'post:p1',
  subject: { quoted: null, reply: { author: 'Awa', text: 'Mon réel', handle: 'awa' }, sentAt: new Date('2026-11-05T10:00:00Z'), quotedAt: null, media: [] },
  scene,
});

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const mountSheet = async (request: PublicationImageRequest, render: (signal: AbortSignal) => Promise<RenderedSceneFile | null>) => {
  const painted: MessageCardInput[] = [];
  const loaded: (readonly MessageCardMediaItem[])[] = [];
  const delivered: string[] = [];
  const ports: PublicationSheetPorts = {
    paint: async (input) => {
      painted.push(input);
      return { blob: new Blob(['card'], { type: 'image/png' }), truncated: false, width: 1080, height: 1080, regions: [] };
    },
    thumbnail: async () => new Blob(['t']),
    loadSources: async (items) => {
      loaded.push(items);
      return { sources: items.map(() => null), failed: [], dispose: () => undefined };
    },
    deliver: async (_blob, fileName) => {
      delivered.push(fileName);
      return 'gallery';
    },
    createObjectURL: () => 'blob:card',
    revokeObjectURL: () => undefined,
  };
  const host = await mounter.mount(
    <PublicationImageSheet
      request={request}
      handle="moi"
      onClose={() => undefined}
      ports={ports}
      renderScene={(_scene, signal) => render(signal)}
      createObjectURL={() => 'blob:scene-render'}
      revokeObjectURL={() => undefined}
    />,
  );
  await mounter.settle();
  return { host, painted, loaded, delivered };
};

describe('PublicationImageSheet — « Imager » une publication dans l’atelier de carte (#16393)', () => {
  test('une œuvre composée ouvre l’atelier TOUT DE SUITE, en préparation : rien ne part avant son rendu', async () => {
    const pending = deferred<RenderedSceneFile | null>();
    const { painted } = await mountSheet(requestOf(SCENE), () => pending.promise);
    expect(painted.at(-1)?.reply.text).toBe('Mon réel');
    expect(document.body.textContent).toContain('Chargement des médias');
    expect(document.querySelector<HTMLButtonElement>('[data-export-save]')?.disabled).toBe(true);
  });

  test('une œuvre composée arrive avec son RENDU comme média de la carte, en tête', async () => {
    const { loaded, painted } = await mountSheet(requestOf(SCENE), async () => ({ blob: new Blob(['v'], { type: 'video/webm' }), mimeType: 'video/webm' }));
    await mounter.settle();
    const items = loaded.at(-1) ?? [];
    expect(items.map((item) => [item.id, item.url, item.card.kind, item.hero])).toEqual([['scene-post:p1', 'blob:scene-render', 'video', true]]);
    expect(painted.at(-1)?.media?.length).toBe(1);
  });

  test('un post simple s’ouvre prêt, sans rendu de scène', async () => {
    let renders = 0;
    await mountSheet(requestOf(null), async () => {
      renders += 1;
      return null;
    });
    expect(renders).toBe(0);
    expect(document.querySelector<HTMLButtonElement>('[data-export-save]')?.disabled).toBe(false);
  });

  test('un rendu impossible se DIT, la carte reste celle du texte', async () => {
    await mountSheet(requestOf(SCENE), async () => null);
    await mounter.settle();
    expect(document.querySelector('[data-publication-image-status]')?.textContent).not.toBe('');
  });
});
