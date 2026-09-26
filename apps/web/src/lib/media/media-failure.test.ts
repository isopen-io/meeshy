import { describe, expect, test } from 'bun:test';

import { classifyMediaFailure } from './media-failure';

/**
 * **UN MÉDIA QUI NE SE CHARGE PAS (#8141)** — l'`<img>` ne dit pas POURQUOI il
 * a échoué. La visionneuse doit pourtant savoir si « Réessayer » a un sens : un
 * fichier introuvable (404/410) ou refusé ne reviendra pas, une coupure réseau
 * ou une passerelle en panne, si. `classifyMediaFailure` rejoue la requête en
 * `HEAD` et tranche.
 */

const answering = (status: number) => async () => new Response(null, { status });

describe('classifyMediaFailure', () => {
  test('un fichier introuvable, disparu ou refusé est DÉFINITIF — aucun « Réessayer »', async () => {
    for (const status of [401, 403, 404, 410]) {
      expect(await classifyMediaFailure({ url: 'https://gate/x.jpg', fetch: answering(status), online: true })).toBe('gone');
    }
  });

  test('une passerelle en panne ou saturée est TRANSITOIRE', async () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(await classifyMediaFailure({ url: 'https://gate/x.jpg', fetch: answering(status), online: true })).toBe('transient');
    }
  });

  test('une coupure réseau est TRANSITOIRE', async () => {
    const failing = async (): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    };
    expect(await classifyMediaFailure({ url: 'https://gate/x.jpg', fetch: failing, online: true })).toBe('transient');
  });

  test('hors ligne, la réponse est TRANSITOIRE sans même interroger le réseau', async () => {
    let asked = false;
    const spy = async () => {
      asked = true;
      return new Response(null, { status: 404 });
    };
    expect(await classifyMediaFailure({ url: 'https://gate/x.jpg', fetch: spy, online: false })).toBe('transient');
    expect(asked).toBe(false);
  });

  test('un fichier servi mais illisible (réponse 200) ne se répare pas en réessayant', async () => {
    expect(await classifyMediaFailure({ url: 'https://gate/x.jpg', fetch: answering(200), online: true })).toBe('gone');
  });

  test('la sonde part en HEAD, sans corps à télécharger', async () => {
    const seen: RequestInit[] = [];
    const spy = async (_url: string, init?: RequestInit) => {
      seen.push(init ?? {});
      return new Response(null, { status: 404 });
    };
    await classifyMediaFailure({ url: 'https://gate/x.jpg', fetch: spy, online: true });
    expect(seen[0]?.method).toBe('HEAD');
  });
});
