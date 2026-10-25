/**
 * Le domaine `sticker` du moteur des packs (#9141, #10148) : ses intégrés
 * (Mee, Meo, Mee & Meo — dessinés par le client, servis sans image), son
 * magasin communautaire (la table `StickerPack`) et sa projection — celle que
 * servent les clients publiés, identique à l'octet
 * (`__tests__/unit/routes/sticker-packs-frozen-responses.test.ts`).
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import {
  BUILTIN_STICKER_PACKS,
  STICKER_KINDS,
  STICKER_PACK_AUTHOR_MEESHY,
  type StickerKind,
  type StickerPackDetail,
  type StickerPackItem,
  type StickerPackStatus,
  type StickerPackSummary,
  type StickerTextZone,
} from '@meeshy/shared/types/sticker-pack';
import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import { stickerPackAssetRef } from '@meeshy/shared/types/sticker-pack-asset';
import type { CommunityPackStore, PackDomainSpec, PackViewer, RegistryPack } from './PackCatalog';

export type StickerItemRow = {
  readonly key: string;
  readonly title: string;
  readonly emoji: string;
  readonly kind: string;
  readonly mimeType: string;
  readonly filePath: string;
  /** Absente sur un fichier proposé avant #10188 et pas encore rattrapé : il n'est servi que par `fileUrl`. */
  readonly sha256?: string | null;
  readonly sizeBytes?: number;
  readonly width: number;
  readonly height: number;
  readonly zones: Prisma.JsonValue | null;
  readonly position: number;
};

export type StickerPackRow = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly submitterId: string;
  readonly status: string;
  readonly reviewNote: string | null;
  readonly installCount: number;
  readonly items: readonly StickerItemRow[];
};

export const STICKER_PACK_INCLUDE = { items: { orderBy: { position: 'asc' } } } as const;

const KINDS: ReadonlySet<string> = new Set(STICKER_KINDS);

const asKind = (value: string): StickerKind => (KINDS.has(value) ? (value as StickerKind) : 'static');

const asZones = (value: Prisma.JsonValue | null): readonly StickerTextZone[] =>
  Array.isArray(value) ? (value as unknown as readonly StickerTextZone[]) : [];

const kindsOf = (items: readonly { readonly kind: string }[]): readonly StickerKind[] =>
  STICKER_KINDS.filter((kind) => items.some((item) => item.kind === kind));

/**
 * L'adresse du fichier dans le magasin `/pack-assets` (#10188), quand son empreinte est gravée ET que le pack est
 * publié : `/pack-assets` ne sert que les packs `approved`, une adresse annoncée avant la modération serait une image
 * cassée chez le premier client qui la préfère à `fileUrl`.
 */
const assetOf = (row: StickerItemRow, status: string): PackAssetRef | null =>
  status === 'approved' ? stickerPackAssetRef({ sha256: row.sha256, mimeType: row.mimeType, sizeBytes: row.sizeBytes ?? -1 }) : null;

function toItem(row: StickerItemRow, status: string): StickerPackItem {
  const asset = assetOf(row, status);
  return {
    key: row.key,
    title: row.title,
    emoji: row.emoji,
    kind: asKind(row.kind),
    mimeType: row.mimeType,
    fileUrl: row.filePath,
    width: row.width,
    height: row.height,
    zones: asZones(row.zones),
    ...(asset === null ? {} : { asset }),
  };
}

/** Un pack proposé par un tiers. Le mot du modérateur n'est servi qu'à son auteur et aux modérateurs. */
export function stickerPackDetail(row: StickerPackRow, installed: boolean, viewer?: PackViewer): StickerPackDetail {
  const cover = row.items[0] === undefined ? null : assetOf(row.items[0], row.status);
  const ownView = viewer !== undefined && (viewer.userId === row.submitterId || viewer.canModerate);
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    author: row.author,
    builtin: false,
    status: row.status as StickerPackStatus,
    itemCount: row.items.length,
    kinds: kindsOf(row.items),
    coverUrl: row.items[0]?.filePath ?? null,
    installed,
    installCount: row.installCount,
    items: row.items.map((item) => toItem(item, row.status)),
    ...(cover === null ? {} : { cover }),
    ...(ownView ? { reviewNote: row.reviewNote } : {}),
  };
}

export const stickerPackSummary = ({ items: _items, reviewNote: _note, ...summary }: StickerPackDetail): StickerPackSummary => summary;

export const isStickerPackVisible = (row: Pick<StickerPackRow, 'status' | 'submitterId'>, viewer: PackViewer): boolean =>
  row.status === 'approved' || row.submitterId === viewer.userId || viewer.canModerate;

const STICKER_REGISTRY: readonly RegistryPack<StickerPackDetail>[] = BUILTIN_STICKER_PACKS.map((pack) => ({
  slug: pack.slug,
  installedByDefault: pack.installedByDefault,
  removable: false,
  hidden: false,
  project: (installed: boolean): StickerPackDetail => ({
    slug: pack.slug,
    name: pack.name,
    description: pack.description,
    author: STICKER_PACK_AUTHOR_MEESHY,
    builtin: true,
    status: 'approved',
    itemCount: 0,
    kinds: pack.kinds,
    coverUrl: null,
    installed,
    installCount: 0,
    items: [],
  }),
}));

/** Le magasin communautaire des stickers : la table `StickerPack`, ses packs publiés du plus installé au moins installé. */
export function prismaStickerPackStore(prisma: PrismaClient): CommunityPackStore<StickerPackDetail> {
  return {
    async catalogue(installedOf) {
      const rows = await prisma.stickerPack.findMany({ where: { status: 'approved' }, include: STICKER_PACK_INCLUDE, orderBy: { installCount: 'desc' } });
      return rows.map((row) => stickerPackDetail(row, installedOf(row.slug)));
    },
    async installed(slugs) {
      const rows = await prisma.stickerPack.findMany({ where: { slug: { in: [...slugs] }, status: 'approved' }, include: STICKER_PACK_INCLUDE });
      const order = new Map(slugs.map((slug, index) => [slug, index]));
      return [...rows].sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0)).map((row) => stickerPackDetail(row, true));
    },
    async detail(slug, viewer, installedOf) {
      const row = await prisma.stickerPack.findUnique({ where: { slug }, include: STICKER_PACK_INCLUDE });
      if (row === null || !isStickerPackVisible(row, viewer)) return null;
      return stickerPackDetail(row, installedOf(slug), viewer);
    },
    async installable(slug) {
      const row = await prisma.stickerPack.findUnique({ where: { slug }, include: STICKER_PACK_INCLUDE });
      if (row === null || row.status !== 'approved') return null;
      return { id: row.id, installCount: row.installCount, project: (installed, installCount) => stickerPackDetail({ ...row, installCount }, installed) };
    },
    async addInstalls(id, delta) {
      const row = await prisma.stickerPack.update({ where: { id }, data: { installCount: { increment: delta } } });
      return row.installCount;
    },
  };
}

/** Le domaine `sticker` : intégrés INCLUS (non retirables, #10738), magasin communautaire, aucune garde de retrait. */
export function stickerPackSpec(prisma: PrismaClient): PackDomainSpec<StickerPackSummary, StickerPackDetail> {
  return {
    domain: 'sticker',
    registry: STICKER_REGISTRY,
    community: prismaStickerPackStore(prisma),
    removalGuard: null,
    toSummary: stickerPackSummary,
  };
}
