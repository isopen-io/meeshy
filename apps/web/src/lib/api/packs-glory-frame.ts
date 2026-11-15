import * as z from 'zod/mini';

import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';
import { PackAssetRefSchema } from '@meeshy/shared/types/content-pack-index';
import { PACK_LANGUAGES, PACK_ORIGINS, PACK_STATUSES } from '@meeshy/shared/types/content-pack';
import type { PackAssetRef, PackLanguage, PackSummary } from '@meeshy/shared/types/content-pack';
import { parseFrameUsage } from '@meeshy/shared/types/frame-usage';
import { servablePackPreview } from '@meeshy/shared/types/glory-frame-atlas';
import type { GloryFrameUsage } from '@meeshy/shared/types/glory-frame-pack';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import { loadCatalogueOf, loadDetailOf, loadInstalledOf, setInstalledOf, type PackDeps, type PackPort } from './packs';

/**
 * **LES PACKS DE CADRES DE GLOIRE** (#10149, LP1) — le domaine `glory-frame`
 * du port générique (`packs.ts`) : `/packs/glory-frame`, ses résumés (poids,
 * noms par langue, usage des cadres) et son détail (contrat et chaînes
 * adressés par contenu, servis par `/pack-assets`). Un ANCIEN serveur répond
 * 404 : boutique vide, sans erreur.
 */

export type FramePackSummary = PackSummary & {
  /** L'atlas des vignettes (#10275) à son adresse sur la passerelle : le pack se montre sans s'installer. `null` sans atlas servable. */
  readonly previewUrl: string | null;
  readonly usage: GloryFrameUsage | null;
};

export type FramePackDetail = FramePackSummary & {
  readonly contractSchema: number;
  readonly contract: PackAssetRef;
  readonly strings: { readonly [L in PackLanguage]?: PackAssetRef };
};

const NameSchema = z.object({ name: z.string(), description: z.string() });

const WireFrameSummary = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  builtin: z.optional(z.boolean()),
  status: z.optional(z.enum(PACK_STATUSES)),
  itemCount: z.optional(z.number()),
  coverUrl: z.optional(z.nullable(z.string())),
  installed: z.boolean(),
  installCount: z.optional(z.number()),
  price: z.optional(z.nullable(z.number())),
  owned: z.optional(z.boolean()),
  origin: z.optional(z.enum(PACK_ORIGINS)),
  version: z.optional(z.number()),
  downloadBytes: z.optional(z.nullable(z.object({ story: z.number(), square: z.nullable(z.number()) }))),
  removable: z.optional(z.boolean()),
  names: z.optional(z.record(z.string(), z.unknown())),
  preview: z.optional(z.unknown()),
  previewUrl: z.optional(z.nullable(z.string())),
  usage: z.optional(z.unknown()),
});

const isPackLanguage = (value: string): value is PackLanguage => (PACK_LANGUAGES as readonly string[]).includes(value);

const namesOf = (raw: Readonly<Record<string, unknown>> | undefined): FramePackSummary['names'] =>
  Object.fromEntries(
    Object.entries(raw ?? {}).flatMap(([language, value]) => {
      const parsed = NameSchema.safeParse(value);
      return isPackLanguage(language) && parsed.success ? [[language, parsed.data]] : [];
    }),
  );

const refOrNull = (raw: unknown): PackAssetRef | null => {
  const parsed = PackAssetRefSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

/** Un cadre de gloire n'est jamais libre : un usage libre ou illisible ne se montre pas. */
const gloryUsageOf = (raw: unknown): GloryFrameUsage | null => {
  const usage = parseFrameUsage(raw);
  return usage === null || usage.kind === 'free' ? null : usage;
};

export function decodeFramePackSummary(raw: unknown): FramePackSummary | null {
  const parsed = WireFrameSummary.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const preview = servablePackPreview(refOrNull(wire.preview));
  return {
    slug: wire.slug,
    name: wire.name,
    description: wire.description,
    author: wire.author,
    builtin: wire.builtin ?? false,
    status: wire.status ?? 'approved',
    itemCount: wire.itemCount ?? 0,
    coverUrl: wire.coverUrl ?? null,
    installed: wire.installed,
    installCount: wire.installCount ?? 0,
    ...(wire.price === undefined || wire.price === null ? {} : { price: wire.price, owned: wire.owned ?? false }),
    domain: 'glory-frame',
    origin: wire.origin ?? 'official',
    version: wire.version ?? 1,
    downloadBytes: wire.downloadBytes ?? null,
    removable: wire.removable ?? true,
    names: namesOf(wire.names),
    preview,
    previewUrl: preview === null ? null : (wire.previewUrl ?? null),
    usage: gloryUsageOf(wire.usage),
  };
}

const WireFrameDetailExtra = z.object({
  contractSchema: z.optional(z.number()),
  contract: z.unknown(),
  strings: z.optional(z.record(z.string(), z.unknown())),
});

/** Sans contrat adressé par contenu, un pack ne se télécharge pas : il tombe. Une langue illisible tombe seule. */
export function decodeFramePackDetail(raw: unknown): FramePackDetail | null {
  const summary = decodeFramePackSummary(raw);
  const extra = WireFrameDetailExtra.safeParse(raw);
  if (summary === null || !extra.success) return null;
  const contract = refOrNull(extra.data.contract);
  if (contract === null) return null;
  const strings = Object.fromEntries(
    Object.entries(extra.data.strings ?? {}).flatMap(([language, value]) => {
      const ref = refOrNull(value);
      return isPackLanguage(language) && ref !== null ? [[language, ref]] : [];
    }),
  );
  return { ...summary, contractSchema: extra.data.contractSchema ?? 1, contract, strings };
}

export const gloryFramePackPort: PackPort<FramePackSummary, FramePackSummary, FramePackDetail> = {
  catalogue: packsEndpoints.gloryFrame,
  installed: packsEndpoints.gloryFrameInstalled,
  bySlug: packsEndpoints.gloryFrameBySlug,
  install: packsEndpoints.gloryFrameBySlugInstall,
  decodeSummary: decodeFramePackSummary,
  decodeInstalled: decodeFramePackSummary,
  decodeDetail: decodeFramePackDetail,
  absentMeansEmpty: true,
};

/** La source de démonstration ne fabrique aucun pack de cadres : rien de fictif. */
const isFixtures = (deps: ConversationsDeps): boolean => __FIXTURES__ && deps.source === 'fixtures';
const NOT_FOUND = { ok: false, status: 404, error: 'Not found', code: 'PACK_NOT_FOUND' } as const;

export const loadFramePackCatalogue = (deps: PackDeps): Promise<ApiResult<readonly FramePackSummary[]>> =>
  isFixtures(deps) ? Promise.resolve({ ok: true, data: [] }) : loadCatalogueOf(gloryFramePackPort, deps);

export const loadInstalledFramePacks = (deps: PackDeps): Promise<ApiResult<readonly FramePackSummary[]>> =>
  isFixtures(deps) ? Promise.resolve({ ok: true, data: [] }) : loadInstalledOf(gloryFramePackPort, deps);

export const loadFramePack = (deps: PackDeps, slug: string): Promise<ApiResult<FramePackDetail>> =>
  isFixtures(deps) ? Promise.resolve(NOT_FOUND) : loadDetailOf(gloryFramePackPort, deps, slug);

export const setFramePackInstalled = (deps: ConversationsDeps, slug: string, installed: boolean): Promise<ApiResult<FramePackSummary>> =>
  isFixtures(deps) ? Promise.resolve(NOT_FOUND) : setInstalledOf(gloryFramePackPort, deps, slug, installed);
