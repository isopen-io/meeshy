import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';
import type { PackAvailability } from '@meeshy/shared/types/pack-availability';

import { asRecord } from './admin';
import type { ConversationsDeps } from './conversations';
import type { ApiFailure, ApiResult } from './http';

/**
 * **LE PORT DES LENS** (W16, #11322) — les routes de S16 (#11271,
 * `services/gateway/src/routes/packs-lens.ts`) que la vitrine unique ne couvre
 * pas : mes propositions et proposer, le document servi, la file de
 * modération, publier ou refuser, retirer. La boutique, le détail,
 * l'installation et les installées passent par `packs-shop.ts` (domaine
 * `lens`), comme les autres domaines.
 *
 * La revue et le retrait sont gardés par `canModerateContent` côté serveur,
 * fail-closed ; l'écran ne les monte que pour qui la porte. Une lens est
 * gratuite : aucun prix. Le géo-créneau et le crédit attendent la décision du
 * porteur (#11251) : ce port ne les envoie jamais.
 */
export type LensStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | (string & {});

export type LensPack = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly status: LensStatus;
  readonly installed: boolean;
  readonly cost: string | null;
  readonly coverUrl: string | null;
  readonly availability?: PackAvailability;
  readonly reviewNote: string | null;
};

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function availabilityOf(raw: unknown): PackAvailability | undefined {
  const record = asRecord(raw);
  if (record === null) return undefined;
  const startsAt = text(record.startsAt);
  const endsAt = text(record.endsAt);
  if (startsAt === null && endsAt === null) return undefined;
  return { ...(startsAt !== null ? { startsAt } : {}), ...(endsAt !== null ? { endsAt } : {}) };
}

export function decodeLensPack(raw: unknown): LensPack | null {
  const record = asRecord(raw);
  if (record === null || typeof record.slug !== 'string' || record.slug === '' || typeof record.name !== 'string') return null;
  const availability = availabilityOf(record.availability);
  return {
    slug: record.slug,
    name: record.name,
    description: typeof record.description === 'string' ? record.description : '',
    author: typeof record.author === 'string' ? record.author : '',
    status: typeof record.status === 'string' ? record.status : 'pending',
    installed: record.installed === true,
    cost: text(record.cost),
    coverUrl: text(record.coverUrl),
    ...(availability !== undefined ? { availability } : {}),
    reviewNote: text(record.reviewNote),
  };
}

const decodeFailure: ApiFailure = { ok: false, status: 0, error: 'Invalid lens', code: 'DECODE' };

const listOf = (result: ApiResult<unknown>): ApiResult<readonly LensPack[]> => {
  if (!result.ok) return result;
  return Array.isArray(result.data) ? { ok: true, data: result.data.flatMap((entry) => decodeLensPack(entry) ?? []) } : decodeFailure;
};

const oneOf = (result: ApiResult<unknown>): ApiResult<LensPack> => {
  if (!result.ok) return result;
  const pack = decodeLensPack(result.data);
  return pack === null ? decodeFailure : { ok: true, data: pack };
};

export const LENS_SUBMISSIONS_QUERY_KEY = ['packs', 'lens', 'submissions'] as const;
export const LENS_PENDING_QUERY_KEY = ['admin', 'lens', 'pending'] as const;
export const LENS_PUBLISHED_QUERY_KEY = ['admin', 'lens', 'published'] as const;

export const loadLensSubmissions = async (deps: ConversationsDeps): Promise<ApiResult<readonly LensPack[]>> =>
  listOf(await deps.transport.request<unknown>({ method: 'GET', path: packsEndpoints.lensSubmissions }));

/** Les fichiers que les couches nomment, en base64, sous leur adresse `<sha16>.<ext>`. */
export type LensSubmission = { readonly document: unknown; readonly assets: Readonly<Record<string, string>> };

export const submitLens = async (deps: ConversationsDeps, submission: LensSubmission): Promise<ApiResult<LensPack>> =>
  oneOf(await deps.transport.request<unknown>({ method: 'POST', path: packsEndpoints.lensSubmissions, body: submission }));

/** Le document servi, brut : le lecteur le relit par `parseLens`, jamais tel quel. */
export const loadLensDocument = (deps: ConversationsDeps, slug: string): Promise<ApiResult<unknown>> =>
  deps.transport.request<unknown>({ method: 'GET', path: packsEndpoints.lensBySlugDocument(slug) });

export const loadLensPending = async (deps: ConversationsDeps): Promise<ApiResult<readonly LensPack[]>> =>
  listOf(await deps.transport.request<unknown>({ method: 'GET', path: packsEndpoints.lensPending }));

/** Les lens publiées, offertes maintenant : la boutique du domaine, que la modération relit pour retirer. */
export const loadPublishedLenses = async (deps: ConversationsDeps): Promise<ApiResult<readonly LensPack[]>> =>
  listOf(await deps.transport.request<unknown>({ method: 'GET', path: packsEndpoints.lens }));

export type LensReview =
  | {
      readonly decision: 'approve';
      readonly note?: string;
      readonly window?: { readonly startsAt: string; readonly endsAt: string };
      readonly communities?: readonly string[];
    }
  | { readonly decision: 'reject'; readonly note?: string };

export const reviewLens = async (deps: ConversationsDeps, slug: string, review: LensReview): Promise<ApiResult<LensPack>> =>
  oneOf(await deps.transport.request<unknown>({ method: 'POST', path: packsEndpoints.lensBySlugReview(slug), body: review }));

export const withdrawLens = async (deps: ConversationsDeps, slug: string, note?: string): Promise<ApiResult<LensPack>> =>
  oneOf(
    await deps.transport.request<unknown>({
      method: 'POST',
      path: packsEndpoints.lensBySlugWithdraw(slug),
      body: note === undefined || note.trim() === '' ? {} : { note: note.trim() },
    }),
  );

/**
 * Rétablir une lens RETIRÉE (#12321, `canModerateContent`) : elle revient
 * publiée. Ses installations retirées ne reviennent pas — chacun la réinstalle.
 */
export const restoreLens = async (deps: ConversationsDeps, slug: string, note?: string): Promise<ApiResult<LensPack>> =>
  oneOf(
    await deps.transport.request<unknown>({
      method: 'POST',
      path: packsEndpoints.lensBySlugRestore(slug),
      body: note === undefined || note.trim() === '' ? {} : { note: note.trim() },
    }),
  );
