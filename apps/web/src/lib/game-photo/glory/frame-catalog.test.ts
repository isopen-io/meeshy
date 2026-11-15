import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';

import type { FramePackDetail, FramePackSummary } from '@/lib/api/packs-glory-frame';

import { EMPTY_CATALOG, findGloryFrame, loadGloryCatalog, offerGloryFrames, pickGloryFrame, type GloryCatalogPorts } from './frame-catalog';

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
  previewUrl: null,
  usage: null,
});

const detail = (slug: string): FramePackDetail => ({ ...summary(slug), contractSchema: 1, contract: ref(`contract-${slug}`), strings: {} });

function ports(packs: Readonly<Record<string, readonly string[]>>, options: { readonly installedStatus?: number; readonly brokenContract?: string; readonly language?: 'fr' | 'en'; readonly strings?: Readonly<Record<string, Readonly<Record<string, string>>>> } = {}): GloryCatalogPorts & { readonly reads: string[] } {
  const reads: string[] = [];
  const stringsOf = (slug: string) => Object.fromEntries(Object.keys(options.strings ?? {}).filter((key) => key.startsWith(`${slug}:`)).map((key) => [key.slice(slug.length + 1), ref(key)]));
  const contracts = new Map(Object.entries(packs).map(([slug, collections]) => [ref(`contract-${slug}`).src, { schema: 1, frames: collections.flatMap((collection) => manifest(collection).frames) }]));
  return {
    reads,
    installed: async () => (options.installedStatus === undefined ? { ok: true, data: Object.keys(packs).map(summary) } : { ok: false, status: options.installedStatus, error: 'Not found', code: 'PACK_NOT_FOUND' }),
    ...(options.language === undefined ? {} : { language: options.language }),
    detail: async (slug) => (slug in packs ? { ok: true, data: { ...detail(slug), strings: stringsOf(slug) } } : { ok: false, status: 404, error: 'Not found', code: 'PACK_NOT_FOUND' }),
    readJson: async (asset) => {
      reads.push(asset.src);
      const strings = Object.entries(options.strings ?? {}).find(([key]) => ref(key).src === asset.src);
      if (strings !== undefined) return strings[1];
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

  test('un haut fait se photographie dans SA rareté (LS, #10168) : la rareté servie élit son cadre ; sans rareté, le neutre ; sans le pack, la carte simple', async () => {
    const catalog = await loadGloryCatalog(ports({ afrique: ['savane'], succes: ['succes'] }));
    expect(pickGloryFrame(catalog, { stepId: 'achievement:messages.3', atmosphere: null, lastChosen: null, rarity: 'rare' })?.frame.id).toBe('succes.rare');
    expect(pickGloryFrame(catalog, { stepId: 'achievement:messages.3', atmosphere: null, lastChosen: null })?.frame.id).toBe('succes.neutre');
    expect(offerGloryFrames(catalog, { stepId: 'achievement:messages.3', atmosphere: null, lastChosen: null, rarity: 'epic' }).suggested.map((pick) => pick.frame.id)).toEqual(['succes.epic']);
    expect(pickGloryFrame(await loadGloryCatalog(ports({ afrique: ['savane'] })), { stepId: 'achievement:messages.3', atmosphere: null, lastChosen: null, rarity: 'rare' })).toBeNull();
  });

  test('un catalogue vide ⇒ null', () => {
    expect(pickGloryFrame(EMPTY_CATALOG, { stepId: 'rank:ambassadeur:1', atmosphere: null, lastChosen: null })).toBeNull();
  });
});

describe('l’offre d’une étape, par la loi partagée (#10164)', () => {
  test('toutes les tuiles que la loi propose, la présélection en tête : la division d’abord, collection par collection ; aucun cadre d’un autre rang', async () => {
    const catalog = await loadGloryCatalog(ports({ afrique: ['savane', 'royaumes'] }));
    const offer = offerGloryFrames(catalog, { stepId: 'rank:ambassadeur:2', atmosphere: null, lastChosen: null });
    const ids = offer.suggested.map((pick) => pick.frame.id);
    expect(ids.slice(0, 2)).toEqual(['savane.ambassadeur-2', 'royaumes.ambassadeur-2']);
    expect(ids.every((id) => id.includes('ambassadeur'))).toBe(true);
    expect(ids.length).toBeGreaterThan(2);
    expect(offer.preselected?.frame.id).toBe('savane.ambassadeur-2');
    expect(offer.suggested.every((pick) => pick.pack.slug === 'afrique')).toBe(true);
  });

  test('une étape sans cadre ⇒ aucune tuile ; un cadre se retrouve par sa référence, ou pas du tout', async () => {
    const catalog = await loadGloryCatalog(ports({ afrique: ['savane'] }));
    expect(offerGloryFrames(catalog, { stepId: 'start', atmosphere: null, lastChosen: null })).toEqual({ suggested: [], preselected: null });
    expect(findGloryFrame(catalog, { pack: 'afrique', frameId: 'savane.ambassadeur-1' })?.frame.id).toBe('savane.ambassadeur-1');
    expect(findGloryFrame(catalog, { pack: 'afrique', frameId: 'savane.nulle-part' })).toBeNull();
    expect(findGloryFrame(catalog, { pack: 'olympe', frameId: 'savane.ambassadeur-1' })).toBeNull();
  });

  test('les chaînes du pack se lisent dans la langue demandée, le français à défaut, rien quand le pack n’en sert pas', async () => {
    const strings = { 'afrique:fr': { 'savane.ambassadeur-1.name': 'Acacia' }, 'afrique:en': { 'savane.ambassadeur-1.name': 'Acacia tree' } };
    const english = await loadGloryCatalog(ports({ afrique: ['savane'] }, { language: 'en', strings }));
    expect(english.packs[0]?.strings['savane.ambassadeur-1.name']).toBe('Acacia tree');
    const fallback = await loadGloryCatalog(ports({ afrique: ['savane'] }, { language: 'en', strings: { 'afrique:fr': strings['afrique:fr'] } }));
    expect(fallback.packs[0]?.strings['savane.ambassadeur-1.name']).toBe('Acacia');
    const none = await loadGloryCatalog(ports({ afrique: ['savane'] }, { language: 'en' }));
    expect(none.packs[0]?.strings).toEqual({});
  });
});
