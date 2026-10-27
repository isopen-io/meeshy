import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FRAME_MOODS, FrameMoodFileSchema, captureFrameCount, captureFramePackUsage, type FrameMoodFile } from '../types/capture-frames';
import { PACK_LANGUAGES } from '../types/content-pack';
import { parsePackIndex } from '../types/content-pack-index';
import { canUseFrame } from '../types/frame-usage';
import { PACK_ASSETS_DIR, REPO_ROOT } from '../scripts/generate-glory-frames';

/**
 * LES DOUZE AMBIANCES DE CAPTURE SONT DOUZE PACKS INTÉGRÉS (#10169, lot LC, PP4)
 * — le registre `design/call-capture-frames/packs.json`, produit par
 * `services/gateway/scripts/generate-capture-frame-packs.ts`. Installés par
 * défaut, retirables, et installer ne télécharge RIEN (#10187) : les cadres
 * restent embarqués, le contrat n'est là que pour que la passerelle valide le
 * pack avec le schéma même des clients.
 */

const FRAMES = join(REPO_ROOT, 'packages/shared/design/call-capture-frames');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const registry = readJson(join(FRAMES, 'packs.json'));
const { entries, rejected } = parsePackIndex(registry);
const moodFile = (mood: string): unknown => readJson(join(FRAMES, `${mood}.json`));
const parsedMood = (mood: string): FrameMoodFile => FrameMoodFileSchema.parse(moodFile(mood));

describe('le registre des packs de capture', () => {
  it('porte les douze ambiances, dans l’ordre du catalogue, sans aucun refus', () => {
    expect(rejected).toBe(0);
    expect(entries.map((entry) => entry.slug)).toEqual([...FRAME_MOODS]);
    expect(entries.map((entry) => entry.order)).toEqual(FRAME_MOODS.map((_, index) => index));
  });

  it('chaque pack est intégré, installé par défaut, retirable, et ne télécharge rien (#10187)', () => {
    for (const entry of entries) {
      expect({ slug: entry.slug, domain: entry.domain, origin: entry.origin, installedByDefault: entry.installedByDefault, removable: entry.removable, hidden: entry.hidden, downloadBytes: entry.downloadBytes }).toEqual({
        slug: entry.slug,
        domain: 'capture-frame',
        origin: 'builtin',
        installedByDefault: true,
        removable: true,
        hidden: false,
        downloadBytes: { story: 0, square: null },
      });
      expect(entry.price).toBeUndefined();
      expect(entry.reward).toBeUndefined();
    }
  });

  it('le contrat de chaque pack EST son fichier d’ambiance, à l’octet près : régénérer après toute édition d’une ambiance', () => {
    for (const entry of entries) {
      const path = join(PACK_ASSETS_DIR, entry.contract.src);
      expect({ slug: entry.slug, present: existsSync(path) }).toEqual({ slug: entry.slug, present: true });
      const bytes = readFileSync(path);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.contract.sha256);
      expect(bytes.length).toBe(entry.contract.bytes);
      expect({ slug: entry.slug, contract: JSON.parse(bytes.toString('utf8')) }).toEqual({ slug: entry.slug, contract: moodFile(entry.slug) });
    }
  });

  it('la couverture est servie par le magasin adressé par contenu', () => {
    for (const entry of entries) {
      const bytes = readFileSync(join(PACK_ASSETS_DIR, entry.cover.src));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.cover.sha256);
    }
  });

  it('l’usage de chaque pack est celui que la loi projette de ses motifs — et il sert l’appel, comme sa description le dit', () => {
    for (const entry of entries) {
      expect({ slug: entry.slug, usage: entry.usage }).toEqual({ slug: entry.slug, usage: captureFramePackUsage(parsedMood(entry.slug)) });
      expect(entry.usage === undefined ? false : canUseFrame(entry.usage, { kind: 'call' })).toBe(true);
    }
  });

  it('chaque pack est nommé et décrit dans les sept langues', () => {
    for (const entry of entries) expect({ slug: entry.slug, languages: Object.keys(entry.names).sort() }).toEqual({ slug: entry.slug, languages: [...PACK_LANGUAGES].sort() });
  });
});

describe('captureFramePackUsage / captureFrameCount', () => {
  const motif = (id: string, surfaces: readonly ('capture' | 'live')[] | undefined, buckets: readonly string[] = ['duo']): FrameMoodFile['motifs'][number] => {
    const first = parsedMood('jovial').motifs[0];
    if (first === undefined) throw new Error('jovial n’a aucun motif');
    const { surfaces: _declared, ...rest } = first;
    return { ...rest, id: `jovial.${id}`, ...(surfaces === undefined ? {} : { surfaces: [...surfaces] }), variants: Object.fromEntries(buckets.map((bucket) => [bucket, {}])) };
  };

  it('un seul motif du direct suffit : le pack sert l’appel et la capture', () => {
    expect(captureFramePackUsage({ motifs: [motif('a', ['capture']), motif('b', ['capture', 'live'])] })).toEqual({ kind: 'free', surfaces: ['call', 'photo', 'video'] });
  });

  it('sans motif du direct (ou sans surface déclarée), le pack ne sert que la capture photo et vidéo, jamais l’appel', () => {
    const usage = captureFramePackUsage({ motifs: [motif('a', ['capture']), motif('b', undefined)] });
    expect(usage).toEqual({ kind: 'free', surfaces: ['photo', 'video'] });
    expect(canUseFrame(usage, { kind: 'call' })).toBe(false);
  });

  it('compte un cadre par tranche que chaque motif déclare', () => {
    expect(captureFrameCount({ motifs: [motif('a', ['capture'], ['duo', 'comite']), motif('b', ['capture'], ['tablee'])] })).toBe(3);
  });
});
