import { describe, expect, test } from 'bun:test';

import { loadCardSources } from './message-card-media-load';
import type { CardSource } from './message-card-paint';
import type { MessageCardMediaItem } from './message-card-subject';

const item = (overrides: Partial<MessageCardMediaItem>): MessageCardMediaItem => ({
  id: 'a',
  card: { kind: 'image', width: 10, height: 10 },
  url: '/file',
  mimeType: 'image/jpeg',
  posterUrl: null,
  ...overrides,
});

/** Un document minimal : une image qui ne se charge jamais — le délai tranche. */
const stubDocument = { createElement: () => new EventTarget() } as unknown as Document;

const bitmap = (name: string) => ({ width: 10, height: 10, name }) as unknown as CardSource;

describe('loadCardSources — les pixels de chaque média, en blob', () => {
  test('une image se décode ; une vidéo se montre par son image d’attente ; un audio n’a pas de pixels', async () => {
    const fetched: string[] = [];
    const loaded = await loadCardSources(
      [item({ id: 'i', url: '/i.jpg' }), item({ id: 'v', url: '/v.mp4', card: { kind: 'video', width: 16, height: 9 }, posterUrl: '/v-poster.jpg' }), item({ id: 'a', url: '/a.m4a', card: { kind: 'audio', durationMs: 1, name: 'a', peaks: [] } })],
      {
        fetchBlob: async (url) => (fetched.push(url), new Blob([url])),
        doc: stubDocument,
        createObjectURL: () => 'blob:x',
        revokeObjectURL: () => undefined,
        decodeImage: async (blob) => bitmap(await blob.text()),
      },
    );
    expect(loaded.sources.map((source) => (source as unknown as { name?: string } | null)?.name ?? null)).toEqual(['/i.jpg', '/v-poster.jpg', null]);
    expect(fetched).not.toContain('/v.mp4');
    expect(fetched).not.toContain('/a.m4a');
  });

  test('une pièce introuvable laisse sa place vide, sans faire tomber les autres', async () => {
    const loaded = await loadCardSources([item({ id: 'x', url: '/missing' }), item({ id: 'y', url: '/ok' })], {
      fetchBlob: async (url) => (url === '/missing' ? null : new Blob([url])),
      doc: stubDocument,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => undefined,
      decodeImage: async () => bitmap('ok'),
    });
    expect(loaded.sources[0]).toBeNull();
    expect(loaded.sources[1]).not.toBeNull();
  });

  test('une pièce qui ne se charge pas est NOMMÉE comme échouée — jamais un cadre vide muet (#8901)', async () => {
    const loaded = await loadCardSources(
      [
        item({ id: 'missing', url: '/missing' }),
        item({ id: 'thrown', url: '/thrown' }),
        item({ id: 'undecodable', url: '/garbage' }),
        item({ id: 'ok', url: '/ok' }),
        item({ id: 'voice', url: '/a.m4a', card: { kind: 'audio', durationMs: 1, name: 'a', peaks: [] } }),
      ],
      {
        fetchBlob: async (url) => {
          if (url === '/thrown') throw new Error('offline');
          return url === '/missing' ? null : new Blob([url]);
        },
        doc: stubDocument,
        createObjectURL: () => 'blob:x',
        revokeObjectURL: () => undefined,
        decodeImage: async (blob) => ((await blob.text()) === '/garbage' ? null : bitmap('ok')),
      },
    );
    expect(loaded.failed).toEqual(['missing', 'thrown', 'undecodable']);
  });

  test('une vidéo sans image d’attente ni première image décodable est en échec', async () => {
    const loaded = await loadCardSources([item({ id: 'v', url: '/v.mp4', card: { kind: 'video', width: 16, height: 9 }, posterUrl: '/gone.jpg' })], {
      fetchBlob: async (url) => (url === '/gone.jpg' ? null : new Blob([url])),
      doc: stubDocument,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => undefined,
      decodeImage: async () => bitmap('poster'),
      timeoutMs: 5,
    });
    expect(loaded.failed).toEqual(['v']);
  });

  test('chaque URL d’objet créée est rendue à la fermeture', async () => {
    const revoked: string[] = [];
    let n = 0;
    const loaded = await loadCardSources([item({ id: 'i' })], {
      fetchBlob: async () => new Blob(['x']),
      doc: stubDocument,
      createObjectURL: () => `blob:${(n += 1)}`,
      revokeObjectURL: (url) => revoked.push(url),
      timeoutMs: 5,
    });
    loaded.dispose();
    expect(revoked).toEqual(['blob:1']);
  });
});
