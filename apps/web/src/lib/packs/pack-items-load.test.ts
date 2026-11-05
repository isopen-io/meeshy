import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';

import { loadPackItems, packItemsQueryKey } from './pack-items-load';

/**
 * **CHARGER LES ÉLÉMENTS D'UN PACK** (#16267) — un pack embarqué n'appelle pas
 * le réseau ; un pack servi lit son détail (`/packs/<domaine>/<slug>`), puis son
 * contrat adressé par contenu, à la demande.
 */

const depsAnswering = (answer: (request: HttpRequest) => ApiResult<unknown>): { deps: ConversationsDeps; calls: HttpRequest[] } => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
};

const SHA = 'abcdef0123456789'.padEnd(64, '0');
const contractRef = { src: 'abcdef0123456789.json', bytes: 2048, sha256: SHA };

describe('charger les éléments d’un pack', () => {
  test('un pack embarqué se lit sans aucune requête, sans poids à télécharger', async () => {
    const { deps, calls } = depsAnswering(() => ({ ok: false, status: 500, error: 'x' }));
    const result = await loadPackItems({ domain: 'avatar-ring', slug: 'contours-essentiels', deps, loadContract: async () => null });
    expect(result.embedded).toBe(true);
    expect(result.bytes).toBeNull();
    expect(result.items.length).toBeGreaterThan(0);
    expect(calls).toEqual([]);
  });

  test('un pack servi lit son détail puis son contrat ; le poids est celui annoncé', async () => {
    const { deps, calls } = depsAnswering(() => ({ ok: true, data: { slug: 'officiel', name: 'Officiel', description: '', installed: false, contract: contractRef } }));
    const asked: string[] = [];
    const result = await loadPackItems({
      domain: 'avatar-ring',
      slug: 'officiel',
      deps,
      loadContract: async (src) => {
        asked.push(src);
        return { domain: 'avatar-ring', rings: [{ key: 'anneau', stroke: { style: 'solid', width: 0.05, colors: ['#112233'] } }] };
      },
    });
    expect(calls[0]?.path).toBe('/api/v1/packs/avatar-ring/officiel');
    expect(asked).toEqual(['abcdef0123456789.json']);
    expect(result).toMatchObject({ embedded: false, bytes: 2048, contract: 'abcdef0123456789.json' });
    expect(result.items.map((item) => item.key)).toEqual(['anneau']);
  });

  test('un détail en échec ou un contrat illisible est une ERREUR, que la fiche dit — jamais une fiche vide silencieuse', async () => {
    const failing = depsAnswering(() => ({ ok: false, status: 503, error: 'down' }));
    await expect(loadPackItems({ domain: 'banner', slug: 'officiel', deps: failing.deps, loadContract: async () => null })).rejects.toThrow();
    const served = depsAnswering(() => ({ ok: true, data: { slug: 'officiel', name: 'O', description: '', installed: true, contract: contractRef } }));
    await expect(loadPackItems({ domain: 'banner', slug: 'officiel', deps: served.deps, loadContract: async () => null })).rejects.toThrow();
  });

  test('la clé de cache distingue le domaine et le slug', () => {
    expect(packItemsQueryKey('banner', 'a')).not.toEqual(packItemsQueryKey('banner-frame', 'a'));
  });
});
