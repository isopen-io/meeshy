import * as z from 'zod/mini';

import { PACK_LANGUAGES, type PackLanguage, type PackNames } from '@meeshy/shared/types/content-pack';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * **LE PORT GÉNÉRIQUE DES PACKS** (#10149, LP1) — boutique, packs installés,
 * détail et installation, les MÊMES gestes pour chaque domaine. Un domaine se
 * déclare par un `PackPort` (ses adresses, ses décodeurs) ; les stickers
 * gardent leur façade (`sticker-packs.ts`, adresses `/sticker-packs` et formes
 * inchangées), les cadres de gloire s'adressent à `/packs/glory-frame`.
 *
 * Fail-closed PAR PACK : un pack malformé tombe seul, la liste reste. Un
 * ANCIEN serveur, qui ne connaît pas `/packs/…`, répond 404 : pour un domaine
 * neuf (`absentMeansEmpty`), c'est une boutique VIDE, jamais une erreur.
 */

export type PackPort<Summary, Installed, Detail> = {
  readonly catalogue: string;
  readonly installed: string;
  readonly bySlug: (slug: string) => string;
  readonly install: (slug: string) => string;
  readonly decodeSummary: (raw: unknown) => Summary | null;
  readonly decodeInstalled: (raw: unknown) => Installed | null;
  readonly decodeDetail: (raw: unknown) => Detail | null;
  /** 404 sur la liste ⇒ liste vide : le serveur ne connaît pas encore ce domaine. */
  readonly absentMeansEmpty: boolean;
};

export type PackDeps = ConversationsDeps & { readonly signal?: AbortSignal };
const signalOf = (deps: PackDeps) => (deps.signal === undefined ? {} : { signal: deps.signal });

const WireName = z.object({ name: z.string(), description: z.string() });

const isPackLanguage = (value: string): value is PackLanguage => (PACK_LANGUAGES as readonly string[]).includes(value);

/** Les `names` d'un pack, quel que soit son domaine : une langue de l'interface, bien formée, ou rien — jamais une clé étrangère. */
export const decodePackNames = (raw: Readonly<Record<string, unknown>> | undefined): PackNames =>
  Object.fromEntries(
    Object.entries(raw ?? {}).flatMap(([language, value]) => {
      const parsed = WireName.safeParse(value);
      return isPackLanguage(language) && parsed.success ? [[language, parsed.data]] : [];
    }),
  );

export const listOf = <T,>(raw: unknown, decode: (row: unknown) => T | null): readonly T[] =>
  (Array.isArray(raw) ? raw : []).flatMap((row) => {
    const value = decode(row);
    return value === null ? [] : [value];
  });

const decodeFailure = { ok: false, status: 0, error: 'Invalid pack', code: 'DECODE' } as const;

async function loadList<T>(deps: PackDeps, path: string, decode: (raw: unknown) => T | null, absentMeansEmpty: boolean): Promise<ApiResult<readonly T[]>> {
  const result = await deps.transport.request<unknown>({ method: 'GET', path, ...signalOf(deps) });
  if (result.ok) return { ok: true, data: listOf(result.data, decode) };
  return absentMeansEmpty && result.status === 404 ? { ok: true, data: [] } : result;
}

export const loadCatalogueOf = <S, I, D>(port: PackPort<S, I, D>, deps: PackDeps): Promise<ApiResult<readonly S[]>> =>
  loadList(deps, port.catalogue, port.decodeSummary, port.absentMeansEmpty);

export const loadInstalledOf = <S, I, D>(port: PackPort<S, I, D>, deps: PackDeps): Promise<ApiResult<readonly I[]>> =>
  loadList(deps, port.installed, port.decodeInstalled, port.absentMeansEmpty);

export async function loadDetailOf<S, I, D>(port: PackPort<S, I, D>, deps: PackDeps, slug: string): Promise<ApiResult<D>> {
  const result = await deps.transport.request<unknown>({ method: 'GET', path: port.bySlug(slug), ...signalOf(deps) });
  if (!result.ok) return result;
  const detail = port.decodeDetail(result.data);
  return detail === null ? decodeFailure : { ok: true, data: detail };
}

export async function setInstalledOf<S, I, D>(port: PackPort<S, I, D>, deps: ConversationsDeps, slug: string, installed: boolean): Promise<ApiResult<S>> {
  const result = await deps.transport.request<unknown>({ method: installed ? 'PUT' : 'DELETE', path: port.install(slug) });
  if (!result.ok) return result;
  const pack = port.decodeSummary(result.data);
  return pack === null ? decodeFailure : { ok: true, data: pack };
}

/** Le `requestId` d'un achat, généré AU GESTE : 36 caractères `[A-Za-z0-9_-]` (contrat 8–64 du serveur). */
export const newPurchaseRequestId = (): string => `buy-${crypto.randomUUID().replaceAll('-', '')}`;

/**
 * **UN GESTE EN VOL PAR PACK** — un double toucher sur « Installer » ne part
 * qu'une fois : tant que la réponse du premier n'est pas revenue, le second
 * est ignoré. Un autre pack, lui, n'attend personne.
 */
export type PackGestureGuard = { readonly tryBegin: (slug: string) => boolean; readonly end: (slug: string) => void };

export function createPackGestureGuard(): PackGestureGuard {
  const flying = new Set<string>();
  return {
    tryBegin: (slug) => {
      if (flying.has(slug)) return false;
      flying.add(slug);
      return true;
    },
    end: (slug) => {
      flying.delete(slug);
    },
  };
}
