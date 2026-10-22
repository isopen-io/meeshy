import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';

import type { FramePackDetail, FramePackSummary } from '@/lib/api/packs-glory-frame';

import { EMPTY_CATALOG, loadGloryCatalog, pickGloryFrame, type GloryCatalogPorts } from './frame-catalog';

/**
 * LE CATALOGUE DES CADRES INSTALLÉS (#10159) — lu par le port des packs et le
 * magasin, validé par le schéma partagé ; la loi partagée choisit. Les
 * manifestes VERSIONNÉS du dépôt servent de contrats : un cadre malformé tombe
 * seul, un ancien serveur (404) rend un catalogue vide, jamais une erreur.
 */

const DESIGN = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..', '..', '..', 'packages', 'shared', 'design', 'glory-frames');
const manifest = (collection: string): { readonly frames: readonly unknown[] } => JSON.parse(readFileSync(join(DESIGN, `${collection}.json`), 'utf8')) as { readonly frames: readonly unknown[] };

const ref = (name: string): PackAssetRef => ({ src: `${name.padEnd(16, '0').slice(0, 16)}.json`, bytes: 1, sha256: name.padEnd(64, '0') });

const summary = (slug: string): FramePackSummary => ({
  slug,
  name: slug,
  description: '',
  author: 'Meeshy',
  builtin: false,
  status: 'approved',
  itemCount: 1,
  coverUrl: null,
  installed: true,
  installCount: 0,
  domain: 'glory-frame',
  origin: 'official',
  version: 3,
  downloadBytes: null,
  removable: false,
  names: {},
  preview: null,
  usage: null,
});

const detail = (slug: string): FramePackDetail => ({ ...summary(slug), contractSchema: 1, contract: ref(`contract-${slug}`), strings: {} });

function ports(packs: Readonly<Record<string, readonly string[]>>, options: { readonly installedStatus?: number; readonly brokenContract?: string } = {}): GloryCatalogPorts & { readonly reads: string[] } {
  const reads: string[] = [];
  const contracts = new Map(Object.entries(packs).map(([slug, collections]) => [ref(`contract-${slug}`).src, { schema: 1, frames: collections.flatMap((collection) => manifest(collection).frames) }]));
  return {
    reads,
    installed: async () => (options.installedStatus === undefined ? { ok: true, data: Object.keys(packs).map(summary) } : { ok: false, status: options.installedStatus, error: 'Not found', code: 'PACK_NOT_FOUND' }),
    detail: async (slug) => (slug in packs ? { ok: true, data: detail(slug) } : { ok: false, status: 404, error: 'Not found', code: 'PACK_NOT_FOUND' }),
    readJson: async (asset) => {
      reads.push(asset.src);
      if (options.brokenContract !== undefined && asset.src === ref(`contract-${options.brokenContract}`).src) return { schema: 99, frames: [] };
      return contracts.get(asset.src) ?? null;
    },
  };
}

describe('le catalogue des packs installés', () => {
  test('chaque pack installé lit son contrat au magasin, par l’adresse du détail ; les cadres sont ceux du schéma partagé', async () => {
    const p = ports({ afrique: ['savane', 'royaumes'], moments: ['moments'] });
    const catalog = await loadGloryCatalog(p);
    expect(catalog.installed).toEqual(new Set(['afrique', 'moments']));
    expect(p.reads).toEqual([ref('contract-afrique').src, ref('contract-moments').src]);
    const afrique = catalog.packs.find((pack) => pack.slug === 'afrique');
    expect(afrique?.atmosphere).toBe('afrique');
    expect(afrique?.collections).toEqual(['savane', 'royaumes']);
    expect(afrique?.frames.length).toBe(manifest('savane').frames.length + manifest('royaumes').frames.length);
    expect(afrique?.byId.get('savane.ambassadeur-1')?.formats.story.stack[0]).toBe('photo');
    expect(catalog.packs.find((pack) => pack.slug === 'moments')?.atmosphere).toBeNull();
  });

  test('un ancien serveur (404 sur /packs) ⇒ catalogue vide, aucune lecture au magasin, aucune erreur', async () => {
    const p = ports({ afrique: ['savane'] }, { installedStatus: 404 });
    expect(await loadGloryCatalog(p)).toEqual(EMPTY_CATALOG);
    expect(p.reads).toEqual([]);
  });

  test('un contrat d’une version inconnue fait tomber SON pack seul ; les autres restent', async () => {
    const p = ports({ afrique: ['savane'], egypte: ['egypte'] }, { brokenContract: 'egypte' });
    const catalog = await loadGloryCatalog(p);
    expect([...catalog.installed]).toEqual(['afrique']);
  });

  test('une atmosphère se déduit des collections : egypte ⇒ egypte, savane ⇒ afrique', async () => {
    const catalog = await loadGloryCatalog(ports({ egypte: ['egypte'] }));
    expect(catalog.packs[0]?.atmosphere).toBe('egypte');
  });
});

describe('le cadre d’une étape, par la loi partagée', () => {
  test('un nouveau rang d’Ambassadeur II sans atmosphère choisie : l’Afrique éternelle, division II de la Savane en tête', async () => {
    const catalog = await loadGloryCatalog(ports({ afrique: ['savane', 'royaumes'] }));
    const pick = pickGloryFrame(catalog, { stepId: 'rank:ambassadeur:2', atmosphere: null, lastChosen: null });
    expect(pick?.pack.slug).toBe('afrique');
    expect(pick?.frame.id).toBe('savane.ambassadeur-2');
    expect(pick?.frame.formats.square).toBeNull();
  });

  test('le dernier choix de la même famille est repris quand il sert encore', async () => {
    const catalog = await loadGloryCatalog(ports({ afrique: ['savane', 'royaumes'] }));
    const pick = pickGloryFrame(catalog, { stepId: 'rank:ambassadeur:2', atmosphere: null, lastChosen: 'royaumes.ambassadeur-2' });
    expect(pick?.frame.id).toBe('royaumes.ambassadeur-2');
  });

  test('une étape sans cadre (le départ, un rang des mythologies à venir) ⇒ null : la carte simple', async () => {
    const catalog = await loadGloryCatalog(ports({ afrique: ['savane', 'royaumes'] }));
    expect(pickGloryFrame(catalog, { stepId: 'start', atmosphere: null, lastChosen: null })).toBeNull();
    expect(pickGloryFrame(catalog, { stepId: 'rank:voix:2', atmosphere: null, lastChosen: null })).toBeNull();
  });

  test('l’atmosphère choisie dont le pack n’est pas installé ne sert jamais ses cadres : la loi retombe sur l’Afrique éternelle', async () => {
    const catalog = await loadGloryCatalog(ports({ afrique: ['savane'] }));
    const pick = pickGloryFrame(catalog, { stepId: 'rank:ambassadeur:1', atmosphere: 'egypte', lastChosen: null });
    expect(pick?.frame.id).toBe('savane.ambassadeur-1');
    expect(pick?.frame.collection).not.toBe('egypte');
  });

  test('un catalogue vide ⇒ null', () => {
    expect(pickGloryFrame(EMPTY_CATALOG, { stepId: 'rank:ambassadeur:1', atmosphere: null, lastChosen: null })).toBeNull();
  });
});
