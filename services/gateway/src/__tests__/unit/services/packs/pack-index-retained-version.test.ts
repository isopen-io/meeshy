/**
 * Une version de pack QUITTÉE ne se sert plus sous son numéro (#10278). Les
 * clés de `retained.json` (`<domaine>/<slug>@<version>`) nomment les versions
 * dont les fichiers ne sont gardés que pour une photo déjà prise : une entrée
 * de registre qui reprend l'une d'elles sert un second contenu sous un numéro
 * que des clients tiennent déjà. Elle tombe seule, comptée, fail-closed — ses
 * fichiers retenus restent servis au magasin, le pack ne s'affiche pas.
 *
 * MÊME loi que le cliquet de la CI (`glory-frame-version-ratchet.ts`) : une
 * version égale à la version quittée pour les MÊMES fichiers est une
 * restauration à l'identique, admise — ce que la CI laisse passer ne disparaît
 * pas en silence de la boutique au démarrage.
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

  it('une version égale à la version quittée pour les MÊMES fichiers (restauration à l’identique) se sert, comme en CI', () => {
    const same = entry('neon', 2);
    const files = [same.cover.src, same.contract.src, same.strings.fr.src];
    const index = buildPackIndex({ registries: [[same]], retained: { 'glory-frame/neon@2': [...files].reverse() } });
    expect(index.entries('glory-frame').map((candidate) => `${candidate.slug}@${candidate.version}`)).toEqual(['neon@2']);
    expect(index.rejected).toBe(0);
  });

  it('les fichiers du contrat relu comptent dans l’identité : une version égale qui en sert d’autres tombe', () => {
    const same = entry('neon', 2);
    const files = [same.cover.src, same.contract.src, same.strings.fr.src];
    const contractRefs = () => [ref('e'), ref('f', 'png')];
    expect(buildPackIndex({ registries: [[same]], retained: { 'glory-frame/neon@2': files }, contractRefs }).entries('glory-frame')).toEqual([]);
    expect(buildPackIndex({ registries: [[same]], retained: { 'glory-frame/neon@2': [...files, ref('e').src, ref('f', 'png').src] }, contractRefs }).entries('glory-frame')).toHaveLength(1);
  });

  it('la forme LISTE de retained.json ne nomme aucune version : rien ne tombe', () => {
    const index = buildPackIndex({ registries: [[entry('neon', 1)]], retained: ['fedcba9876543210.json'] });
    expect(index.entries('glory-frame')).toHaveLength(1);
    expect(index.rejected).toBe(0);
  });
});
