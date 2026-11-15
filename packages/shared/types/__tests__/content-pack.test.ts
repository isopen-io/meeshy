import { describe, expect, it } from 'vitest';
import {
  PACK_LIMITS,
  PACK_SLUG_PATTERN,
  PACK_STATUSES,
  isPackInstalled,
  isPackRemovable,
  isReservedPackSlug,
  packChoiceKey,
  parsePackChoiceKey,
  type PackRegistries,
} from '../content-pack';
import { PackAssetRefSchema, frameUsageOf, packDefaultsOf, parsePackIndex } from '../content-pack-index';
import { DEFAULT_GLORY_ATMOSPHERE, GLORY_ATMOSPHERES, isGloryAtmosphere } from '../glory-atmospheres';
import {
  STICKER_PACK_LIMITS,
  STICKER_PACK_SLUG_PATTERN,
  STICKER_PACK_STATUSES,
  isReservedStickerPackSlug,
  isStickerPackInstalled,
} from '../sticker-pack';
import { canUseFrame } from '../frame-usage';

const sha = (prefix: string): string => prefix.padEnd(64, '0');
const asset = (prefix: string, ext = 'webp') => ({ src: `${prefix}.${ext}`, bytes: 1200, sha256: sha(prefix) });

const entry = (over: Record<string, unknown> = {}) => ({
  slug: 'egypte',
  domain: 'glory-frame',
  origin: 'official',
  version: 1,
  order: 2,
  installedByDefault: false,
  removable: true,
  hidden: false,
  contractSchema: 1,
  cover: asset('a1b2c3d4e5f60718'),
  preview: asset('b1b2c3d4e5f60718'),
  contract: asset('c1b2c3d4e5f60718', 'json'),
  strings: { fr: asset('d1b2c3d4e5f60718', 'json') },
  downloadBytes: { story: 1_800_000, square: null },
  names: { fr: { name: 'Égypte solaire', description: 'Le Nil, l’or et le soleil.' } },
  usage: { kind: 'rank', rank: 'ambassadeur' },
  atmosphere: 'egypte',
  ...over,
});

const REGISTRIES: PackRegistries = {
  sticker: [{ slug: 'mee', installedByDefault: true }],
  'glory-frame': [
    { slug: 'afrique', installedByDefault: true },
    { slug: 'egypte', installedByDefault: false },
  ],
};

describe('la clé de choix d’installation', () => {
  it('garde le slug NU pour un sticker — les lignes existantes ne bougent pas', () => {
    expect(packChoiceKey('sticker', 'mee')).toBe('mee');
    expect(parsePackChoiceKey('mee')).toEqual({ domain: 'sticker', slug: 'mee' });
  });

  it('préfixe le domaine sinon, et se relit', () => {
    expect(packChoiceKey('glory-frame', 'afrique')).toBe('glory-frame.afrique');
    expect(parsePackChoiceKey('glory-frame.afrique')).toEqual({ domain: 'glory-frame', slug: 'afrique' });
    expect(parsePackChoiceKey(packChoiceKey('capture-frame', 'corporate'))).toEqual({ domain: 'capture-frame', slug: 'corporate' });
  });

  it('refuse une clé forgée', () => {
    expect(parsePackChoiceKey('sticker.mee')).toBeNull();
    expect(parsePackChoiceKey('inconnu.afrique')).toBeNull();
    expect(parsePackChoiceKey('glory-frame.A')).toBeNull();
    expect(parsePackChoiceKey('glory-frame.a.b')).toBeNull();
    expect(parsePackChoiceKey('')).toBeNull();
  });

  it('aucun slug de sticker ne contient de point : aucune collision possible', () => {
    expect(STICKER_PACK_SLUG_PATTERN.test('glory-frame.afrique')).toBe(false);
  });
});

