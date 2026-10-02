import * as z from 'zod/mini';

import {
  BUILTIN_STICKER_PACKS,
  STICKER_KINDS,
  STICKER_PACK_AUTHOR_MEESHY,
  STICKER_PACK_STATUSES,
  STICKER_TEXT_ALIGNS,
  STICKER_TEXT_WEIGHTS,
  type StickerPackDetail,
  type StickerPackManifest,
  type StickerPackSummary,
} from '@meeshy/shared/types/sticker-pack';
import * as stickerPacksEndpoints from '@meeshy/shared/api/endpoints/sticker-packs';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * **LE PORT DES PACKS DE STICKERS** (#9141) — `stickerPacks`
 * (`services/gateway/src/routes/sticker-packs.ts`). Les formes servies sont
 * celles de `@meeshy/shared/types/sticker-pack` ; ce port les décode
 * (`zod/mini`) et n'en invente aucune seconde.
 *
 * Les packs INSTALLÉS se lisent cache d'abord : tant que le réseau n'a pas
 * répondu, la feuille montre les packs intégrés installés par défaut
 * (`DEFAULT_INSTALLED_PACKS`) — jamais une feuille vide qui attend.
 */

export const INSTALLED_PACKS_QUERY_KEY = ['me', 'sticker-packs', 'installed'] as const;
export const PACK_CATALOGUE_QUERY_KEY = ['me', 'sticker-packs', 'catalogue'] as const;
export const PACK_SUBMISSIONS_QUERY_KEY = ['me', 'sticker-packs', 'submissions'] as const;
export const packQueryKey = (slug: string) => ['sticker-pack', slug] as const;

/** Cinq minutes : l'utilisateur change ses packs depuis l'écran qui écrit déjà le cache au geste. */
export const PACKS_STALE_TIME = 5 * 60 * 1000;

const WireZone = z.object({
  slot: z.string(),
  label: z.string(),
  box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  defaultText: z.string(),
  maxLength: z.number(),
  maxLines: z.number(),
  minFontSize: z.number(),
  maxFontSize: z.number(),
  color: z.string(),
  weight: z.enum(STICKER_TEXT_WEIGHTS),
  align: z.enum(STICKER_TEXT_ALIGNS),
});

const WireItem = z.object({
  key: z.string(),
  title: z.string(),
  emoji: z.string(),
  kind: z.enum(STICKER_KINDS),
  mimeType: z.string(),
  fileUrl: z.string(),
  width: z.number(),
  height: z.number(),
  zones: z.optional(z.array(WireZone)),
});

const WireSummary = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  builtin: z.boolean(),
  status: z.enum(STICKER_PACK_STATUSES),
  itemCount: z.number(),
  kinds: z.array(z.enum(STICKER_KINDS)),
  coverUrl: z.optional(z.nullable(z.string())),
  installed: z.boolean(),
  installCount: z.number(),
});

const WireDetail = z.extend(WireSummary, {
  items: z.optional(z.array(WireItem)),
  reviewNote: z.optional(z.nullable(z.string())),
});

export function decodePackSummary(raw: unknown): StickerPackSummary | null {
  const parsed = WireSummary.safeParse(raw);
  return parsed.success ? { ...parsed.data, coverUrl: parsed.data.coverUrl ?? null } : null;
}

/** Un pack malformé tombe SEUL ; un sticker malformé aussi, le pack reste. */
export function decodePackDetail(raw: unknown): StickerPackDetail | null {
  const parsed = WireDetail.safeParse(raw);
  if (!parsed.success) return null;
  const { reviewNote, items, ...summary } = parsed.data;
  return {
    ...summary,
    coverUrl: summary.coverUrl ?? null,
    items: (items ?? []).map((item) => ({ ...item, zones: item.zones ?? [] })),
    ...(reviewNote !== undefined ? { reviewNote } : {}),
  };
}

const listOf = <T,>(raw: unknown, decode: (row: unknown) => T | null): readonly T[] =>
  (Array.isArray(raw) ? raw : []).flatMap((row) => {
    const value = decode(row);
    return value === null ? [] : [value];
  });

/** Un pack intégré, tel que le serveur le servirait — ses stickers, le client les dessine. */
export const builtinPackDetail = (slug: string, installed: boolean): StickerPackDetail | null => {
  const pack = BUILTIN_STICKER_PACKS.find((candidate) => candidate.slug === slug);
  if (pack === undefined) return null;
  return {
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
  };
};

/** Ce que la feuille montre avant la première réponse : les packs intégrés installés par défaut. */
export const DEFAULT_INSTALLED_PACKS: readonly StickerPackDetail[] = BUILTIN_STICKER_PACKS.filter((pack) => pack.installedByDefault).flatMap((pack) => {
  const detail = builtinPackDetail(pack.slug, true);
  return detail === null ? [] : [detail];
});

