import * as z from 'zod/mini';

import {
  STICKER_MIME_TYPES,
  STICKER_ORIGINS,
  type StickerDefinition,
  type StickerOrigin,
} from '@meeshy/shared/types/sticker-definition';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * **LE PORT DE « MES STICKERS »** (#7938) — `/api/v1/me/stickers`
 * (`services/gateway/src/routes/me/stickers.ts`). La DÉFINITION servie est
 * celle de `@meeshy/shared/types/sticker-definition` ; ce port la décode
 * (`zod/mini`) et n'en invente aucune seconde forme.
 *
 * La clé vit sous `['me']` : une déconnexion qui vide la famille vide aussi
 * la bibliothèque, et aucune autre personne ne la modifie — l'écran l'écrit
 * au geste (création, retrait), le réseau confirme.
 */

export const STICKERS_QUERY_KEY = ['me', 'stickers'] as const;

/** Cinq minutes : seul le porteur modifie sa bibliothèque, et il le fait depuis
 * l'écran qui écrit déjà le cache au geste. */
export const STICKERS_STALE_TIME = 5 * 60 * 1000;

const WireSticker = z.object({
  id: z.string(),
  name: z.optional(z.nullable(z.string())),
  origin: z.enum(STICKER_ORIGINS),
  mimeType: z.enum(STICKER_MIME_TYPES),
  fileUrl: z.string(),
  width: z.number(),
  height: z.number(),
  sizeBytes: z.number(),
  animated: z.boolean(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
});

/** Une ligne malformée tombe SEULE — la bibliothèque reste lisible. */
export function decodeSticker(raw: unknown): StickerDefinition | null {
  const parsed = WireSticker.safeParse(raw);
  if (!parsed.success) return null;
  return { ...parsed.data, name: parsed.data.name ?? null };
}

let fixtureStickers: readonly StickerDefinition[] = [];

/** TÉMOIN SEUL — même discipline que `resetSentMessagesForTests`. */
export function resetFixtureStickersForTests(): void {
  fixtureStickers = [];
}

export async function loadMyStickers(
  deps: ConversationsDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly StickerDefinition[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: fixtureStickers };
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path: '/api/v1/me/stickers',
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  });
  if (!result.ok) return result;
  const stickers = (Array.isArray(result.data) ? result.data : []).flatMap((raw) => {
    const sticker = decodeSticker(raw);
    return sticker === null ? [] : [sticker];
  });
  return { ok: true, data: stickers };
}

/** Un sticker se crée en une requête : l'image SOURCE part telle que le client
 * l'a préparée (`lib/stickers/prepare.ts`), la passerelle la normalise. */
const CREATE_TIMEOUT_MS = 60_000;

export async function createSticker(
  deps: ConversationsDeps,
  params: { readonly file: Blob; readonly origin: StickerOrigin; readonly name?: string },
): Promise<ApiResult<StickerDefinition>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const now = new Date().toISOString();
    const sticker: StickerDefinition = {
      id: `fixture-sticker-${fixtureStickers.length + 1}`,
      name: params.name ?? null,
      origin: params.origin,
      mimeType: params.file.type === 'image/gif' ? 'image/gif' : 'image/png',
      fileUrl: URL.createObjectURL(params.file),
      width: 512,
      height: 512,
      sizeBytes: params.file.size,
      animated: false,
      createdAt: now,
      lastUsedAt: now,
    };
    fixtureStickers = [sticker, ...fixtureStickers];
    return { ok: true, data: sticker };
  }
  const form = new FormData();
  form.append('origin', params.origin);
  if (params.name !== undefined && params.name.trim() !== '') form.append('name', params.name);
  form.append('file', params.file, params.file instanceof File ? params.file.name : 'sticker');
  const result = await deps.transport.request<unknown>({
    method: 'POST',
    path: '/api/v1/me/stickers',
    body: form,
    timeoutMs: CREATE_TIMEOUT_MS,
  });
  if (!result.ok) return result;
  const sticker = decodeSticker(result.data);
  return sticker === null ? { ok: false, status: 0, error: 'Invalid sticker', code: 'DECODE' } : { ok: true, data: sticker };
}

export async function deleteSticker(deps: ConversationsDeps, stickerId: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    fixtureStickers = fixtureStickers.filter((s) => s.id !== stickerId);
    return { ok: true, data: { id: stickerId, removed: true } };
  }
  return deps.transport.request<unknown>({ method: 'DELETE', path: `/api/v1/me/stickers/${stickerId}` });
}

export async function markStickerUsed(deps: ConversationsDeps, stickerId: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: null };
  return deps.transport.request<unknown>({ method: 'POST', path: `/api/v1/me/stickers/${stickerId}/use` });
}

/** La bibliothèque réordonnée À L'INSTANT du geste : le sticker utilisé passe
 * en tête, les autres gardent leur ordre. Pure — l'écran l'applique au cache. */
export function withStickerFirst(
  list: readonly StickerDefinition[],
  sticker: StickerDefinition,
): readonly StickerDefinition[] {
  return [sticker, ...list.filter((s) => s.id !== sticker.id)];
}
