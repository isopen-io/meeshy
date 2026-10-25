import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_LANGUAGES } from '../types/content-pack';
import { parsePackIndex, type PackIndexEntry } from '../types/content-pack-index';
import { gloryFrameAssets, parseGloryFrameContract, type GloryFrame, type GloryFrameCollection } from '../types/glory-frames';
import { parseGloryFramePackContract } from '../types/glory-frame-pack';
import { GLORY_ATMOSPHERES } from '../types/glory-atmospheres';
import { flameForm } from '../utils/game/flame';
import {
  PACK_ASSETS_DIR,
  REGISTRY_FILE,
  REPO_ROOT,
  RETAINED_FILE,
  SAMPLE_REGISTRY_FILE,
  buildGloryFramePacks,
  readGloryFrameSources,
  type GloryFrameSources,
  type RegistryEntry,
} from '../scripts/generate-glory-frames';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const sources = readGloryFrameSources();
const generated = buildGloryFramePacks(sources);
const APPEARANCE_REGISTRY_FILES = [
  'packages/shared/design/appearance/wallpapers/packs.json',
  'packages/shared/design/appearance/banners/packs.json',
  'packages/shared/design/appearance/avatar-rings/packs.json',
  'packages/shared/design/appearance/banner-frames/packs.json',
  'packages/shared/design/packs/samples/wallpaper.json',
].map((file) => join(REPO_ROOT, file));

/** Chaque `src` d'une référence de fichier du magasin, à n'importe quelle profondeur. */
const referencedSources = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(referencedSources);
  if (typeof node !== 'object' || node === null) return [];
  const record = node as Record<string, unknown>;
  const own = typeof record['src'] === 'string' ? [record['src'] as string] : [];
  return own.concat(Object.values(record).flatMap(referencedSources));
};

const versioned = readJson(REGISTRY_FILE) as readonly RegistryEntry[];
const { entries, rejected } = parsePackIndex(versioned);
const collections = [...sources.collections.values()];
const frames: readonly GloryFrame[] = collections.flatMap((collection) => collection.frames);
const gaps = readJson(join(REPO_ROOT, 'packages/shared/design/glory-frames/known-gaps.json')) as {
  readonly selfieDefault: { readonly frames: readonly string[] };
  readonly missingAfriqueMotif: { readonly collections: readonly string[] };
  readonly lowContrast: { readonly slots: readonly string[] };
  readonly missingLanguages: { readonly languages: readonly string[] };
};

const contractOf = (entry: PackIndexEntry): readonly GloryFrame[] => parseGloryFrameContract(readJson(join(PACK_ASSETS_DIR, entry.contract.src)))?.contract.frames ?? [];

describe('le registre des packs de cadres de gloire est FRAIS (generate:glory-frames)', () => {
  it('régénéré en mémoire, il égale le registre versionné, champs calculés compris', () => {
    expect(generated.registry).toEqual(versioned);
  });

  it('chaque contrat et chaque fichier de chaînes régénéré égale, à l’octet, celui du magasin', () => {
    for (const [src, text] of generated.files) expect({ src, text: readFileSync(join(PACK_ASSETS_DIR, src), 'utf8') }).toEqual({ src, text });
  });

  it('les fichiers retenus égalent ceux que la régénération retient', () => {
    expect(generated.retained).toEqual(readJson(RETAINED_FILE));
  });

  it('chaque entrée se lit, sans refus, et chaque contrat se lit entier', () => {
    expect(rejected).toBe(0);
    expect(entries.map((entry) => entry.slug)).toEqual(versioned.map((entry) => entry.slug));
    for (const entry of entries) {
      const parsed = parseGloryFrameContract(readJson(join(PACK_ASSETS_DIR, entry.contract.src)));
      expect({ slug: entry.slug, rejected: parsed?.rejected }).toEqual({ slug: entry.slug, rejected: 0 });
      expect(parseGloryFramePackContract(readJson(join(PACK_ASSETS_DIR, entry.contract.src)))?.rejected).toBe(0);
    }
  });
});

