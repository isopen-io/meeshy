/**
 * Génère les packs d'APPARENCE de la boutique unifiée (#10632, spec § 6) :
 * fonds de conversation, bannières de profil, contours d'avatar et cadres de
 * bannière (#10936).
 *
 *   sources  packages/shared/design/appearance/{wallpapers/designs,banners/designs,avatar-rings/rings,banner-frames/frames}.json
 *            packages/shared/design/appearance/strings/<langue>.json
 *   sorties  services/gateway/assets/packs/<sha16>.{webp,json}      (adressés par contenu)
 *            packages/shared/design/appearance/{wallpapers,banners,avatar-rings,banner-frames}/packs.json   (registres)
 *            packages/shared/design/packs/samples/wallpaper.json    (UN pack payant d'exemple, lu sous PACK_SAMPLES=1)
 *
 * Les couvertures se rasterisent depuis `designToSvg` / `avatarRingSvg` (shared)
 * par sharp : la même référence visuelle que les clients. Les contrats sont des
 * DONNÉES (`AppearancePackContract`) relues par le même Zod que la passerelle.
 * Idempotent : même source ⇒ mêmes octets ⇒ mêmes adresses.
 *
 * Usage : bun scripts/generate-appearance-packs.ts
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { parseAppearancePackContract, type AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import { parseAvatarRingPackContract, type AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import { parseBannerFramePackContract, type BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import { PACK_LANGUAGES } from '@meeshy/shared/types/content-pack';
import { parsePackIndex } from '@meeshy/shared/types/content-pack-index';
import { avatarRingSvg, designToSvg } from '@meeshy/shared/utils/appearance-svg';
import { bannerFrameSvg } from '@meeshy/shared/utils/banner-frame-svg';

const ROOT = resolve(import.meta.dir, '../../..');
const DESIGN = join(ROOT, 'packages/shared/design');
const APPEARANCE = join(DESIGN, 'appearance');
const ASSETS = join(ROOT, 'services/gateway/assets/packs');
const COVER_ACCENT = '#6366F1';

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type Names = Readonly<Record<string, { readonly name: string; readonly description: string }>>;
type SourcePack<T> = {
  readonly slug: string;
  readonly order: number;
  readonly installedByDefault: boolean;
  readonly removable: boolean;
  readonly usage?: unknown;
  readonly designs?: readonly T[];
  readonly rings?: readonly T[];
  readonly frames?: readonly T[];
};

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 1)}\n`, 'utf8');

function store(bytes: Buffer, ext: 'webp' | 'json'): Ref {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const src = `${sha256.slice(0, 16)}.${ext}`;
  writeFileSync(join(ASSETS, src), bytes);
  return { src, bytes: bytes.length, sha256 };
}

const strings = Object.fromEntries(
  PACK_LANGUAGES.map((language) => [
    language,
    readJson<{ packs: Names; designs: Record<string, string>; rings: Record<string, string>; frames: Record<string, string> }>(join(APPEARANCE, `strings/${language}.json`)),
  ]),
);

const webp = (svg: string, width: number, height: number): Promise<Buffer> =>
  sharp(Buffer.from(svg)).resize(width, height).webp({ quality: 82, effort: 6 }).toBuffer();

type Kind = {
  readonly domain: 'wallpaper' | 'banner' | 'avatar-ring' | 'banner-frame';
  readonly source: string;
  readonly out: string;
  readonly itemsKey: 'designs' | 'rings' | 'frames';
  readonly cover: (item: never) => Promise<Buffer>;
};

const wallpaperCover = (design: AppearanceDesign) => webp(designToSvg({ design, scheme: 'light', accent: COVER_ACCENT, width: 270, height: 480 }), 270, 480);
const bannerCover = (design: AppearanceDesign) => webp(designToSvg({ design, scheme: 'light', accent: COVER_ACCENT, width: 480, height: 160 }), 480, 160);
const ringCover = (ring: AvatarRingDesign) => webp(avatarRingSvg({ ring, size: 256 }), 256, 256);
/** Un cadre se montre posé sur un fond neutre : son centre est transparent. */
const frameCover = (frame: BannerFrameDesign) =>
  webp(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160"><rect width="480" height="160" fill="#E8E4DC"/>${bannerFrameSvg({ frame, width: 480, height: 160 })}</svg>`, 480, 160);

const KINDS: readonly Kind[] = [
  { domain: 'wallpaper', source: 'wallpapers/designs.json', out: 'wallpapers/packs.json', itemsKey: 'designs', cover: wallpaperCover as Kind['cover'] },
  { domain: 'banner', source: 'banners/designs.json', out: 'banners/packs.json', itemsKey: 'designs', cover: bannerCover as Kind['cover'] },
  { domain: 'avatar-ring', source: 'avatar-rings/rings.json', out: 'avatar-rings/packs.json', itemsKey: 'rings', cover: ringCover as Kind['cover'] },
  { domain: 'banner-frame', source: 'banner-frames/frames.json', out: 'banner-frames/packs.json', itemsKey: 'frames', cover: frameCover as Kind['cover'] },
];

const contractOf = (domain: Kind['domain'], items: readonly unknown[]) => {
  if (domain === 'avatar-ring') return { domain, rings: items };
  if (domain === 'banner-frame') return { domain, frames: items };
  return { domain, designs: items };
};

/** Le contrat se lit EN ENTIER (#10936) : la passerelle refuse un contrat dont un seul cadre est illisible, le SDK l'écarterait seul. */
const PARSERS: Readonly<Record<Kind['domain'], (contract: unknown) => unknown>> = {
  wallpaper: parseAppearancePackContract,
  banner: parseAppearancePackContract,
  'avatar-ring': parseAvatarRingPackContract,
  'banner-frame': parseBannerFramePackContract,
};

function assertContract(domain: Kind['domain'], contract: unknown, slug: string): void {
  const items = (contract as { readonly rings?: readonly unknown[]; readonly frames?: readonly unknown[]; readonly designs?: readonly unknown[] });
  const parsed = PARSERS[domain](contract) as { readonly rings?: readonly unknown[]; readonly frames?: readonly unknown[]; readonly designs?: readonly unknown[] } | null;
  const count = (value: typeof items | null) => (value?.rings ?? value?.frames ?? value?.designs ?? []).length;
  const ok = parsed !== null && count(parsed) === count(items);
  if (!ok) throw new Error(`Le contrat du pack ${domain}/${slug} ne passe pas son schéma Zod`);
}

const itemKey = (item: unknown): string => (item as { key: string }).key;

/**
 * 2 dès qu'un contour use de ce qu'un client antérieur à #10936 ne lit pas — aucun
 * trait de base (`none`), plus de quatre couleurs. Le SDK écarte ce contour seul.
 */
const contractSchemaOf = (items: readonly unknown[]): number =>
  items.some((item) => {
    const stroke = (item as { readonly stroke?: { readonly style?: string; readonly colors?: readonly string[] } }).stroke;
    return stroke !== undefined && (stroke.style === 'none' || (stroke.colors?.length ?? 0) > 4);
  })
    ? 2
    : 1;

async function buildEntry(kind: Kind, pack: SourcePack<unknown>, over: Record<string, unknown> = {}, names?: Names, itemNames?: (lang: string, key: string) => string) {
  const items = pack[kind.itemsKey] ?? [];
  const contractValue = contractOf(kind.domain, items);
  assertContract(kind.domain, contractValue, pack.slug);
  const contract = store(json(contractValue), 'json');
  const cover = store(await kind.cover(items[0] as never), 'webp');
  const refs = Object.fromEntries(
    PACK_LANGUAGES.map((language) => {
      const table = strings[language][kind.itemsKey];
      const named = Object.fromEntries(items.map((item) => [itemKey(item), itemNames?.(language, itemKey(item)) ?? table[itemKey(item)] ?? itemKey(item)]));
      return [language, store(json(named), 'json')];
    }),
  );
  return {
    slug: pack.slug,
    domain: kind.domain,
    origin: 'builtin',
    version: 1,
    order: pack.order,
    installedByDefault: pack.installedByDefault,
    removable: pack.removable,
    hidden: false,
    contractSchema: contractSchemaOf(items),
    cover,
    preview: null,
    contract,
    strings: refs,
    downloadBytes: { story: contract.bytes, square: null },
    names: names ?? Object.fromEntries(PACK_LANGUAGES.map((language) => [language, strings[language].packs[pack.slug]])),
    ...(pack.usage === undefined ? {} : { usage: pack.usage }),
    ...over,
  };
}

const SAMPLE_NAMES: Names = {
  fr: { name: 'Exemple · Prestige', description: "Pack d'exemple PAYANT du staging : deux fonds à acheter en Meeshes." },
  en: { name: 'Sample · Prestige', description: 'Paid staging sample pack: two wallpapers to buy with Meeshes.' },
  es: { name: 'Ejemplo · Prestigio', description: 'Paquete de ejemplo de pago del entorno de pruebas: dos fondos para comprar con Meeshes.' },
  pt: { name: 'Exemplo · Prestígio', description: 'Pacote de exemplo pago do ambiente de testes: dois fundos para comprar com Meeshes.' },
  de: { name: 'Beispiel · Prestige', description: 'Kostenpflichtiges Beispielpaket der Testumgebung: zwei Hintergründe, mit Meeshes zu kaufen.' },
  it: { name: 'Esempio · Prestigio', description: "Pacchetto di esempio a pagamento dell'ambiente di prova: due sfondi da acquistare con i Meeshes." },
  ar: { name: 'مثال · الفخامة', description: 'حزمة تجريبية مدفوعة لبيئة الاختبار: خلفيتان للشراء بالميشات.' },
};

mkdirSync(ASSETS, { recursive: true });
// Les couches Lottie (#10638) sont adressées par contenu dans les sources : la passerelle les sert telles quelles.
for (const name of readdirSync(join(APPEARANCE, 'lottie'))) copyFileSync(join(APPEARANCE, 'lottie', name), join(ASSETS, name));
mkdirSync(join(DESIGN, 'packs/samples'), { recursive: true });

for (const kind of KINDS) {
  const source = readJson<{ packs: readonly SourcePack<unknown>[] }>(join(APPEARANCE, kind.source));
  const entries = await Promise.all(source.packs.map((pack) => buildEntry(kind, pack)));
  const parsed = parsePackIndex(entries);
  if (parsed.rejected > 0) throw new Error(`${kind.domain} : ${parsed.rejected} entrée(s) refusée(s) par PackIndexEntrySchema`);
  writeFileSync(join(APPEARANCE, kind.out), `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`${kind.domain} : ${entries.length} pack(s) → ${kind.out}`);
}

const wallpapers = readJson<{ packs: readonly SourcePack<{ key: string }>[] }>(join(APPEARANCE, 'wallpapers/designs.json'));
const essentials = wallpapers.packs.find((pack) => pack.slug === 'essentiels');
if (essentials === undefined) throw new Error('Le pack « essentiels » manque aux sources des fonds');
const samplePack: SourcePack<unknown> = {
  slug: 'exemple-prestige',
  order: 1000,
  installedByDefault: false,
  removable: true,
  designs: (essentials.designs ?? []).filter((design) => ['aurore', 'maille'].includes(design.key)),
};
const sample = await buildEntry(KINDS[0], samplePack, { origin: 'official', price: 20 }, SAMPLE_NAMES);
if (parsePackIndex([sample]).rejected > 0) throw new Error("Le pack d'exemple payant est refusé par PackIndexEntrySchema");
writeFileSync(join(DESIGN, 'packs/samples/wallpaper.json'), `${JSON.stringify([sample], null, 2)}\n`);
console.log('exemple payant → packs/samples/wallpaper.json');