describe('installé, réservé, retirable', () => {
  it('le choix explicite prime, sinon le défaut du registre de SON domaine', () => {
    expect(isPackInstalled('glory-frame', 'afrique', undefined, REGISTRIES)).toBe(true);
    expect(isPackInstalled('glory-frame', 'afrique', { installed: false }, REGISTRIES)).toBe(false);
    expect(isPackInstalled('glory-frame', 'egypte', { installed: true }, REGISTRIES)).toBe(true);
    expect(isPackInstalled('capture-frame', 'afrique', undefined, REGISTRIES)).toBe(false);
    expect(isPackInstalled('sticker', 'inconnu', undefined, REGISTRIES)).toBe(false);
  });

  it('réserve PAR domaine : un intégré de cadre ne réserve rien aux stickers', () => {
    expect(isReservedPackSlug('glory-frame', 'afrique', REGISTRIES)).toBe(true);
    expect(isReservedPackSlug('sticker', 'afrique', REGISTRIES)).toBe(false);
    expect(isReservedPackSlug('sticker', 'mee', REGISTRIES)).toBe(true);
    expect(isReservedPackSlug('capture-frame', 'submissions', REGISTRIES)).toBe(true);
  });

  it('le pack de l’atmosphère choisie n’est jamais retirable', () => {
    expect(isPackRemovable({ removable: true, atmosphere: 'egypte' }, { chosenAtmosphere: 'egypte' })).toBe(false);
    expect(isPackRemovable({ removable: true, atmosphere: 'egypte' }, { chosenAtmosphere: 'neon' })).toBe(true);
    expect(isPackRemovable({ removable: true }, { chosenAtmosphere: null })).toBe(true);
    expect(isPackRemovable({ removable: false, atmosphere: 'afrique' }, { chosenAtmosphere: null })).toBe(false);
  });
});

describe('les stickers, premier domaine, à valeurs inchangées', () => {
  it('leurs constantes sont celles du moteur', () => {
    expect(STICKER_PACK_STATUSES).toEqual(PACK_STATUSES);
    expect(STICKER_PACK_SLUG_PATTERN).toBe(PACK_SLUG_PATTERN);
    expect(STICKER_PACK_LIMITS).toMatchObject(PACK_LIMITS);
  });

  it('isStickerPackInstalled et isReservedStickerPackSlug rendent ce qu’ils rendaient', () => {
    expect(['mee', 'meo', 'mee-et-meo', 'tiers'].map((slug) => isStickerPackInstalled(slug, undefined))).toEqual([true, true, true, false]);
    expect(isStickerPackInstalled('mee', { installed: false })).toBe(false);
    expect(['mee', 'shop', 'favorites', 'afrique', 'corporate'].map(isReservedStickerPackSlug)).toEqual([true, true, true, false, false]);
  });
});

describe('les fichiers adressés par contenu', () => {
  it('src porte les 16 premiers caractères du SHA-256', () => {
    expect(PackAssetRefSchema.safeParse(asset('0123456789abcdef')).success).toBe(true);
    expect(PackAssetRefSchema.safeParse({ ...asset('0123456789abcdef'), sha256: sha('ffffffffffffffff') }).success).toBe(false);
    expect(PackAssetRefSchema.safeParse({ ...asset('0123456789abcdef'), src: '../0123456789abcdef.webp' }).success).toBe(false);
    expect(PackAssetRefSchema.safeParse({ ...asset('0123456789abcdef'), src: '0123456789abcdef.exe' }).success).toBe(false);
  });
});