describe('chaque fichier déclaré est servi, octets et empreinte égaux', () => {
  const declared = entries.flatMap((entry) => [entry.cover, entry.contract, ...Object.values(entry.strings).flatMap((ref) => (ref === undefined ? [] : [ref])), ...contractOf(entry).flatMap(gloryFrameAssets)]);

  it('existe dans le magasin, à la taille et au SHA-256 déclarés', () => {
    const wrong = [...new Map(declared.map((ref) => [ref.src, ref])).values()].filter((ref) => {
      const path = join(PACK_ASSETS_DIR, ref.src);
      if (!existsSync(path)) return true;
      const bytes = readFileSync(path);
      return bytes.length !== ref.bytes || digest(bytes) !== ref.sha256;
    });
    expect(wrong.map((ref) => ref.src)).toEqual([]);
  });

  it('aucun fichier du magasin n’est orphelin : chacun est engagé par un registre courant, celui des exemples ou retained.json', () => {
    const samples = parsePackIndex(readJson(SAMPLE_REGISTRY_FILE)).entries;
    const sampleFiles = samples.flatMap((entry) => {
      const contract = parseGloryFramePackContract(readJson(join(PACK_ASSETS_DIR, entry.contract.src)));
      return [entry.cover, entry.contract, ...Object.values(entry.strings).flatMap((ref) => (ref === undefined ? [] : [ref])), ...(contract?.contract.frames.map((frame) => frame.thumb) ?? [])];
    });
    const retained = Object.values(readJson(RETAINED_FILE) as Record<string, readonly string[]>).flat();
    // Le magasin est PARTAGÉ : les registres d'apparence (#10632 — fonds, bannières, contours, et le pack
    // d'exemple des fonds) y publient leurs couvertures, contrats et libellés. Leurs fichiers sont engagés.
    const appearanceFiles = APPEARANCE_REGISTRY_FILES.flatMap((file) => {
      const registryRefs = referencedSources(readJson(file));
      const contractRefs = registryRefs
        .filter((src) => src.endsWith('.json') && existsSync(join(PACK_ASSETS_DIR, src)))
        .flatMap((src) => referencedSources(readJson(join(PACK_ASSETS_DIR, src))));
      return [...registryRefs, ...contractRefs];
    });
    const engaged = new Set([...declared, ...sampleFiles].map((ref) => ref.src).concat(retained, appearanceFiles));
    expect(readdirSync(PACK_ASSETS_DIR).filter((file) => !engaged.has(file))).toEqual([]);
  });

  it('downloadBytes est le poids, mesuré, de tout ce que le pack télécharge', () => {
    for (const entry of entries) {
      const refs = [entry.cover, entry.contract, ...Object.values(entry.strings).flatMap((ref) => (ref === undefined ? [] : [ref])), ...contractOf(entry).flatMap(gloryFrameAssets)];
      const bytes = [...new Map(refs.map((ref) => [ref.src, ref.bytes])).values()].reduce((sum, value) => sum + value, 0);
      expect({ slug: entry.slug, bytes: entry.downloadBytes.story }).toEqual({ slug: entry.slug, bytes });
    }
  });
});