let fixtureChoices = new Map<string, boolean>();
let fixtureSubmissions: readonly StickerPackDetail[] = [];

/** TÉMOIN SEUL — même discipline que `resetFixtureStickersForTests`. */
export function resetFixturePacksForTests(): void {
  fixtureChoices = new Map();
  fixtureSubmissions = [];
}

const fixtureInstalled = (slug: string): boolean =>
  fixtureChoices.get(slug) ?? BUILTIN_STICKER_PACKS.find((pack) => pack.slug === slug)?.installedByDefault ?? false;

type Deps = ConversationsDeps & { readonly signal?: AbortSignal };
const signalOf = (deps: Deps) => (deps.signal === undefined ? {} : { signal: deps.signal });

export async function loadInstalledPacks(deps: Deps): Promise<ApiResult<readonly StickerPackDetail[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return { ok: true, data: BUILTIN_STICKER_PACKS.flatMap((pack) => (fixtureInstalled(pack.slug) ? [builtinPackDetail(pack.slug, true)!] : [])) };
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: stickerPacksEndpoints.installed, ...signalOf(deps) });
  return result.ok ? { ok: true, data: listOf(result.data, decodePackDetail) } : result;
}

export async function loadPackCatalogue(deps: Deps): Promise<ApiResult<readonly StickerPackSummary[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return { ok: true, data: BUILTIN_STICKER_PACKS.map((pack) => builtinPackDetail(pack.slug, fixtureInstalled(pack.slug))!) };
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: stickerPacksEndpoints.root, ...signalOf(deps) });
  return result.ok ? { ok: true, data: listOf(result.data, decodePackSummary) } : result;
}

export async function loadPack(deps: Deps, slug: string): Promise<ApiResult<StickerPackDetail>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const known = fixtureSubmissions.find((pack) => pack.slug === slug) ?? builtinPackDetail(slug, fixtureInstalled(slug));
    return known === null || known === undefined ? { ok: false, status: 404, error: 'Not found', code: 'STICKER_PACK_NOT_FOUND' } : { ok: true, data: known };
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: stickerPacksEndpoints.bySlug(slug), ...signalOf(deps) });
  if (!result.ok) return result;
  const pack = decodePackDetail(result.data);
  return pack === null ? { ok: false, status: 0, error: 'Invalid sticker pack', code: 'DECODE' } : { ok: true, data: pack };
}

export async function setPackInstalled(deps: ConversationsDeps, slug: string, installed: boolean): Promise<ApiResult<StickerPackSummary>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    fixtureChoices = new Map([...fixtureChoices, [slug, installed]]);
    const pack = builtinPackDetail(slug, installed);
    return pack === null ? { ok: false, status: 404, error: 'Not found' } : { ok: true, data: pack };
  }
  const result = await deps.transport.request<unknown>({ method: installed ? 'PUT' : 'DELETE', path: stickerPacksEndpoints.bySlugInstall(slug) });
  if (!result.ok) return result;
  const pack = decodePackSummary(result.data);
  return pack === null ? { ok: false, status: 0, error: 'Invalid sticker pack', code: 'DECODE' } : { ok: true, data: pack };
}

export async function loadMySubmissions(deps: Deps): Promise<ApiResult<readonly StickerPackDetail[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: fixtureSubmissions };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: stickerPacksEndpoints.submissions, ...signalOf(deps) });
  return result.ok ? { ok: true, data: listOf(result.data, decodePackDetail) } : result;
}

/** Une proposition pèse ses images : on laisse au réseau le temps de les monter. */
const SUBMIT_TIMEOUT_MS = 180_000;

export async function submitPack(
  deps: ConversationsDeps,
  params: { readonly manifest: StickerPackManifest; readonly files: ReadonlyMap<string, Blob> },
): Promise<ApiResult<StickerPackDetail>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const pack: StickerPackDetail = {
      slug: params.manifest.slug,
      name: params.manifest.name,
      description: params.manifest.description,
      author: params.manifest.author,
      builtin: false,
      status: 'pending',
      itemCount: params.manifest.items.length,
      kinds: STICKER_KINDS.filter((kind) => params.manifest.items.some((item) => item.kind === kind)),
      coverUrl: null,
      installed: false,
      installCount: 0,
      items: [],
      reviewNote: null,
    };
    fixtureSubmissions = [pack, ...fixtureSubmissions];
    return { ok: true, data: pack };
  }
  const form = new FormData();
  form.append('manifest', JSON.stringify(params.manifest));
  params.files.forEach((blob, name) => form.append('file', blob, name));
  const result = await deps.transport.request<unknown>({ method: 'POST', path: stickerPacksEndpoints.submissions, body: form, timeoutMs: SUBMIT_TIMEOUT_MS });
  if (!result.ok) return result;
  const pack = decodePackDetail(result.data);
  return pack === null ? { ok: false, status: 0, error: 'Invalid sticker pack', code: 'DECODE' } : { ok: true, data: pack };
}
