import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from './conversations';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { loadCaptureFrameShelf } from './packs-capture-frame';

/**
 * L'ÉTAGÈRE DES AMBIANCES DE CAPTURE (#10169, LC) — les ambiances INSTALLÉES,
 * dont les puces se proposent au mode Montage. Ce qu'on ne sait pas (ancien
 * serveur, 403 d'un invité, panne, démonstration) ne cache AUCUNE puce : les
 * défauts du registre embarqué valent, et ils installent tout.
 */

const pack = (slug: string, installed = true) => ({ slug, name: slug, description: '', author: 'Meeshy', installed, domain: 'capture-frame' });

const depsAnswering = (answer: (request: HttpRequest) => ApiResult<unknown>, source: ConversationsDeps['source'] = 'gateway'): { deps: ConversationsDeps; paths: string[] } => {
  const paths: string[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      paths.push(request.path);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source, transport }, paths };
};

describe('loadCaptureFrameShelf', () => {
  test('lit /packs/capture-frame/installed et rend les slugs des ambiances installées', async () => {
    const { deps, paths } = depsAnswering(() => ({ ok: true, data: [pack('signature'), pack('jovial'), pack('morbide', false)] }));
    expect(await loadCaptureFrameShelf(deps)).toEqual(['signature', 'jovial']);
    expect(paths).toEqual(['/api/v1/packs/capture-frame/installed']);
  });

  test('une ligne malformée tombe seule', async () => {
    const { deps } = depsAnswering(() => ({ ok: true, data: [pack('elegant'), { slug: 3 }, null] }));
    expect(await loadCaptureFrameShelf(deps)).toEqual(['elegant']);
  });

  test('toutes retirées ⇒ une étagère VIDE, qui se distingue de l’inconnu', async () => {
    const { deps } = depsAnswering(() => ({ ok: true, data: [] }));
    expect(await loadCaptureFrameShelf(deps)).toEqual([]);
  });

  test('403 (invité de lien), 404 (ancien serveur) ou panne ⇒ inconnu (null) : aucune puce ne se cache', async () => {
    for (const status of [403, 404, 500, 0]) {
      const { deps } = depsAnswering(() => ({ ok: false, status, error: 'x' }));
      expect(await loadCaptureFrameShelf(deps)).toBeNull();
    }
  });
});