describe('les packs (§ 5.10.5, PP1, PP2)', () => {
  it('chaque collection appartient à EXACTEMENT un pack, et chaque collection versionnée à un pack', () => {
    const owners = entries.flatMap((entry) => (entry.collections ?? []).map((collection) => collection.slug));
    expect(new Set(owners).size).toBe(owners.length);
    const files = readdirSync(join(REPO_ROOT, 'packages/shared/design/glory-frames')).filter((file) => file.endsWith('.json') && !['packs.json', 'known-gaps.json', 'decor-texts.json'].includes(file));
    expect(files.map((file) => file.slice(0, -5)).sort()).toEqual([...owners].sort());
  });

  it('l’Afrique éternelle est UN pack de deux collections, Savane puis Royaumes, installé par défaut et non retirable', () => {
    const afrique = entries.find((entry) => entry.slug === 'afrique');
    expect(afrique).toMatchObject({ atmosphere: 'afrique', installedByDefault: true, removable: false, collections: [{ slug: 'savane' }, { slug: 'royaumes' }] });
  });

  it('les sept atmosphères ont chacune leur pack ; les moments, le trésor et les hauts faits sont installés par défaut, non retirables', () => {
    expect(entries.flatMap((entry) => (entry.atmosphere === undefined ? [] : [entry.atmosphere]))).toEqual([...GLORY_ATMOSPHERES]);
    for (const slug of ['moments', 'tresor', 'succes']) expect(entries.find((entry) => entry.slug === slug)).toMatchObject({ installedByDefault: true, removable: false });
    expect(entries.filter((entry) => entry.atmosphere !== undefined && entry.atmosphere !== 'afrique').every((entry) => entry.removable && !entry.installedByDefault)).toBe(true);
  });

  it('le pack des hauts faits (LS, #10168, PP9) est UNIQUE : cinq raretés et un neutre, tous d’usage `achievement`, sans atmosphère, sans cadre de rang ni libre', () => {
    const succes = entries.find((entry) => entry.slug === 'succes');
    expect(succes).toMatchObject({ collections: [{ slug: 'succes' }], hidden: false });
    expect(succes?.atmosphere).toBeUndefined();
    const frames = succes === undefined ? [] : contractOf(succes);
    expect(frames.map((frame) => frame.id).sort()).toEqual(['succes.common', 'succes.epic', 'succes.legendary', 'succes.mythic', 'succes.neutre', 'succes.rare']);
    expect(frames.every((frame) => frame.usage.kind === 'achievement' && frame.appliesTo.family === 'achievement')).toBe(true);
    expect(frames.find((frame) => frame.id === 'succes.neutre')?.usage).toEqual({ kind: 'achievement' });
    expect(entries.filter((entry) => contractOf(entry).some((frame) => frame.usage.kind === 'achievement')).map((entry) => entry.slug)).toEqual(['succes']);
  });

  it('un identifiant de cadre est unique dans tout le registre', () => {
    const ids = entries.flatMap((entry) => contractOf(entry).map((frame) => frame.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('la version d’un pack suit l’empreinte de l’ENSEMBLE de ses références, et ne descend jamais', () => {
  const tweaked = (over: Partial<GloryFrameSources>): GloryFrameSources => ({ ...sources, ...over });
  const savane = sources.collections.get('savane') as GloryFrameCollection;
  const french = sources.strings.get('savane')?.fr ?? {};

  it('inchangée quand rien ne change', () => {
    expect(buildGloryFramePacks(tweaked({ registry: versioned })).registry.map((entry) => entry.version)).toEqual(versioned.map((entry) => entry.version));
  });

  it('monte de un quand une chaîne change, sans qu’aucun contrat ne bouge, et retient les fichiers de la version quittée', () => {
    const strings = new Map(sources.strings).set('savane', { fr: { ...french, [savane.frames[0]?.i18n.name ?? 'absent']: 'Un autre nom' } });
    const next = buildGloryFramePacks(tweaked({ registry: versioned, strings }));
    const before = versioned.find((entry) => entry.slug === 'afrique');
    const after = next.registry.find((entry) => entry.slug === 'afrique');
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    expect(after?.contract).toEqual(before?.contract);
    expect(next.retained[`glory-frame/afrique@${before?.version}`]).toContain(before?.strings?.fr?.src);
    expect(next.registry.find((entry) => entry.slug === 'egypte')?.version).toBe(versioned.find((entry) => entry.slug === 'egypte')?.version);
  });

  it('monte quand une langue s’ajoute (L16)', () => {
    const strings = new Map(sources.strings).set('savane', { fr: french, en: french }).set('royaumes', { ...sources.strings.get('royaumes'), en: sources.strings.get('royaumes')?.fr ?? {} });
    const after = buildGloryFramePacks(tweaked({ registry: versioned, strings })).registry.find((entry) => entry.slug === 'afrique');
    expect(after?.version).toBe((versioned.find((entry) => entry.slug === 'afrique')?.version ?? 0) + 1);
  });

  it('jamais plus basse que la version versionnée', () => {
    const ahead = versioned.map((entry) => (entry.slug === 'neon' ? { ...entry, version: 7 } : entry));
    expect(buildGloryFramePacks(tweaked({ registry: ahead })).registry.find((entry) => entry.slug === 'neon')?.version).toBe(7);
  });
});

describe('les gardes de données des cadres (§ 7, L3) — cliquets de known-gaps.json', () => {
  it('chaque pose de Mee et Meo appartient à la liste FERMÉE embarquée par iOS, jamais un sticker de tiers', () => {
    const index = readFileSync(join(REPO_ROOT, 'packages/MeeshySDK/Sources/MeeshyUI/Story/MeeStickerCatalog+Index.swift'), 'utf8');
    const embedded = new Set([...index.matchAll(/MeeSticker\(id: "([a-z0-9-]+)"/g)].map((match) => match[1]));
    const poses = frames.flatMap((frame) => Object.values(frame.formats.story.birds.layouts).flatMap((layout) => Object.values(layout ?? {}).map((anchor) => anchor.sticker)));
    expect(poses.filter((pose) => !embedded.has(pose))).toEqual([]);
  });

  it('la pose par défaut n’est jamais selfie (cliquet #10153)', () => {
    expect(frames.filter((frame) => frame.formats.story.birds.default === 'selfie').map((frame) => frame.id)).toEqual(gaps.selfieDefault.frames);
  });

  it('un peu d’Afrique dans chaque atmosphère (cliquet #10253)', () => {
    const missing = collections.filter((collection) => collection.atmosphere !== null && collection.atmosphere !== 'afrique' && !collection.frames.some((frame) => frame.motifs.includes('afrique')));
    expect(missing.map((collection) => collection.collection)).toEqual(gaps.missingAfriqueMotif.collections);
  });

  it('chaque texte tient son contraste minimal (cliquet #10265)', () => {
    const low = frames.flatMap((frame) => Object.entries(frame.formats.story.text).filter(([, slot]) => slot.contrast < (slot.font.size > 24 ? 3 : 4.5)).map(([key]) => `${frame.id}#${key}`));
    expect(low).toEqual(gaps.lowContrast.slots);
  });

  it('chaque texte tient dans l’image', () => {
    const outside = frames.flatMap((frame) => {
      const [width, height] = frame.formats.story.size;
      return Object.entries(frame.formats.story.text)
        .filter(([, { bbox: [x, y, w, h] }]) => x < 0 || y < 0 || x + w > width || y + h > height)
        .map(([key]) => `${frame.id}#${key}`);
    });
    expect(outside).toEqual([]);
  });

  it('les chaînes de chaque pack existent dans les sept langues (cliquet #10172, que L16 vide)', () => {
    for (const entry of entries) {
      const missing = PACK_LANGUAGES.filter((language) => entry.strings[language] === undefined);
      expect({ slug: entry.slug, missing }).toEqual({ slug: entry.slug, missing: gaps.missingLanguages.languages });
    }
  });

  it('chaque cadre est nommé et raconté en français', () => {
    for (const entry of entries) {
      const ref = entry.strings.fr;
      const table = ref === undefined ? {} : (readJson(join(PACK_ASSETS_DIR, ref.src)) as Record<string, string>);
      const unnamed = contractOf(entry).filter((frame) => table[frame.i18n.name] === undefined || (frame.i18n.story !== undefined && table[frame.i18n.story] === undefined));
      expect(unnamed.map((frame) => frame.id)).toEqual([]);
    }
  });

  it('D17 : les étiquettes de Flamme des manifestes sont celles de la loi (7 = flamme, 30 = brasier, 100 = astre, 365 = soleil)', () => {
    const manifest = readJson(join(REPO_ROOT, 'docs/product/cadres-de-gloire/manifests/moments.json')) as readonly { readonly file: string; readonly option: string }[];
    const flames = manifest.filter((entry) => entry.file.startsWith('moments-flamme-'));
    expect(flames).toHaveLength(4);
    for (const entry of flames) {
      const days = Number(/moments-flamme-(\d+)\.jpg/.exec(entry.file)?.[1]);
      expect({ file: entry.file, word: entry.option.split('·').pop()?.trim() }).toEqual({ file: entry.file, word: flameForm(days) });
    }
  });
});
