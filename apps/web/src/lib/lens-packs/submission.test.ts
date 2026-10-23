import { describe, expect, test } from 'bun:test';

import { prepareLensSubmission, type Digest } from './submission';

/**
 * W16 (#11322) — PROPOSER UNE LENS : la préparation, loi pure (l'empreinte est
 * injectée). Le document se relit par `parseLens`, comme le serveur ; chaque
 * fichier choisi prend son adresse `<sha16>.<ext>` ; un fichier que les couches
 * nomment et qui manque, un coût déclaré sous le coût mesuré, une limite
 * dépassée sont refusés AVANT le réseau, en disant lequel. Le serveur reste juge.
 */
const lensDocument = (extra: Record<string, unknown> = {}) => ({
  schema: 1,
  id: 'aurore-polaire',
  name: 'Aurore polaire',
  credits: { author: 'Studio Nord', createdAt: '2026-10-01', updatedAt: '2026-10-12' },
  surfaces: ['capture', 'live'],
  cost: 'standard',
  window: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-31T23:59:59Z' },
  layers: [
    { kind: 'lut', id: 'grade', asset: 'aaaaaaaaaaaaaaaa.png', intensity: 0.8 },
    { kind: 'sticker', id: 'couronne', asset: 'bbbbbbbbbbbbbbbb.png', anchor: { type: 'screen', x: 0.5, y: 0.2 }, size: 0.3 },
  ],
  ...extra,
});

const file = (name: string, content: string, type = 'image/png'): File => new File([content], name, { type });

/** L'empreinte des témoins : le contenu du fichier EST son empreinte (16 caractères hexadécimaux, complétés). */
const digest: Digest = async (bytes) => new TextDecoder().decode(bytes).padEnd(64, '0');

const prepare = (document: unknown, files: readonly File[]) => prepareLensSubmission({ documentText: JSON.stringify(document), files, digest });

describe('prepareLensSubmission', () => {
  test('un document lisible et tous ses fichiers : la proposition part, chaque fichier sous son adresse', async () => {
    const outcome = await prepare(lensDocument(), [file('grade.png', 'aaaaaaaaaaaaaaaa'), file('couronne.png', 'bbbbbbbbbbbbbbbb')]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Object.keys(outcome.submission.assets).sort()).toEqual(['aaaaaaaaaaaaaaaa.png', 'bbbbbbbbbbbbbbbb.png']);
    expect(outcome.submission.assets['aaaaaaaaaaaaaaaa.png']).toBe(btoa('aaaaaaaaaaaaaaaa'));
    expect(outcome.submission.document).toEqual(lensDocument());
    expect(outcome.name).toBe('Aurore polaire');
  });

  test('un fichier que les couches nomment et qui manque : refusé, en le nommant', async () => {
    expect(await prepare(lensDocument(), [file('grade.png', 'aaaaaaaaaaaaaaaa')])).toEqual({ ok: false, reason: 'missing-asset', detail: 'bbbbbbbbbbbbbbbb.png' });
  });

  test('un fichier choisi que rien ne nomme ne part pas', async () => {
    const outcome = await prepare(lensDocument(), [file('a.png', 'aaaaaaaaaaaaaaaa'), file('b.png', 'bbbbbbbbbbbbbbbb'), file('c.png', 'cccccccccccccccc')]);
    expect(outcome.ok && Object.keys(outcome.submission.assets).length).toBe(2);
  });

  test('un document illisible, d’un schéma futur ou interdit : refusé avec sa raison', async () => {
    expect((await prepareLensSubmission({ documentText: '{oops', files: [], digest })).ok).toBe(false);
    expect(await prepare({ ...lensDocument(), schema: 99 }, [])).toEqual({ ok: false, reason: 'update-required' });
    expect(await prepare(lensDocument({ script: 'alert(1)' }), [])).toMatchObject({ ok: false, reason: 'forbidden' });
  });

  test('un coût déclaré sous le coût mesuré : refusé', async () => {
    const heavy = lensDocument({
      cost: 'light',
      layers: [
        { kind: 'lut', id: 'a', asset: 'aaaaaaaaaaaaaaaa.png', intensity: 1 },
        { kind: 'lut', id: 'b', asset: 'aaaaaaaaaaaaaaaa.png', intensity: 1 },
        { kind: 'particles', id: 'neige', preset: 'snow', density: 'high' },
      ],
    });
    expect(await prepare(heavy, [file('a.png', 'aaaaaaaaaaaaaaaa')])).toEqual({ ok: false, reason: 'cost-understated', detail: 'standard' });
  });

  test('un fichier trop lourd : refusé, en le nommant', async () => {
    const big = file('grade.png', 'aaaaaaaaaaaaaaaa'.padEnd(600_000, 'x'));
    expect(await prepare(lensDocument(), [big, file('c.png', 'bbbbbbbbbbbbbbbb')])).toEqual({ ok: false, reason: 'too-large', detail: 'grade.png' });
  });
});