describe('le registre des packs officiels, fail-closed par entrée', () => {
  it('une entrée illisible tombe seule, un slug répété dans le domaine aussi', () => {
    const { entries, rejected } = parsePackIndex([
      entry(),
      entry({ slug: 'neon', atmosphere: 'neon', version: 0 }),
      entry({ slug: 'egypte', order: 9 }),
      entry({ slug: 'afrique', atmosphere: 'afrique', installedByDefault: true, removable: false }),
      'pas une entrée',
    ]);
    expect(entries.map((e) => e.slug)).toEqual(['egypte', 'afrique']);
    expect(rejected).toBe(3);
    expect(parsePackIndex({ pas: 'un tableau' })).toEqual({ entries: [], rejected: 0 });
  });

  it('un pack de cadres porte l’usage de ses cadres ; un usage illisible le fait tomber', () => {
    expect(parsePackIndex([entry({ usage: { kind: 'free', surfaces: [] } })]).entries).toEqual([]);
    expect(parsePackIndex([entry({ domain: 'capture-frame', atmosphere: undefined, usage: undefined })]).entries).toEqual([]);
  });

  it('un pack de GLOIRE dont les cadres ne partagent pas un usage le laisse à chacun d’eux (le contrat le rend obligatoire par cadre)', () => {
    const [afrique] = parsePackIndex([entry({ slug: 'afrique', atmosphere: 'afrique', installedByDefault: true, removable: false, usage: undefined })]).entries;
    expect(afrique?.usage).toBeUndefined();
    expect(frameUsageOf(afrique!)).toBeNull();
  });

  it('une atmosphère hors liste, ou portée par un autre domaine que la gloire, tombe', () => {
    expect(parsePackIndex([entry({ atmosphere: 'atlantide' })]).entries).toEqual([]);
    expect(
      parsePackIndex([entry({ domain: 'capture-frame', usage: { kind: 'free', surfaces: ['photo', 'video'] } })]).entries,
    ).toEqual([]);
  });

  it('un pack de GLOIRE ne déclare jamais un usage libre, un pack de CAPTURE jamais un usage du jeu — pack et collections', () => {
    const capture = (over: Record<string, unknown>) => entry({ domain: 'capture-frame', atmosphere: undefined, ...over });
    expect(parsePackIndex([entry({ usage: { kind: 'free', surfaces: ['call', 'photo', 'video'] } })]).entries).toEqual([]);
    expect(parsePackIndex([entry({ collections: [{ slug: 'libres', usage: { kind: 'free', surfaces: ['photo'] } }] })]).entries).toEqual([]);
    expect(parsePackIndex([capture({ usage: { kind: 'prestige' } })]).entries).toEqual([]);
    expect(
      parsePackIndex([capture({ usage: { kind: 'free', surfaces: ['photo', 'video'] }, collections: [{ slug: 'succes', usage: { kind: 'achievement' } }] })]).entries,
    ).toEqual([]);
    expect(parsePackIndex([capture({ usage: { kind: 'free', surfaces: ['call', 'photo', 'video'] } })]).entries).toHaveLength(1);
    expect(parsePackIndex([entry({ collections: [{ slug: 'prestige', usage: { kind: 'prestige' } }] })]).entries).toHaveLength(1);
  });

  it('un pack non retirable est installé par défaut', () => {
    expect(parsePackIndex([entry({ removable: false })]).entries).toEqual([]);
  });

  it('l’usage d’une collection prime sur celui du pack, et la loi d’usage le lit', () => {
    const [moments] = parsePackIndex([
      entry({
        slug: 'moments',
        atmosphere: undefined,
        installedByDefault: true,
        removable: false,
        usage: { kind: 'moment', family: 'tier' },
        collections: [{ slug: 'flammes', usage: { kind: 'moment', family: 'flame' } }, { slug: 'paliers' }],
      }),
    ]).entries;
    expect(moments).toBeDefined();
    const flame = frameUsageOf(moments!, 'flammes');
    expect(flame).toEqual({ kind: 'moment', family: 'flame' });
    expect(frameUsageOf(moments!, 'paliers')).toEqual({ kind: 'moment', family: 'tier' });
    expect(canUseFrame(flame!, { kind: 'call' })).toBe(false);
    expect(frameUsageOf({ usage: undefined, collections: undefined })).toBeNull();
  });

  it('les défauts d’un registre lu alimentent isPackInstalled', () => {
    const { entries } = parsePackIndex([entry(), entry({ slug: 'afrique', atmosphere: 'afrique', installedByDefault: true, removable: false })]);
    const registries: PackRegistries = { 'glory-frame': packDefaultsOf(entries, 'glory-frame') };
    expect(isPackInstalled('glory-frame', 'afrique', undefined, registries)).toBe(true);
    expect(isPackInstalled('glory-frame', 'egypte', undefined, registries)).toBe(false);
  });
});

describe('les sept atmosphères', () => {
  it('liste fermée, l’Afrique éternelle en premier et par défaut', () => {
    expect(GLORY_ATMOSPHERES).toEqual(['afrique', 'egypte', 'olympe', 'celeste', 'nord', 'abysses', 'neon']);
    expect(DEFAULT_GLORY_ATMOSPHERE).toBe('afrique');
    expect(isGloryAtmosphere('neon')).toBe(true);
    expect(isGloryAtmosphere('atlantide')).toBe(false);
    expect(isGloryAtmosphere(7)).toBe(false);
  });
});
