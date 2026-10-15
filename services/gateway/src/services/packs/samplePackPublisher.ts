/**
 * Publier le pack de stickers D'EXEMPLE par le VRAI circuit (#10157, demande
 * porteur 2026-10-11) — proposition multipart (`POST /sticker-packs/submissions`)
 * puis publication par un modérateur (`POST /sticker-packs/:slug/review`), comme
 * le ferait un tiers. Aucune écriture en base, aucune route de contournement :
 * si le pack apparaît dans la boutique, c'est que le circuit de bout en bout
 * fonctionne.
 *
 * Idempotent : un pack déjà publié ne refait rien ; un pack en attente n'est que
 * publié. Refuse toute passerelle qui n'est ni le staging ni une machine locale
 * (« rien de fictif en production »), et ne suit aucune redirection : les
 * identifiants ne partent que vers l'hôte vérifié.
 *
 * FAÇADE : `scripts/publish-sample-sticker-pack.ts`.
 */
import type { StickerPackManifest } from '@meeshy/shared/types/sticker-pack';

export const SAMPLE_STICKER_PACK_SLUG = 'exemple-meeshy';

const ALLOWED_REMOTE_HOSTS = new Set(['gate.staging.meeshy.me']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** La passerelle visée, si elle est le staging (https) ou une machine locale ; sinon une erreur, avant tout appel. */
export function assertSamplePublishTarget(baseUrl: string): URL {
  const url = new URL(baseUrl);
  const remoteOk = url.protocol === 'https:' && ALLOWED_REMOTE_HOSTS.has(url.hostname);
  const localOk = (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTS.has(url.hostname);
  if (!remoteOk && !localOk) throw new Error(`Passerelle refusée : ${url.hostname} n'est ni le staging ni une machine locale.`);
  return url;
}

/** Les quatre stickers d'exemple — nos propres dessins, en WebP sous `services/gateway/assets/sample-sticker-pack` (les `MeeStickers` du SDK sont passés en `.lottie`). */
export const SAMPLE_STICKER_FILES = [
  { key: 'coucou', title: 'Coucou', emoji: '👋', file: 'mee.duo-coucou.webp' },
  { key: 'bravo', title: 'Bravo', emoji: '👏', file: 'mee.duo-bravo.webp' },
  { key: 'bonne-nuit', title: 'Bonne nuit', emoji: '🌙', file: 'mee.duo-bonne-nuit.webp' },
  { key: 'a-bientot', title: 'À bientôt', emoji: '🙌', file: 'mee.duo-a-bientot.webp' },
] as const;

export const sampleStickerPackManifest = (): StickerPackManifest => ({
  slug: SAMPLE_STICKER_PACK_SLUG,
  name: 'Exemple · Meeshy',
  description: 'Pack d’exemple du staging : Mee et Meo se saluent, s’applaudissent et se souhaitent bonne nuit.',
  author: 'Meeshy',
  items: SAMPLE_STICKER_FILES.map(({ key, title, emoji, file }) => ({ key, title, emoji, kind: 'cinematic' as const, asset: file })),
});

export type Credentials = { readonly username: string; readonly password: string };

export type PublishSamplePackDeps = {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly readAsset: (file: string) => Promise<Uint8Array>;
  readonly submitter: Credentials;
  readonly reviewer: Credentials;
};

export type PublishOutcome = 'already-published' | 'published';

type Envelope = { readonly success?: boolean; readonly data?: Record<string, unknown>; readonly code?: string; readonly message?: string };

async function call(deps: PublishSamplePackDeps, path: string, init: RequestInit): Promise<{ readonly status: number; readonly body: Envelope }> {
  const response = await deps.fetch(new URL(`/api/v1${path}`, deps.baseUrl), { ...init, redirect: 'error' });
  const body = (await response.json().catch(() => ({}))) as Envelope;
  return { status: response.status, body };
}

async function login(deps: PublishSamplePackDeps, credentials: Credentials): Promise<string> {
  const { status, body } = await call(deps, '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const token = body.data?.token;
  if (status !== 200 || typeof token !== 'string') throw new Error(`Connexion refusée (${status}${body.code ? ` ${body.code}` : ''}).`);
  return token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function currentStatus(deps: PublishSamplePackDeps, token: string): Promise<string | null> {
  const { status, body } = await call(deps, `/sticker-packs/${SAMPLE_STICKER_PACK_SLUG}`, { method: 'GET', headers: bearer(token) });
  if (status === 404) return null;
  if (status !== 200) throw new Error(`Lecture du pack impossible (${status}).`);
  return typeof body.data?.status === 'string' ? body.data.status : null;
}

async function submit(deps: PublishSamplePackDeps, token: string): Promise<'submitted' | 'taken'> {
  const form = new FormData();
  form.append('manifest', JSON.stringify(sampleStickerPackManifest()));
  const images = await Promise.all(SAMPLE_STICKER_FILES.map(async ({ file }) => ({ file, bytes: await deps.readAsset(file) })));
  images.forEach(({ file, bytes }) => form.append(file, new Blob([Uint8Array.from(bytes)], { type: 'image/webp' }), file));
  const { status, body } = await call(deps, '/sticker-packs/submissions', { method: 'POST', headers: bearer(token), body: form });
  if (status === 201) return 'submitted';
  if (status === 409 && body.code === 'STICKER_PACK_SLUG_TAKEN') return 'taken';
  throw new Error(`Proposition refusée (${status}${body.code ? ` ${body.code}` : ''}${body.message ? ` : ${body.message}` : ''}).`);
}

async function approve(deps: PublishSamplePackDeps): Promise<void> {
  const token = await login(deps, deps.reviewer);
  const { status, body } = await call(deps, `/sticker-packs/${SAMPLE_STICKER_PACK_SLUG}/review`, {
    method: 'POST',
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approve', note: 'Pack d’exemple du staging (#10157).' }),
  });
  if (status !== 200 || body.data?.status !== 'approved') throw new Error(`Publication refusée (${status}${body.code ? ` ${body.code}` : ''}).`);
}

/** Propose (si besoin) puis publie le pack d'exemple ; ne refait rien s'il est déjà publié. */
export async function publishSampleStickerPack(deps: PublishSamplePackDeps): Promise<PublishOutcome> {
  assertSamplePublishTarget(deps.baseUrl);
  const token = await login(deps, deps.submitter);
  const status = await currentStatus(deps, token);
  if (status === 'approved') return 'already-published';
  if (status !== 'pending') await submit(deps, token);
  await approve(deps);
  return 'published';
}
