import { parseLens } from '@meeshy/shared/types/lens-format';
import { isLensCostDeclaredHonestly, LENS_PACK_LIMITS, lensAssetRefs, measureLensCost } from '@meeshy/shared/types/lens-pack';

import type { LensSubmission } from '@/lib/api/lens-packs';

/**
 * **PROPOSER UNE LENS : LA PRÉPARATION** (W16, #11322) — loi pure, l'empreinte
 * injectée. Le document se relit par `parseLens`, la même loi que le serveur.
 * Chaque fichier choisi prend son adresse `<sha16>.<ext>` (les 16 premiers
 * caractères de son SHA-256), celle que les couches nomment ; seuls les fichiers
 * nommés partent. Ce qui serait refusé l'est AVANT le réseau, en disant lequel :
 * un fichier nommé absent, un coût déclaré sous le coût mesuré, une limite de
 * `LENS_PACK_LIMITS`. Le serveur reste juge (ré-encodage, 422).
 */
export type Digest = (bytes: Uint8Array) => Promise<string>;

export type SubmissionRefusal =
  | 'invalid'
  | 'update-required'
  | 'forbidden'
  | 'missing-asset'
  | 'cost-understated'
  | 'too-large'
  | 'too-many';

export type PreparedSubmission =
  | { readonly ok: true; readonly submission: LensSubmission; readonly name: string }
  | { readonly ok: false; readonly reason: SubmissionRefusal; readonly detail?: string };

const EXTENSIONS: ReadonlySet<string> = new Set(['webp', 'png', 'json']);

const toHex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

export const browserDigest: Digest = async (bytes) => toHex(await crypto.subtle.digest('SHA-256', bytes));

const extensionOf = (name: string): string => (name.split('.').pop() ?? '').toLowerCase();

const base64Of = (bytes: Uint8Array): string => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

type Named = { readonly address: string; readonly bytes: Uint8Array };

async function addressed(files: readonly File[], digest: Digest): Promise<readonly Named[]> {
  return Promise.all(
    files.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { address: `${(await digest(bytes)).slice(0, 16)}.${extensionOf(file.name)}`, bytes };
    }),
  );
}

export async function prepareLensSubmission(params: {
  readonly documentText: string;
  readonly files: readonly File[];
  readonly digest?: Digest;
}): Promise<PreparedSubmission> {
  if (new TextEncoder().encode(params.documentText).length > LENS_PACK_LIMITS.maxDocumentBytes) return { ok: false, reason: 'too-large', detail: 'document' };
  const document = parseJson(params.documentText);
  const parsed = parseLens(document);
  if (parsed.status === 'update-required') return { ok: false, reason: 'update-required' };
  if (parsed.status === 'forbidden') return { ok: false, reason: 'forbidden', detail: parsed.reasons.join(', ') };
  if (parsed.status !== 'ok') return { ok: false, reason: 'invalid' };
  const { lens } = parsed;
  const measured = measureLensCost(lens);
  if (!isLensCostDeclaredHonestly(lens.cost, measured)) return { ok: false, reason: 'cost-understated', detail: measured };

  const usable = params.files.filter((file) => EXTENSIONS.has(extensionOf(file.name)));
  const oversized = usable.find((file) => file.size > LENS_PACK_LIMITS.maxAssetBytes);
  if (oversized !== undefined) return { ok: false, reason: 'too-large', detail: oversized.name };

  const named = await addressed(usable, params.digest ?? browserDigest);
  const refs = lensAssetRefs(lens);
  const missing = refs.find((ref) => !named.some((file) => file.address === ref));
  if (missing !== undefined) return { ok: false, reason: 'missing-asset', detail: missing };
  const sent = refs.map((ref) => named.find((file) => file.address === ref) as Named);
  if (sent.length > LENS_PACK_LIMITS.maxAssets) return { ok: false, reason: 'too-many' };
  if (sent.reduce((total, file) => total + file.bytes.length, 0) > LENS_PACK_LIMITS.maxTotalAssetBytes) return { ok: false, reason: 'too-large', detail: 'total' };

  return {
    ok: true,
    name: lens.name,
    submission: { document, assets: Object.fromEntries(sent.map((file) => [file.address, base64Of(file.bytes)])) },
  };
}

export type ServerRefusal = SubmissionRefusal | 'slug-taken' | 'too-many-pending' | 'asset-refused' | 'failed';

const SERVER_CODES: Readonly<Record<string, ServerRefusal>> = {
  LENS_INVALID: 'invalid',
  LENS_FORBIDDEN: 'forbidden',
  LENS_UPDATE_REQUIRED: 'update-required',
  LENS_COST_UNDERSTATED: 'cost-understated',
  LENS_ASSET_REFUSED: 'asset-refused',
  LENS_SLUG_TAKEN: 'slug-taken',
  LENS_TOO_MANY_PENDING: 'too-many-pending',
};

/** Le refus de la passerelle (`packs-lens.ts`, `LENS_PACK_ERROR_CODES`), dit par sa cause ; tout autre échec est générique. */
export const serverRefusalOf = (code: string | undefined): ServerRefusal => (code === undefined ? 'failed' : (SERVER_CODES[code] ?? 'failed'));
