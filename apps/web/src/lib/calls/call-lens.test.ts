import { describe, expect, test } from 'bun:test';

import type { Lens } from '@meeshy/shared/types/lens-format';

import { identityStrip } from '@/lib/meeshy-lens/lens-lut';

import { callLensStore, loadCallLens, poseCallLens } from './call-lens';

/**
 * #11994 — UNE SURFACE D'APPEL POSE UNE LENS. Ses fichiers sont lus et
 * décodés par l'hôte, une fois, puis voyagent dans les réglages ; son texte
 * est incrusté dans la vidéo ENVOYÉE, donc rendu dans les langues de
 * l'ÉMETTEUR, jamais dans celles d'un lecteur.
 */
const LUT_ASSET = 'aaaaaaaaaaaaaaaa.png';

const LENS: Lens = {
  schema: 1,
  id: 'aurore',
  name: 'Aurore',
  credits: { author: 'Studio', createdAt: '2026-10-01' },
  surfaces: ['live'],
  cost: 'light',
  window: { startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z' },
  layers: [{ kind: 'lut', id: 'g', asset: LUT_ASSET }],
  triggers: [],
};

const fileDeps = {
  read: async (asset: string) => new Blob([asset]),
  decode: async () => ({ name: 'bande' }) as unknown as ImageBitmap,
  stripOf: () => identityStrip(16),
};

describe('loadCallLens', () => {
  test('les réglages portent la lens, les langues de l’ÉMETTEUR dans son ordre, le palier, et les fichiers décodés', async () => {
    const settings = await loadCallLens({ lens: LENS, senderLanguages: ['es', 'fr'], level: 'reduced', files: fileDeps });
    expect(settings.lens).toBe(LENS);
    expect(settings.languages).toEqual(['es', 'fr']);
    expect(settings.level).toBe('reduced');
    expect(settings.files?.cubes[LUT_ASSET]?.size).toBe(16);
  });

  test('sans palier déclaré, la lens se joue entière', async () => {
    expect((await loadCallLens({ lens: LENS, senderLanguages: ['fr'], files: fileDeps })).level).toBe('full');
  });
});

describe('poseCallLens', () => {
  test('poser puis retirer une lens met le moteur à jour à chaque geste', () => {
    const refreshed: number[] = [];
    const refresh = () => void refreshed.push(1);
    poseCallLens({ lens: LENS, languages: ['fr'], level: 'full' }, refresh);
    expect(callLensStore.getState().lens?.lens.id).toBe('aurore');
    poseCallLens(null, refresh);
    expect(callLensStore.getState().lens).toBeNull();
    expect(refreshed).toHaveLength(2);
  });
});
