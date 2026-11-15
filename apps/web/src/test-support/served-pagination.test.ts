import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { resultatServi } from './served-pagination';

/**
 * **LE DOUBLE EST GAGÉ SUR L'ORIGINAL** (#6862, revue-correction).
 *
 * `resultatServi` reproduit la conversion `enveloppe → ApiResult` du
 * transport, et c'est elle qui a fait tomber le défaut de pagination des
 * quatre décodeurs d'administration : un double qui rendait `{ ok: true, data:
 * enveloppeEntière }` faisait verdir des décodeurs qui, en production, ne
 * trouvaient plus ni `total` ni `hasMore`.
 *
 * Une reproduction est une JUMELLE : elle se sépare de son original au premier
 * changement de `http.ts`, sans qu'aucun témoin ne rougisse — et tous les
 * témoins de port qui passent par elle mesureraient alors une charge que le
 * produit ne sert pas. Ce fichier fait donc DÉCIDER le transport RÉEL, avec un
 * `fetch` doublé, et compare les deux verdicts.
 */

const transporte = async (enveloppe: unknown) => {
  const transport = createHttpTransport({
    base: 'https://gate.meeshy.test/api/v1',
    fetchImpl: async () =>
      new Response(JSON.stringify(enveloppe), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    timeoutMs: 0,
  });

  return transport.request<unknown>({ method: 'GET', path: '/admin/conversations' });
};

describe('`resultatServi` rend ce que le transport rend', () => {
  test('une page paginée : `data` dépaqueté, `pagination` SIBLING de `ok`', async () => {
    const enveloppe = {
      success: true,
      data: [{ id: 'c1' }, { id: 'c2' }],
      pagination: { total: 57, page: 1, limit: 2, hasMore: true },
    };

    const reel = await transporte(enveloppe);

    expect(reel).toEqual(resultatServi(enveloppe));
    expect(reel.ok).toBe(true);
    // La forme exacte que le défaut lisait au mauvais niveau : `pagination`
    // n'est PAS dans `data`, et `data` n'est pas l'enveloppe.
    expect(reel.ok && reel.pagination?.total).toBe(57);
    expect(reel.ok && reel.data).toEqual(enveloppe.data);
  });

  test('une charge sans pagination ne fabrique pas le champ', async () => {
    const enveloppe = { success: true, data: { id: 'u1' } };

    const reel = await transporte(enveloppe);

    expect(reel).toEqual(resultatServi(enveloppe));
    expect(reel.ok && 'pagination' in reel).toBe(false);
  });
});
