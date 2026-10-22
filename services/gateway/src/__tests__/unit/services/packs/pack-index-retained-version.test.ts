/**
 * Une version de pack QUITTÉE ne se sert plus sous son numéro (#10278). Les
 * clés de `retained.json` (`<domaine>/<slug>@<version>`) nomment les versions
 * dont les fichiers ne sont gardés que pour une photo déjà prise : une entrée
 * de registre qui reprend l'une d'elles sert un second contenu sous un numéro
 * que des clients tiennent déjà. Elle tombe seule, comptée, fail-closed — ses
 * fichiers retenus restent servis au magasin, le pack ne s'affiche pas.
 *
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { buildPackIndex } from '../../../../services/packs/PackIndex';

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const ref = (seed: string, ext = 'webp') => ({ src: `${sha(seed).slice(0, 16)}.${ext}`, bytes: 1024, sha256: sha(seed) });

const entry = (slug: string, version: number) => ({
  slug,
  domain: 'glory-frame',
  origin: 'official',
  version,
  order: 0,
  installedByDefault: true,
  removable: false,
  hidden: false,
  contractSchema: 1,
  cover: ref('a'),
  preview: null,
  contract: ref('c', 'json'),
  strings: { fr: ref('d', 'json') },
  downloadBytes: { story: 1024, square: null },
  names: { fr: { name: 'Néon', description: 'Un pack' } },
  usage: { kind: 'rank', rank: 'ambassadeur', division: 4 },
});

describe('buildPackIndex — une version retenue dans retained.json est une version quittée', () => {
  it('une entrée qui reprend une version quittée tombe, comptée ; ses fichiers retenus restent servis', () => {
    const index = buildPackIndex({ registries: [[entry('neon', 2)]], retained: { 'glory-frame/neon@2': ['fedcba9876543210.json'] } });
    expect(index.entries('glory-frame')).toEqual([]);
    expect(index.rejected).toBe(1);
    expect(index.isServedAsset('fedcba9876543210.json')).toBe(true);
  });

  it('une version au-dessus de la version quittée se sert ; une clé sans version entière ou d’un autre domaine ne retient rien', () => {
    const retained = { 'glory-frame/neon@1': ['fedcba9876543210.json'], 'banner/neon@2-avant-11165': ['0123456789abcdef.json'], 'wallpaper/neon@2': [] };
    const index = buildPackIndex({ registries: [[entry('neon', 2)]], retained });
    expect(index.entries('glory-frame').map((candidate) => `${candidate.slug}@${candidate.version}`)).toEqual(['neon@2']);
    expect(index.rejected).toBe(0);
  });

  it('une entrée qui redescend SOUS une version quittée tombe aussi', () => {
    const index = buildPackIndex({ registries: [[entry('neon', 1)]], retained: { 'glory-frame/neon@2': [] } });
    expect(index.entries('glory-frame')).toEqual([]);
    expect(index.rejected).toBe(1);
  });

  it('la forme LISTE de retained.json ne nomme aucune version : rien ne tombe', () => {
    const index = buildPackIndex({ registries: [[entry('neon', 1)]], retained: ['fedcba9876543210.json'] });
    expect(index.entries('glory-frame')).toHaveLength(1);
    expect(index.rejected).toBe(0);
  });
});
